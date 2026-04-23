import type { IoTAppConfig } from '../app/iot-app-types';
import type { RuntimeEventAdapterStatus } from '../events/event-types';
import type { LoadedPluginSummary } from '../plugins/plugin-types';
import type { PluginApiVersion } from '../plugins/plugin-types';

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeLogEntry {
  id: string;
  timestamp: string;
  level: RuntimeLogLevel;
  source: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface RuntimeAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure';
  actor?: string;
  requestId?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export type WorkflowJobKind = 'interval' | 'cron';
export type WorkflowConcurrencyPolicy = 'allow' | 'forbid' | 'queue';
export type RuntimeNodeRole = 'standalone' | 'node' | 'control-plane';

export interface WorkflowJobStatus {
  workflowId: string;
  kind: WorkflowJobKind;
  expression: string;
  timeZone?: string;
  window?: {
    start?: string;
    end?: string;
  };
  concurrencyPolicy: WorkflowConcurrencyPolicy;
  running: boolean;
  pendingRuns: number;
  runCount: number;
  skippedRuns: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
}

export interface RuntimeNodeSummary {
  nodeId: string;
  role: RuntimeNodeRole;
  url?: string;
  status: string;
  lastSeenAt: string;
  deviceIds: string[];
  timeZone?: string;
  source: 'local' | 'static' | 'remote';
}

export interface ClusterStateSummary {
  enabled: boolean;
  nodeId: string;
  role: RuntimeNodeRole;
  controlPlaneUrl?: string;
  remoteCommandRouting: boolean;
  controlPlaneReachable?: boolean;
  lastControlPlaneSyncAt?: string;
  lastControlPlaneError?: string;
  nodes: RuntimeNodeSummary[];
  recentEvents: Array<{
    nodeId: string;
    eventName: string;
    timestamp: string;
  }>;
}

export interface RuntimeSummary {
  config: IoTAppConfig;
  plugins: LoadedPluginSummary[];
  availableDrivers: string[];
  availableDeviceTypes: string[];
  jobs: WorkflowJobStatus[];
  versions?: {
    framework: string;
    pluginApiVersion: PluginApiVersion;
    supportedPluginApiVersions: PluginApiVersion[];
    packages: Record<string, string>;
  };
  cluster?: ClusterStateSummary;
  eventAdapters?: RuntimeEventAdapterStatus[];
  storage?: {
    adapter?: string;
  };
}
