import type { SupportedDriverName } from '../app/iot-app-types';

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
  apiVersion: '0.6';
  description?: string;
  keywords?: string[];
  capabilities?: PluginCapabilityCatalog;
}

export interface LoadedPluginSummary {
  name: string;
  version: string;
  apiVersion: '0.6';
  description?: string;
  keywords?: string[];
  capabilities: PluginCapabilityCatalog;
  source: 'inline' | 'module';
  modulePath?: string;
  applied: boolean;
}
