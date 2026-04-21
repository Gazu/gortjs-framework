import type { IoTAppConfig } from '../app/iot-app-types';
import type { LoadedPluginSummary } from '../plugins/plugin-types';

export type WorkflowJobKind = 'interval' | 'cron';
export type WorkflowConcurrencyPolicy = 'allow' | 'forbid' | 'queue';

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

export interface RuntimeSummary {
  config: IoTAppConfig;
  plugins: LoadedPluginSummary[];
  availableDrivers: string[];
  availableDeviceTypes: string[];
  jobs: WorkflowJobStatus[];
}
