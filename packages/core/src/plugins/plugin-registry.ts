import type { DeviceConstructor, SupportedDriverName } from '@gortjs/contracts';
import type { DriverContract } from '@gortjs/contracts';
import type { DriverFactory, GortPlugin, PluginApi } from './plugin-types';

export class PluginRegistry implements PluginApi {
  private readonly plugins = new Map<string, GortPlugin>();
  private readonly deviceTypes = new Map<string, DeviceConstructor>();
  private readonly driverFactories = new Map<string, DriverFactory>();

  constructor(
    initial?: {
      deviceTypes?: Record<string, DeviceConstructor>;
      driverFactories?: Record<string, DriverFactory>;
      plugins?: GortPlugin[];
    },
  ) {
    for (const [type, constructor] of Object.entries(initial?.deviceTypes ?? {})) {
      this.registerDeviceType(type, constructor);
    }

    for (const [name, factory] of Object.entries(initial?.driverFactories ?? {})) {
      this.registerDriver(name, factory);
    }

    for (const plugin of initial?.plugins ?? []) {
      this.registerPlugin(plugin);
    }
  }

  registerPlugin(plugin: GortPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  async applyPlugin(name: string, options?: Record<string, unknown>): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin '${name}'`);
    }

    await plugin.register(this, options);
  }

  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void {
    this.deviceTypes.set(type, deviceConstructor);
  }

  registerDriver(name: SupportedDriverName | string, driverFactory: DriverFactory): void {
    this.driverFactories.set(name, driverFactory);
  }

  getDeviceTypes(): Record<string, DeviceConstructor> {
    return Object.fromEntries(this.deviceTypes.entries());
  }

  createDriver(name: SupportedDriverName | string): DriverContract {
    const factory = this.driverFactories.get(name);
    if (!factory) {
      throw new Error(`Unknown driver '${name}'`);
    }

    return factory();
  }
}
