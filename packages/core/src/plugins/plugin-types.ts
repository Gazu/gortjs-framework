import type {
  DeviceConstructor,
  DriverContract,
  LoadedPluginSummary,
  PluginCapabilityCatalog,
  PluginManifest,
  PluginReferenceConfig,
  SupportedDriverName,
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

export function normalizePluginCapabilities(capabilities?: PluginCapabilityCatalog): PluginCapabilityCatalog {
  return {
    drivers: capabilities?.drivers ?? [],
    deviceTypes: capabilities?.deviceTypes ?? [],
    actions: capabilities?.actions ?? [],
    triggers: capabilities?.triggers ?? [],
    workflows: capabilities?.workflows ?? [],
  };
}
