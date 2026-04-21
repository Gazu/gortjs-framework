import { EventSerializer, createTimestamp, type EventHistoryEntry, type IoTAppConfig, type RuntimeEventAdapterStatus } from '@gortjs/contracts';
import type { Cleanup } from '@gortjs/contracts';
import type { IoTApp } from '@gortjs/core';
import { createClient } from 'redis';

type RedisClientLike = ReturnType<typeof createClient>;

export class RuntimeEventBridge {
  private readonly adapterStatuses: RuntimeEventAdapterStatus[] = [];
  private cleanup?: Cleanup;
  private redisClients: RedisClientLike[] = [];

  constructor(
    private readonly params: {
      app: IoTApp;
      config: IoTAppConfig;
      nodeId: string;
      ingestEvent: (eventName: string, payload: unknown, sourceNodeId?: string) => void;
    },
  ) {}

  async start(): Promise<void> {
    const adapters = this.params.config.runtime?.events?.adapters ?? [];
    this.adapterStatuses.splice(0, this.adapterStatuses.length);

    for (const adapter of adapters) {
      const direction = adapter.direction ?? 'outbound';
      if (adapter.enabled === false) {
        this.adapterStatuses.push({
          type: adapter.type,
          direction,
          enabled: false,
          healthy: true,
          target: adapter.target ?? adapter.channel ?? adapter.topic,
          note: 'disabled by config',
        });
        continue;
      }

      if (adapter.type === 'mqtt') {
        this.adapterStatuses.push({
          type: 'mqtt',
          direction,
          enabled: true,
          healthy: false,
          target: adapter.target ?? adapter.topic,
          note: 'MQTT transport contract is defined in 0.7.0, but this runtime build does not bundle an MQTT client yet',
        });
        continue;
      }

      if (adapter.type === 'redis' && adapter.target) {
        await this.attachRedisAdapter(adapter.target, adapter.channel ?? 'gortjs:events', direction);
        continue;
      }

      this.adapterStatuses.push({
        type: adapter.type,
        direction,
        enabled: true,
        healthy: true,
        target: adapter.target,
      });
    }

    this.cleanup = this.params.app.on('*', (entry) => {
      void this.forward(entry as EventHistoryEntry);
    });
  }

  async stop(): Promise<void> {
    this.cleanup?.();
    this.cleanup = undefined;

    for (const client of this.redisClients) {
      if (client.isOpen) {
        await client.quit();
      }
    }
    this.redisClients = [];
  }

  getStatuses(): RuntimeEventAdapterStatus[] {
    return [...this.adapterStatuses];
  }

  private async forward(entry: EventHistoryEntry): Promise<void> {
    const adapters = this.params.config.runtime?.events?.adapters ?? [];
    await Promise.all(adapters.map(async (adapter, index) => {
      if (adapter.enabled === false) {
        return;
      }

      const direction = adapter.direction ?? 'outbound';
      if (!['outbound', 'both'].includes(direction)) {
        return;
      }

      try {
        if (adapter.type === 'webhook' && adapter.target) {
          await fetch(adapter.target, {
            method: 'POST',
            headers: this.createWebhookHeaders(adapter.headers, adapter.token),
            body: EventSerializer.stringifyEvent({
              ...entry,
              originNodeId: this.params.nodeId,
            }),
          });
        }

        const status = this.adapterStatuses[index];
        if (status) {
          status.healthy = true;
          status.lastEventAt = createTimestamp();
        }
      } catch (error) {
        const status = this.adapterStatuses[index];
        if (status) {
          status.healthy = false;
          status.lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }));
  }

  private async attachRedisAdapter(url: string, channel: string, direction: string): Promise<void> {
    const publishClient = createClient({ url });
    this.redisClients.push(publishClient);
    if (!publishClient.isOpen) {
      await publishClient.connect();
    }

    const status: RuntimeEventAdapterStatus = {
      type: 'redis',
      direction: direction as 'inbound' | 'outbound' | 'both',
      enabled: true,
      healthy: true,
      target: `${url}#${channel}`,
    };
    this.adapterStatuses.push(status);

    if (['inbound', 'both'].includes(direction)) {
      const subscriber = publishClient.duplicate();
      this.redisClients.push(subscriber);
      if (!subscriber.isOpen) {
        await subscriber.connect();
      }

      await subscriber.subscribe(channel, (raw) => {
        const parsed = EventSerializer.deserializeTransportMessage(raw);
        if (parsed.originNodeId === this.params.nodeId) {
          return;
        }

        this.params.ingestEvent(parsed.eventName, parsed.payload, parsed.originNodeId);
      });
    }

    if (['outbound', 'both'].includes(direction)) {
      const cleanup = this.params.app.on('*', (payload) => {
        const entry = payload as EventHistoryEntry;
        void publishClient.publish(channel, EventSerializer.serializeTransportMessage({
          eventName: entry.eventName,
          payload: entry.payload,
          originNodeId: this.params.nodeId,
          timestamp: entry.timestamp,
        }));
      });

      const previousCleanup = this.cleanup;
      this.cleanup = () => {
        previousCleanup?.();
        cleanup();
      };
    }
  }

  private createWebhookHeaders(headers?: Record<string, string>, token?: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    };
  }
}
