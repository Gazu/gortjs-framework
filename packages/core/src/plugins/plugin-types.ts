import type {
  DeviceConstructor,
  DriverContract,
  PluginReferenceConfig,
  SupportedDriverName,
} from '@gortjs/contracts';

export type DriverFactory = () => DriverContract;

export interface PluginApi {
  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void;
  registerDriver(name: SupportedDriverName | string, driverFactory: DriverFactory): void;
}

export interface GortPlugin {
  name: string;
  register(api: PluginApi, options?: PluginReferenceConfig['options']): void | Promise<void>;
}
