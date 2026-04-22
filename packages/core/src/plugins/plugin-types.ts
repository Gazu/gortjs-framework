import type {
  DeviceConstructor,
  DriverContract,
  LoadedPluginSummary,
  PluginApiVersion,
  PluginCapabilityCatalog,
  PluginCompatibilitySummary,
  PluginManifest,
  PluginReferenceConfig,
  SupportedDriverName,
} from '@gortjs/contracts';
import {
  GORTJS_PLUGIN_API_VERSION,
  GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
} from '@gortjs/contracts';

export type DriverFactory = () => DriverContract;

export interface PluginApi {
  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void;
  registerDriver(name: SupportedDriverName | string, driverFactory: DriverFactory): void;
}

export interface GortPlugin {
  manifest: PluginManifest;
  register(api: PluginApi, options?: PluginReferenceConfig['options']): void | Promise<void>;
}

export interface RegisteredPluginState extends LoadedPluginSummary {
  manifest: PluginManifest;
}

export type PluginDefinition = GortPlugin;

export function getPluginCompatibility(apiVersion: PluginApiVersion): PluginCompatibilitySummary {
  return {
    supported: GORTJS_SUPPORTED_PLUGIN_API_VERSIONS.includes(apiVersion),
    expectedApiVersion: GORTJS_PLUGIN_API_VERSION,
    receivedApiVersion: apiVersion,
    supportedApiVersions: [...GORTJS_SUPPORTED_PLUGIN_API_VERSIONS],
  };
}

export function normalizePluginCapabilities(capabilities?: PluginCapabilityCatalog): PluginCapabilityCatalog {
  return {
    drivers: capabilities?.drivers ?? [],
    deviceTypes: capabilities?.deviceTypes ?? [],
    actions: capabilities?.actions ?? [],
    triggers: capabilities?.triggers ?? [],
    workflows: capabilities?.workflows ?? [],
  };
}

export function definePlugin(plugin: GortPlugin): PluginDefinition {
  return plugin;
}

export function defineDriverFactory(factory: DriverFactory): DriverFactory {
  return factory;
}

export function createPluginManifest(manifest: PluginManifest): PluginManifest {
  return manifest;
}
