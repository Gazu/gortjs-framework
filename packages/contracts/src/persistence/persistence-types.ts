import type { DeviceState } from '../devices/device-types';
import type { EventHistoryEntry, EventHistoryPage, EventHistoryQuery } from '../events/event-types';

export type PersistenceAdapterName = 'file' | 'memory' | 'redis';

export interface BasePersistenceConfig {
  adapter?: PersistenceAdapterName;
  maxEvents?: number;
}

export interface FilePersistenceConfig extends BasePersistenceConfig {
  adapter?: 'file';
  directory: string;
  eventLogFile?: string;
  stateFile?: string;
  rotateAfterBytes?: number;
  maxBackups?: number;
}

export interface MemoryPersistenceConfig extends BasePersistenceConfig {
  adapter: 'memory';
}

export interface RedisPersistenceConfig extends BasePersistenceConfig {
  adapter: 'redis';
  url: string;
  keyPrefix?: string;
  eventHistoryKey?: string;
  stateKey?: string;
}

export type PersistenceConfig =
  | FilePersistenceConfig
  | MemoryPersistenceConfig
  | RedisPersistenceConfig;

export interface BackupFileInfo {
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PersistenceHealth {
  enabled: boolean;
  adapter?: PersistenceAdapterName;
  initialized: boolean;
  directory?: string;
  eventLogFile?: string;
  stateFile?: string;
  eventCount: number;
  maxEvents: number;
  rotateAfterBytes?: number;
  maxBackups?: number;
  lastRotationAt?: string;
  backups: BackupFileInfo[];
  writable: boolean;
  corruptedEntries?: number;
  stateRecovered?: boolean;
  lastError?: string;
}

export interface PersistenceProvider {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getEventHistory(limit?: number): EventHistoryEntry[];
  queryEventHistory?(query?: EventHistoryQuery): EventHistoryPage;
  getPersistedStates(): DeviceState[];
  getHealth(): Promise<PersistenceHealth>;
}
