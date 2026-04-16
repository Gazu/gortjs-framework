import type { AutomationRule } from '../automation/automation-types';
import type { ConfigValidationIssue } from '../config/config-validation';
import type { DeviceConfig, DeviceState } from '../devices/device-types';
import type { EventBusHealth } from '../events/event-types';
import type { PersistenceConfig, PersistenceHealth } from '../persistence/persistence-types';

export type IoTAppStatus = 'created' | 'attached' | 'running' | 'stopped' | 'disposed' | 'error';

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
  devices?: DeviceConfig[];
  rules?: AutomationRule[];
  rest?: {
    port?: number;
    websocketPath?: string;
  };
  persistence?: PersistenceConfig;
}

export type ConfigValidationIssues = ConfigValidationIssue[];
