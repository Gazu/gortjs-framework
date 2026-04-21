import type {
  DeviceState,
  EventBusContract,
  EventHistoryEntry,
  EventHistoryPage,
  EventHistoryQuery,
  MemoryPersistenceConfig,
  PersistenceHealth,
  PersistenceProvider,
} from '@gortjs/contracts';
import type { Cleanup } from '@gortjs/contracts';
import { createTimestamp, parseTimestamp } from '@gortjs/contracts';

export class MemoryPersistence implements PersistenceProvider {
  private readonly maxEvents: number;
  private readonly deviceStates = new Map<string, DeviceState>();
  private readonly eventHistory: EventHistoryEntry[] = [];
  private cleanup?: Cleanup;
  private initialized = false;

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      config: MemoryPersistenceConfig;
    },
  ) {
    this.maxEvents = params.config.maxEvents ?? 500;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.cleanup = this.params.eventBus.on('*', (entry) => {
      this.record(entry as EventHistoryEntry);
    });
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    this.cleanup?.();
    this.cleanup = undefined;
    this.initialized = false;
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
      adapter: 'memory',
      initialized: this.initialized,
      eventCount: this.eventHistory.length,
      maxEvents: this.maxEvents,
      backups: [],
      writable: true,
    };
  }

  private record(entry: EventHistoryEntry): void {
    this.eventHistory.push(entry);
    if (this.eventHistory.length > this.maxEvents) {
      this.eventHistory.splice(0, this.eventHistory.length - this.maxEvents);
    }

    const state = this.extractDeviceState(entry);
    if (state) {
      this.deviceStates.set(state.id, state);
    }
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
