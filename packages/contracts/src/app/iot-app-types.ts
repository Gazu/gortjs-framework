import type { AutomationRule, WorkflowDefinition } from '../automation/automation-types';
import type { ConfigValidationIssue } from '../config/config-validation';
import type { DeviceConfig, DeviceState } from '../devices/device-types';
import type { EventBusHealth } from '../events/event-types';
import type { PersistenceConfig, PersistenceHealth } from '../persistence/persistence-types';
import type { LoadedPluginSummary } from '../plugins/plugin-types';
import type { RuntimeSummary, WorkflowJobStatus } from '../runtime/runtime-types';

export type IoTAppStatus = 'created' | 'attached' | 'running' | 'stopped' | 'disposed' | 'error';
export type SupportedDriverName = 'johnny-five' | 'mock';
export type RestAuthMode = 'static' | 'jwt';

export interface RestAuthConfig {
  enabled?: boolean;
  mode: RestAuthMode;
  token?: string;
  tokenScopes?: string[];
  publicKey?: string;
  publicKeyFile?: string;
  algorithms?: Array<'RS256'>;
  issuer?: string;
  audience?: string | string[];
  scopeClaim?: string;
  scopes?: Record<string, string[]>;
}

export interface RestAuthHealth {
  enabled: boolean;
  mode?: RestAuthMode;
  source?: 'inline' | 'file';
  algorithms?: Array<'RS256'>;
  issuer?: string;
  audience?: string | string[];
  scopeClaim?: string;
  configuredScopes: string[];
  lastLoadedAt?: string;
  lastReloadAt?: string;
  lastReloadError?: string;
}

export interface RestServerConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  websocketPath?: string;
  auth?: RestAuthConfig;
}

export interface IoTRuntimeConfig {
  driver?: SupportedDriverName;
  board?: Record<string, unknown>;
  profile?: string;
  timezone?: string;
  metrics?: {
    enabled?: boolean;
  };
}

export interface PluginReferenceConfig {
  name: string;
  path?: string;
  options?: Record<string, unknown>;
}

export interface RuntimeProfileConfig {
  runtime?: Omit<IoTRuntimeConfig, 'profile'>;
  rest?: RestServerConfig;
  persistence?: PersistenceConfig;
  plugins?: PluginReferenceConfig[];
}

export interface IoTAppMetrics {
  appStarts: number;
  appStops: number;
  commandsDispatched: number;
  eventsObserved: number;
  rulesExecuted: number;
  workflowsExecuted: number;
  scheduledExecutions: number;
}

export interface IoTAppSnapshot {
  status: IoTAppStatus;
  deviceTypes: string[];
  devices: DeviceState[];
  rules: AutomationRule[];
  workflows: WorkflowDefinition[];
}

export interface IoTAppImportSnapshot {
  devices?: DeviceConfig[];
  rules?: AutomationRule[];
  workflows?: WorkflowDefinition[];
}

export interface IoTAppHealth {
  ok: boolean;
  app: {
    status: IoTAppStatus;
    timeZone?: string;
    deviceCount: number;
    deviceTypeCount: number;
    ruleCount: number;
    workflowCount: number;
  };
  board: {
    ready: boolean;
    driver: string;
    connected: boolean;
  };
  eventBus: EventBusHealth;
  persistence: PersistenceHealth;
  metrics: IoTAppMetrics;
}

export interface IoTAppConfig {
  runtime?: IoTRuntimeConfig;
  profiles?: Record<string, RuntimeProfileConfig>;
  devices?: DeviceConfig[];
  rules?: AutomationRule[];
  workflows?: WorkflowDefinition[];
  rest?: RestServerConfig;
  persistence?: PersistenceConfig;
  plugins?: PluginReferenceConfig[];
}

export interface RuntimeAdminProvider {
  getPluginCatalog(): LoadedPluginSummary[];
  getRuntimeSummary(): RuntimeSummary;
  getJobs(): WorkflowJobStatus[];
}

export type ConfigValidationIssues = ConfigValidationIssue[];
