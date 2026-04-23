import type { AutomationRule, WorkflowDefinition } from '../automation/automation-types';
import type { ConfigValidationIssue } from '../config/config-validation';
import type { DeviceConfig, DeviceState } from '../devices/device-types';
import type { EventBusHealth } from '../events/event-types';
import type { PersistenceConfig, PersistenceHealth } from '../persistence/persistence-types';
import type { LoadedPluginSummary } from '../plugins/plugin-types';
import type { ClusterStateSummary, RuntimeAuditEntry, RuntimeLogEntry, RuntimeLogLevel, RuntimeNodeRole, RuntimeNodeSummary, RuntimeSummary, WorkflowJobStatus } from '../runtime/runtime-types';

export type IoTAppStatus = 'created' | 'attached' | 'running' | 'stopped' | 'disposed' | 'error';
export type SupportedDriverName = 'johnny-five' | 'mock';
export type RestAuthMode = 'static' | 'jwt';
export type EventAdapterType = 'redis' | 'mqtt' | 'webhook';
export type EventAdapterDirection = 'inbound' | 'outbound' | 'both';
export type WebSocketSlowClientPolicy = 'drop' | 'terminate';

export interface SecretEnvValue {
  env: string;
  fallback?: string;
  required?: boolean;
}

export interface RestAuthConfig {
  enabled?: boolean;
  mode: RestAuthMode;
  token?: string;
  tokenEnv?: string;
  tokenScopes?: string[];
  publicKey?: string;
  publicKeyEnv?: string;
  publicKeyFile?: string;
  publicKeyFileEnv?: string;
  publicKeyFiles?: string[];
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
  websocket?: {
    path?: string;
    replayLimit?: number;
    maxBufferedBytes?: number;
    slowClientPolicy?: WebSocketSlowClientPolicy;
  };
  auth?: RestAuthConfig;
}

export interface RuntimeLoggingConfig {
  enabled?: boolean;
  level?: RuntimeLogLevel;
  console?: boolean;
  file?: string;
  auditFile?: string;
  maxEntries?: number;
}

export interface RuntimeEventAdapterConfig {
  type: EventAdapterType;
  direction?: EventAdapterDirection;
  target?: string;
  channel?: string;
  topic?: string;
  headers?: Record<string, string>;
  token?: string;
  tokenEnv?: string;
  enabled?: boolean;
}

export interface ClusterRemoteNodeConfig {
  nodeId: string;
  url: string;
  role?: RuntimeNodeRole;
}

export interface RuntimeClusterConfig {
  enabled?: boolean;
  role?: RuntimeNodeRole;
  nodeId?: string;
  advertisedUrl?: string;
  controlPlaneUrl?: string;
  sharedToken?: string;
  sharedTokenEnv?: string;
  remoteCommandRouting?: boolean;
  syncEvents?: boolean;
  syncState?: boolean;
  heartbeatIntervalMs?: number;
  remotes?: ClusterRemoteNodeConfig[];
}

export interface IoTRuntimeConfig {
  driver?: SupportedDriverName;
  board?: Record<string, unknown>;
  profile?: string;
  timezone?: string;
  metrics?: {
    enabled?: boolean;
  };
  events?: {
    adapters?: RuntimeEventAdapterConfig[];
  };
  logging?: RuntimeLoggingConfig;
  cluster?: RuntimeClusterConfig;
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
  remoteCommandsRouted: number;
  remoteCommandsReceived: number;
  clusterSyncs: number;
  websocketDroppedClients: number;
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
  liveness: {
    ok: boolean;
    status: IoTAppStatus;
  };
  readiness: {
    ok: boolean;
    status: IoTAppStatus;
    reasons: string[];
  };
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
  getLogs?(limit?: number): RuntimeLogEntry[];
  getAuditTrail?(limit?: number): RuntimeAuditEntry[];
  getClusterState?(): ClusterStateSummary;
  listClusterNodes?(): RuntimeNodeSummary[];
  registerClusterNode?(node: RuntimeNodeSummary & { devices?: DeviceState[] }): void;
  recordClusterEvent?(entry: { nodeId: string; eventName: string; timestamp: string; payload?: unknown }): void;
  routeCommand?(
    deviceId: string,
    command: string,
    payload?: Record<string, unknown>,
    context?: {
      requestId?: string;
      correlationId?: string;
    },
  ): Promise<{ ok: boolean; state?: unknown; routedTo?: string; error?: string }>;
  ingestEvent?(eventName: string, payload?: unknown, sourceNodeId?: string): void;
}

export type ConfigValidationIssues = ConfigValidationIssue[];
