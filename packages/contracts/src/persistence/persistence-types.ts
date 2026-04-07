import type { DeviceState } from '../devices/device-types';
import type { EventHistoryEntry } from '../events/event-types';

export interface PersistenceConfig {
  directory: string;
  eventLogFile?: string;
  stateFile?: string;
  maxEvents?: number;
  rotateAfterBytes?: number;
  maxBackups?: number;
}

export interface BackupFileInfo {
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PersistenceHealth {
  enabled: boolean;
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
}

export interface PersistenceProvider {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getEventHistory(limit?: number): EventHistoryEntry[];
  getPersistedStates(): DeviceState[];
  getHealth(): Promise<PersistenceHealth>;
}
