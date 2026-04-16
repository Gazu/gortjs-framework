import type { AutomationRule } from '../automation/automation-types';
import type { ConfigValidationIssue } from '../config/config-validation';
import type { DeviceConfig, DeviceState } from '../devices/device-types';
import type { EventBusHealth } from '../events/event-types';
import type { PersistenceConfig, PersistenceHealth } from '../persistence/persistence-types';

export type IoTAppStatus = 'created' | 'attached' | 'running' | 'stopped' | 'disposed' | 'error';
export type SupportedDriverName = 'johnny-five' | 'mock';

export interface RestServerConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  websocketPath?: string;
}

export interface IoTRuntimeConfig {
  driver?: SupportedDriverName;
  board?: Record<string, unknown>;
}

export interface IoTAppSnapshot {
  status: IoTAppStatus;
  deviceTypes: string[];
  devices: DeviceState[];
  rules: AutomationRule[];
}

export interface IoTAppHealth {
  ok: boolean;
  app: {
    status: IoTAppStatus;
    deviceCount: number;
    deviceTypeCount: number;
    ruleCount: number;
  };
  board: {
    ready: boolean;
    driver: string;
    connected: boolean;
  };
  eventBus: EventBusHealth;
  persistence: PersistenceHealth;
}

export interface IoTAppConfig {
  runtime?: IoTRuntimeConfig;
  devices?: DeviceConfig[];
  rules?: AutomationRule[];
  rest?: RestServerConfig;
  persistence?: PersistenceConfig;
}

export type ConfigValidationIssues = ConfigValidationIssue[];
