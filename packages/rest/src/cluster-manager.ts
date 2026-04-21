import type {
  ClusterStateSummary,
  DeviceState,
  EventHistoryEntry,
  IoTAppConfig,
  RuntimeNodeSummary,
  RuntimeNodeRole,
} from '@gortjs/contracts';
import { createTimestamp } from '@gortjs/contracts';
import type { IoTApp } from '@gortjs/core';

type RegisteredNode = RuntimeNodeSummary & {
  devices: DeviceState[];
};

export class ClusterManager {
  private readonly nodes = new Map<string, RegisteredNode>();
  private readonly recentEvents: Array<{ nodeId: string; eventName: string; timestamp: string }> = [];
  private heartbeatTimer?: NodeJS.Timeout;
  private syncScheduled = false;
  private eventCleanup?: () => void;
  private controlPlaneReachable?: boolean;
  private lastControlPlaneSyncAt?: string;
  private lastControlPlaneError?: string;

  constructor(
    private readonly params: {
      app: IoTApp;
      config: IoTAppConfig;
      getLocalUrl: () => string | undefined;
    },
  ) {
    const self = this.buildLocalNodeSummary('local');
    this.nodes.set(self.nodeId, {
      ...self,
      devices: this.params.app.getDevices(),
    });

    for (const remote of this.params.config.runtime?.cluster?.remotes ?? []) {
      this.nodes.set(remote.nodeId, {
        nodeId: remote.nodeId,
        role: remote.role ?? 'node',
        url: remote.url,
        status: 'unknown',
        lastSeenAt: createTimestamp(),
        deviceIds: [],
        devices: [],
        source: 'static',
      });
    }
  }

