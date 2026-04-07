import type { AutomationRule } from '../automation/automation-types';
import type { ConfigValidationIssue } from '../config/config-validation';
import type { DeviceConfig } from '../devices/device-types';
import type { EventBusHealth } from '../events/event-types';
import type { PersistenceConfig, PersistenceHealth } from '../persistence/persistence-types';

export interface IoTAppHealth {
  ok: boolean;
  app: {
    deviceCount: number;
    deviceTypeCount: number;
    ruleCount: number;
  };
  board: {
    ready: boolean;
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
