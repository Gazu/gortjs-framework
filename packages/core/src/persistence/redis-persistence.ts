import { createClient, type RedisClientType } from 'redis';
import type {
  Cleanup,
  DeviceState,
  EventBusContract,
  EventHistoryEntry,
  EventHistoryPage,
  EventHistoryQuery,
  PersistenceHealth,
  PersistenceProvider,
  RedisPersistenceConfig,
} from '@gortjs/contracts';
import { createTimestamp, parseTimestamp } from '@gortjs/contracts';

type PersistedState = {
  devices: Record<string, DeviceState>;
  updatedAt: string;
};

export class RedisPersistence implements PersistenceProvider {
  private readonly maxEvents: number;
  private readonly keyPrefix: string;
  private readonly eventHistoryKey: string;
  private readonly stateKey: string;
  private readonly deviceStates = new Map<string, DeviceState>();
  private readonly eventHistory: EventHistoryEntry[] = [];
  private cleanup?: Cleanup;
  private initialized = false;
  private client?: RedisClientType;
  private readonly ownsClient: boolean;

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      config: RedisPersistenceConfig;
      client?: RedisClientType;
    },
  ) {
    this.maxEvents = params.config.maxEvents ?? 500;
    this.keyPrefix = params.config.keyPrefix ?? 'gortjs:persistence';
    this.eventHistoryKey = params.config.eventHistoryKey ?? `${this.keyPrefix}:events`;
    this.stateKey = params.config.stateKey ?? `${this.keyPrefix}:state`;
    this.ownsClient = !params.client;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.client = this.params.client ?? createClient({ url: this.params.config.url });
    if (!this.client.isOpen) {
      await this.client.connect();
    }

    await this.loadState();
    await this.loadEventHistory();

    this.cleanup = this.params.eventBus.on('*', (entry) => {
      void this.record(entry as EventHistoryEntry);
    });
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    this.cleanup?.();
    this.cleanup = undefined;
    this.initialized = false;

    if (this.client && this.ownsClient && this.client.isOpen) {
      await this.client.quit();
    }
  }

  getEventHistory(limit = this.maxEvents): EventHistoryEntry[] {
    return this.eventHistory.slice(-limit);
  }

  queryEventHistory(query: EventHistoryQuery = {}): EventHistoryPage {
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 50, 500));
    const page = Math.max(1, query.page ?? 1);
    const filtered = this.eventHistory.filter((entry) => {
      if (query.eventName && entry.eventName !== query.eventName) {
        return false;
      }

      const payload = entry.payload as Record<string, unknown> | undefined;
      if (query.deviceId && payload?.deviceId !== query.deviceId) {
        return false;
      }

      if (query.from && parseTimestamp(entry.timestamp) < parseTimestamp(query.from)) {
        return false;
      }

      if (query.to && parseTimestamp(entry.timestamp) > parseTimestamp(query.to)) {
        return false;
      }

      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    return {
      events: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      hasNextPage: start + pageSize < total,
    };
  }

  getPersistedStates(): DeviceState[] {
    return Array.from(this.deviceStates.values());
  }

  async getHealth(): Promise<PersistenceHealth> {
    return {
      enabled: true,
      adapter: 'redis',
      initialized: this.initialized,
      eventCount: this.eventHistory.length,
      maxEvents: this.maxEvents,
      backups: [],
      writable: Boolean(this.client?.isOpen),
    };
  }

  private async record(entry: EventHistoryEntry): Promise<void> {
    this.eventHistory.push(entry);
    if (this.eventHistory.length > this.maxEvents) {
      this.eventHistory.splice(0, this.eventHistory.length - this.maxEvents);
    }

    await this.client?.multi()
      .rPush(this.eventHistoryKey, JSON.stringify(entry))
      .lTrim(this.eventHistoryKey, -this.maxEvents, -1)
      .exec();

    const state = this.extractDeviceState(entry);
    if (state) {
      this.deviceStates.set(state.id, state);
      const snapshot: PersistedState = {
        devices: Object.fromEntries(this.deviceStates.entries()),
        updatedAt: createTimestamp(),
      };
      await this.client?.set(this.stateKey, JSON.stringify(snapshot));
    }
  }

  private async loadState(): Promise<void> {
    const raw = await this.client?.get(this.stateKey);
    if (!raw) {
      return;
    }

    const snapshot = JSON.parse(raw) as PersistedState;
    for (const [deviceId, deviceState] of Object.entries(snapshot.devices ?? {})) {
      this.deviceStates.set(deviceId, deviceState);
    }
  }

  private async loadEventHistory(): Promise<void> {
    const rawEntries = await this.client?.lRange(this.eventHistoryKey, 0, -1) ?? [];
    this.eventHistory.splice(0, this.eventHistory.length, ...rawEntries.map((entry) => JSON.parse(entry) as EventHistoryEntry));
  }

  private extractDeviceState(entry: EventHistoryEntry): DeviceState | undefined {
    const payload = entry.payload as Record<string, unknown> | undefined;
    if (entry.eventName === 'app:ready') {
      const devices = payload?.devices;
      if (Array.isArray(devices)) {
        for (const device of devices) {
          const state = device as DeviceState;
          this.deviceStates.set(state.id, state);
        }
      }
      return undefined;
    }

    const nestedPayload = payload?.payload && typeof payload.payload === 'object'
      ? (payload.payload as Record<string, unknown>)
      : undefined;
    const state = nestedPayload?.state;
    if (!state || typeof state !== 'object') {
      return undefined;
    }

    if ('id' in (state as Record<string, unknown>)) {
      return state as DeviceState;
    }

    const deviceId = typeof payload?.deviceId === 'string' ? payload.deviceId : undefined;
    const deviceType = typeof payload?.deviceType === 'string' ? payload.deviceType : undefined;
    if (!deviceId || !deviceType) {
      return undefined;
    }

    const currentState = this.deviceStates.get(deviceId);
    return {
      id: deviceId,
      type: deviceType,
      pin: currentState?.pin,
      pins: currentState?.pins,
      status: currentState?.status ?? 'ready',
      state: {
        ...(state as Record<string, unknown>),
        updatedAt: (state as Record<string, unknown>).updatedAt ?? createTimestamp(),
      },
    };
  }
}