  async start(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.registerWithControlPlane();
    if (this.params.config.runtime?.cluster?.syncState !== false) {
      this.scheduleStateSync();
    }

    this.eventCleanup = this.params.app.on('*', (entry) => {
      const historyEntry = entry as EventHistoryEntry;
      this.recordRemoteEvent({
        nodeId: this.getNodeId(),
        eventName: historyEntry.eventName,
        timestamp: historyEntry.timestamp,
      });
      this.scheduleStateSync();
      void this.syncEvent(historyEntry);
    });

    const heartbeatIntervalMs = this.params.config.runtime?.cluster?.heartbeatIntervalMs ?? 15_000;
    this.heartbeatTimer = setInterval(() => {
      void this.registerWithControlPlane();
    }, heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.eventCleanup?.();
    this.eventCleanup = undefined;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  isEnabled(): boolean {
    return this.params.config.runtime?.cluster?.enabled !== false;
  }

  getNodeId(): string {
    return this.params.config.runtime?.cluster?.nodeId ?? 'local-node';
  }

  getRole(): RuntimeNodeRole {
    return this.params.config.runtime?.cluster?.role ?? 'standalone';
  }

  getClusterState(): ClusterStateSummary {
    return {
      enabled: this.isEnabled(),
      nodeId: this.getNodeId(),
      role: this.getRole(),
      controlPlaneUrl: this.params.config.runtime?.cluster?.controlPlaneUrl,
      remoteCommandRouting: this.params.config.runtime?.cluster?.remoteCommandRouting !== false,
      controlPlaneReachable: this.controlPlaneReachable,
      lastControlPlaneSyncAt: this.lastControlPlaneSyncAt,
      lastControlPlaneError: this.lastControlPlaneError,
      nodes: Array.from(this.nodes.values()).map(({ devices: _devices, ...node }) => node),
      recentEvents: [...this.recentEvents],
    };
  }

  listNodes(): RuntimeNodeSummary[] {
    return this.getClusterState().nodes;
  }

  registerNode(node: RuntimeNodeSummary & { devices?: DeviceState[] }): void {
    this.nodes.set(node.nodeId, {
      ...node,
      devices: node.devices ?? this.nodes.get(node.nodeId)?.devices ?? [],
    });
  }

  recordRemoteEvent(entry: { nodeId: string; eventName: string; timestamp: string; payload?: unknown }): void {
    this.recentEvents.push({
      nodeId: entry.nodeId,
      eventName: entry.eventName,
      timestamp: entry.timestamp,
    });

    if (this.recentEvents.length > 100) {
      this.recentEvents.splice(0, this.recentEvents.length - 100);
    }
  }

  scheduleStateSync(): void {
    if (this.syncScheduled) {
      return;
    }

    this.syncScheduled = true;
    setTimeout(() => {
      this.syncScheduled = false;
      void this.registerWithControlPlane();
    }, 150);
  }

  async routeCommand(deviceId: string, command: string, payload: Record<string, unknown> = {}): Promise<{
    ok: boolean;
    state?: unknown;
    routedTo?: string;
    error?: string;
  }> {
    if (this.params.app.hasDevice(deviceId)) {
      return { ok: false, error: 'Device is local to this runtime' };
    }

    await this.refreshNodesFromControlPlane();
    const target = Array.from(this.nodes.values()).find((node) => node.nodeId !== this.getNodeId() && node.deviceIds.includes(deviceId));
    if (!target?.url) {
      return { ok: false, error: `No remote node registered for device '${deviceId}'` };
    }

    const response = await fetch(`${target.url}/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      headers: this.createJsonHeaders(),
      body: JSON.stringify({ command, payload }),
    });

    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        routedTo: target.nodeId,
        error: typeof body.error === 'string' ? body.error : `Remote node responded with ${response.status}`,
      };
    }

    return {
      ok: true,
      routedTo: target.nodeId,
      state: body.state,
    };
  }

  async syncEvent(entry: EventHistoryEntry): Promise<void> {
    if (!this.shouldSyncEvents()) {
      return;
    }

    const controlPlaneUrl = this.params.config.runtime?.cluster?.controlPlaneUrl;
    if (!controlPlaneUrl) {
      return;
    }

    try {
      const response = await fetch(`${controlPlaneUrl}/cluster/events`, {
        method: 'POST',
        headers: this.createJsonHeaders(),
        body: JSON.stringify({
          nodeId: this.getNodeId(),
          entry,
        }),
      });
      this.recordControlPlaneStatus(response.ok, response.ok ? undefined : `Control plane responded with ${response.status}`);
    } catch (error) {
      this.recordControlPlaneStatus(false, this.formatError(error));
    }
  }

  private shouldSyncEvents(): boolean {
    return this.isEnabled() && this.params.config.runtime?.cluster?.syncEvents !== false;
  }

  private async registerWithControlPlane(): Promise<void> {
    const controlPlaneUrl = this.params.config.runtime?.cluster?.controlPlaneUrl;
    if (!this.isEnabled() || !controlPlaneUrl || this.getRole() === 'control-plane') {
      this.recordControlPlaneStatus(undefined, undefined);
      this.nodes.set(this.getNodeId(), {
        ...this.buildLocalNodeSummary('local'),
        devices: this.params.app.getDevices(),
      });
      return;
    }

    try {
      const response = await fetch(`${controlPlaneUrl}/cluster/nodes/register`, {
        method: 'POST',
        headers: this.createJsonHeaders(),
        body: JSON.stringify({
          ...this.buildLocalNodeSummary('local'),
          devices: this.params.app.getDevices(),
        }),
      });

      if (response.ok) {
        const body = await response.json() as { nodes?: Array<RuntimeNodeSummary & { devices?: DeviceState[] }> };
        for (const node of body.nodes ?? []) {
          this.registerNode(node);
        }
        this.recordControlPlaneStatus(true, undefined);
        return;
      }

      this.recordControlPlaneStatus(false, `Control plane responded with ${response.status}`);
    } catch (error) {
      this.recordControlPlaneStatus(false, this.formatError(error));
    }
  }

  private async refreshNodesFromControlPlane(): Promise<void> {
    const controlPlaneUrl = this.params.config.runtime?.cluster?.controlPlaneUrl;
    if (!controlPlaneUrl) {
      return;
    }

    try {
      const response = await fetch(`${controlPlaneUrl}/cluster/nodes`, {
        headers: this.createHeaders(),
      });
      if (!response.ok) {
        this.recordControlPlaneStatus(false, `Control plane responded with ${response.status}`);
        return;
      }

      const body = await response.json() as { nodes?: Array<RuntimeNodeSummary & { devices?: DeviceState[] }> };
      for (const node of body.nodes ?? []) {
        this.registerNode(node);
      }
      this.recordControlPlaneStatus(true, undefined);
    } catch (error) {
      this.recordControlPlaneStatus(false, this.formatError(error));
      return;
    }
  }

  private buildLocalNodeSummary(source: 'local' | 'remote' | 'static'): RegisteredNode {
    const status = this.params.app.getStatus();
    const url = this.params.config.runtime?.cluster?.advertisedUrl ?? this.params.getLocalUrl();
    const devices = this.params.app.getDevices();
    return {
      nodeId: this.getNodeId(),
      role: this.getRole(),
      url,
      status,
      lastSeenAt: createTimestamp(),
      deviceIds: devices.map((device) => device.id),
      devices,
      timeZone: this.params.app.getTimeZone(),
      source,
    };
  }

  private createHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = this.params.config.runtime?.cluster?.sharedToken;
    if (token) {
      headers['x-gort-cluster-token'] = token;
    }

    return headers;
  }

  private createJsonHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...this.createHeaders(),
    };
  }

  private recordControlPlaneStatus(reachable?: boolean, error?: string): void {
    this.controlPlaneReachable = reachable;
    this.lastControlPlaneSyncAt = createTimestamp();
    this.lastControlPlaneError = error;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
