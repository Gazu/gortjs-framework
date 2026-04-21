import type { DeviceConstructor, PluginManifest, SupportedDriverName } from '@gortjs/contracts';
import type { DriverContract, LoadedPluginSummary } from '@gortjs/contracts';
import type { DriverFactory, GortPlugin, PluginApi, RegisteredPluginState } from './plugin-types';
import { normalizePluginCapabilities } from './plugin-types';

export class PluginRegistry implements PluginApi {
  private readonly plugins = new Map<string, RegisteredPluginState>();
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
    this.loadPlugin(plugin, 'inline');
  }

  async applyPlugin(name: string, options?: Record<string, unknown>, modulePath?: string): Promise<void> {
    const state = this.plugins.get(name);
    if (!state) {
      throw new Error(`Unknown plugin '${name}'`);
    }

    const plugin = (state as RegisteredPluginState & { register?: GortPlugin['register'] }).register;
    if (!plugin) {
      throw new Error(`Plugin '${name}' does not provide a register function`);
    }

    await plugin(this, options);
    state.applied = true;
    state.source = modulePath ? 'module' : state.source;
    state.modulePath = modulePath ?? state.modulePath;
  }

  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void {
    this.deviceTypes.set(type, deviceConstructor);
  }

  registerDriver(name: SupportedDriverName | string, driverFactory: DriverFactory): void {
    this.driverFactories.set(name, driverFactory);
  }

  loadPlugin(plugin: GortPlugin, source: 'inline' | 'module' = 'inline', modulePath?: string): void {
    this.assertManifest(plugin.manifest);
    this.plugins.set(plugin.manifest.name, {
      ...plugin.manifest,
      manifest: plugin.manifest,
      capabilities: normalizePluginCapabilities(plugin.manifest.capabilities),
      source,
      modulePath,
      applied: false,
      register: plugin.register,
    } as RegisteredPluginState & { register: GortPlugin['register'] });
  }

  listPlugins(): LoadedPluginSummary[] {
    return Array.from(this.plugins.values()).map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      apiVersion: plugin.apiVersion,
      description: plugin.description,
      keywords: plugin.keywords,
      capabilities: plugin.capabilities,
      source: plugin.source,
      modulePath: plugin.modulePath,
      applied: plugin.applied,
    }));
  }

  listDrivers(): string[] {
    return Array.from(this.driverFactories.keys()).sort();
  }

  getDeviceTypes(): Record<string, DeviceConstructor> {
    return Object.fromEntries(this.deviceTypes.entries());
  }

  listDeviceTypes(): string[] {
    return Array.from(this.deviceTypes.keys()).sort();
  }

  createDriver(name: SupportedDriverName | string): DriverContract {
    const factory = this.driverFactories.get(name);
    if (!factory) {
      throw new Error(`Unknown driver '${name}'`);
    }

    return factory();
  }

  private assertManifest(manifest: PluginManifest): void {
    if (!manifest?.name?.trim()) {
      throw new Error('Plugins require a manifest.name');
    }

    if (!manifest.version?.trim()) {
      throw new Error(`Plugin '${manifest.name}' requires a manifest.version`);
    }

    if (manifest.apiVersion !== '0.6') {
      throw new Error(`Plugin '${manifest.name}' must declare apiVersion '0.6'`);
    }
  }
}
