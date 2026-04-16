import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BackupFileInfo,
  Cleanup,
  DeviceState,
  EventBusContract,
  EventHistoryEntry,
  EventHistoryPage,
  EventHistoryQuery,
  PersistenceProvider,
  PersistenceHealth,
  PersistenceConfig,
} from '@gortjs/contracts';

type PersistedState = {
  devices: Record<string, DeviceState>;
  updatedAt: string;
};

export class FilePersistence implements PersistenceProvider {
  private readonly eventLogFile: string;
  private readonly stateFile: string;
  private readonly maxEvents: number;
  private readonly deviceStates = new Map<string, DeviceState>();
  private readonly eventHistory: EventHistoryEntry[] = [];
  private cleanup?: Cleanup;
  private initialized = false;
  private writeQueue = Promise.resolve();
  private readonly rotateAfterBytes?: number;
  private readonly maxBackups: number;
  private lastRotationAt?: string;
  private writable = true;

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      config: PersistenceConfig;
    },
  ) {
    this.eventLogFile = join(
      params.config.directory,
      params.config.eventLogFile ?? 'events.jsonl',
    );
    this.stateFile = join(
      params.config.directory,
      params.config.stateFile ?? 'state.json',
    );
    this.maxEvents = params.config.maxEvents ?? 500;
    this.rotateAfterBytes = params.config.rotateAfterBytes;
    this.maxBackups = params.config.maxBackups ?? 5;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await mkdir(this.params.config.directory, { recursive: true });
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
    await this.writeQueue;
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

      if (query.from && entry.timestamp < query.from) {
        return false;
      }

      if (query.to && entry.timestamp > query.to) {
        return false;
      }

      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const events = filtered.slice(start, start + pageSize);

    return {
      events,
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
    await this.writeQueue;
    const backups = await this.listBackups();

    return {
      enabled: true,
      initialized: this.initialized,
      directory: this.params.config.directory,
      eventLogFile: this.eventLogFile,
      stateFile: this.stateFile,
      eventCount: this.eventHistory.length,
      maxEvents: this.maxEvents,
      rotateAfterBytes: this.rotateAfterBytes,
      maxBackups: this.maxBackups,
      lastRotationAt: this.lastRotationAt,
      backups,
      writable: this.writable,
    };
  }

  private async record(entry: EventHistoryEntry): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      this.eventHistory.push(entry);
      if (this.eventHistory.length > this.maxEvents) {
        this.eventHistory.splice(0, this.eventHistory.length - this.maxEvents);
      }

      await appendFile(this.eventLogFile, `${JSON.stringify(entry)}\n`, 'utf8');
      await this.rotateEventLogIfNeeded();

      const state = this.extractDeviceState(entry);
      if (state) {
        this.deviceStates.set(state.id, state);
        await this.persistStateSnapshot();
      }
    }).catch((error) => {
      this.writable = false;
      throw error;
    });

    await this.writeQueue;
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
      state: state as Record<string, unknown>,
    };
  }

  private async persistStateSnapshot(): Promise<void> {
    const snapshot: PersistedState = {
      devices: Object.fromEntries(this.deviceStates.entries()),
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.stateFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  private async loadState(): Promise<void> {
    try {
      const raw = await readFile(this.stateFile, 'utf8');
      const snapshot = JSON.parse(raw) as PersistedState;
      for (const [deviceId, deviceState] of Object.entries(snapshot.devices ?? {})) {
        this.deviceStates.set(deviceId, deviceState);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async loadEventHistory(): Promise<void> {
    try {
      const raw = await readFile(this.eventLogFile, 'utf8');
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-this.maxEvents);

      for (const line of lines) {
        this.eventHistory.push(JSON.parse(line) as EventHistoryEntry);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async rotateEventLogIfNeeded(): Promise<void> {
    if (!this.rotateAfterBytes) {
      return;
    }

    try {
      const fileStats = await stat(this.eventLogFile);
      if (fileStats.size < this.rotateAfterBytes) {
        return;
      }

      const rotatedFile = `${this.eventLogFile}.${Date.now()}.bak`;
      await copyFile(this.eventLogFile, rotatedFile);
      await writeFile(this.eventLogFile, '', 'utf8');
      this.lastRotationAt = new Date().toISOString();
      await this.pruneBackups();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      throw error;
    }
  }

  private async listBackups(): Promise<BackupFileInfo[]> {
    try {
      const entries = await readdir(this.params.config.directory);
      const backupFiles = entries
        .filter((entry) => entry.startsWith(`${this.params.config.eventLogFile ?? 'events.jsonl'}.`) && entry.endsWith('.bak'))
        .sort()
        .reverse();

      const backups: BackupFileInfo[] = [];
      for (const entry of backupFiles) {
        const filePath = join(this.params.config.directory, entry);
        const fileStats = await stat(filePath);
        backups.push({
          path: filePath,
          sizeBytes: fileStats.size,
          createdAt: fileStats.birthtime.toISOString(),
        });
      }

      return backups;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private async pruneBackups(): Promise<void> {
    const backups = await this.listBackups();
    const staleBackups = backups.slice(this.maxBackups);

    for (const backup of staleBackups) {
      await rm(backup.path, { force: true });
    }
  }
}
