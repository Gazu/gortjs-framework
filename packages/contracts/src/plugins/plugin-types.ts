import type { SupportedDriverName } from '../app/iot-app-types';

export type PluginApiVersion = '0.6' | '0.8' | '0.9';
export type PluginRuntimeState = 'loaded' | 'applied' | 'started' | 'stopped' | 'disposed' | 'error';

export interface PluginCapabilityDescriptor {
  id: string;
  description?: string;
}

export interface PluginCapabilityCatalog {
  drivers?: Array<PluginCapabilityDescriptor & { driverName?: SupportedDriverName | string }>;
  deviceTypes?: PluginCapabilityDescriptor[];
  actions?: PluginCapabilityDescriptor[];
  triggers?: PluginCapabilityDescriptor[];
  workflows?: PluginCapabilityDescriptor[];
}

export interface PluginManifest {
  name: string;
  version: string;
  apiVersion: PluginApiVersion;
  description?: string;
  keywords?: string[];
  capabilities?: PluginCapabilityCatalog;
}

export interface PluginCompatibilitySummary {
  supported: boolean;
  expectedApiVersion: PluginApiVersion;
  receivedApiVersion: PluginApiVersion;
  supportedApiVersions: PluginApiVersion[];
}

export interface PluginHealthSummary {
  ok: boolean;
  checkedAt?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface PluginRuntimeSummary {
  state: PluginRuntimeState;
  hooks: string[];
  lastAppliedAt?: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastDisposedAt?: string;
  lastError?: string;
  health?: PluginHealthSummary;
}

export interface LoadedPluginSummary {
  name: string;
  version: string;
  apiVersion: PluginApiVersion;
  description?: string;
  keywords?: string[];
  capabilities: PluginCapabilityCatalog;
  compatibility: PluginCompatibilitySummary;
  runtime: PluginRuntimeSummary;
  source: 'inline' | 'module';
  modulePath?: string;
  applied: boolean;
}
