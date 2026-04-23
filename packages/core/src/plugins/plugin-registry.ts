import { createTimestamp, type DeviceConstructor, type IoTAppConfig, type PluginHealthSummary, type PluginManifest, type SupportedDriverName } from '@gortjs/contracts';
import type { DriverContract, LoadedPluginSummary } from '@gortjs/contracts';
import {
  GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
} from '@gortjs/contracts';
import type { IoTApp } from '../iot-app';
import type { DriverFactory, GortPlugin, PluginApi, PluginLifecycleContext, RegisteredPluginState } from './plugin-types';
import { getPluginCompatibility, normalizePluginCapabilities } from './plugin-types';

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
    state.runtime.state = 'applied';
    state.runtime.lastAppliedAt = createTimestamp();
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
      compatibility: getPluginCompatibility(plugin.manifest.apiVersion),
      runtime: {
        state: 'loaded',
        hooks: this.getHookNames(plugin),
      },
      source,
      modulePath,
      applied: false,
      register: plugin.register,
      start: plugin.start,
      stop: plugin.stop,
      dispose: plugin.dispose,
      healthCheck: plugin.healthCheck,
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
      compatibility: plugin.compatibility,
      runtime: plugin.runtime,
      source: plugin.source,
      modulePath: plugin.modulePath,
      applied: plugin.applied,
    }));
  }

  async startPlugins(context: PluginLifecycleContext): Promise<void> {
    await this.runHook('start', context, 'started', 'lastStartedAt');
  }

  async stopPlugins(context: PluginLifecycleContext): Promise<void> {
    await this.runHook('stop', context, 'stopped', 'lastStoppedAt');
  }

  async disposePlugins(context: PluginLifecycleContext): Promise<void> {
    await this.runHook('dispose', context, 'disposed', 'lastDisposedAt');
  }

  async refreshPluginHealth(context: PluginLifecycleContext): Promise<void> {
    for (const state of this.plugins.values()) {
      const healthCheck = (state as RegisteredPluginState & { healthCheck?: GortPlugin['healthCheck'] }).healthCheck;
      if (!healthCheck) {
        continue;
      }

      try {
        const health = await healthCheck(context) as PluginHealthSummary;
        state.runtime.health = {
          ...health,
          checkedAt: health.checkedAt ?? createTimestamp(),
        };
      } catch (error) {
        state.runtime.health = {
          ok: false,
          checkedAt: createTimestamp(),
          message: error instanceof Error ? error.message : String(error),
        };
        state.runtime.state = 'error';
        state.runtime.lastError = state.runtime.health.message;
      }
    }
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

    if (!GORTJS_SUPPORTED_PLUGIN_API_VERSIONS.includes(manifest.apiVersion)) {
      throw new Error(
        `Plugin '${manifest.name}' declares unsupported apiVersion '${manifest.apiVersion}'. Supported versions: ${GORTJS_SUPPORTED_PLUGIN_API_VERSIONS.join(', ')}`,
      );
    }
  }

  private async runHook(
    hookName: 'start' | 'stop' | 'dispose',
    context: PluginLifecycleContext,
    targetState: 'started' | 'stopped' | 'disposed',
    timestampField: 'lastStartedAt' | 'lastStoppedAt' | 'lastDisposedAt',
  ): Promise<void> {
    for (const state of this.plugins.values()) {
      const hook = (state as RegisteredPluginState & { [key: string]: unknown })[hookName] as
        | ((context: PluginLifecycleContext) => void | Promise<void>)
        | undefined;
      if (!hook) {
        if (state.applied) {
          state.runtime.state = targetState;
          state.runtime[timestampField] = createTimestamp();
        }
        continue;
      }

      try {
        await hook(context);
        state.runtime.state = targetState;
        state.runtime[timestampField] = createTimestamp();
        state.runtime.lastError = undefined;
      } catch (error) {
        state.runtime.state = 'error';
        state.runtime.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }
  }

  private getHookNames(plugin: GortPlugin): string[] {
    return ['register', 'start', 'stop', 'dispose', 'healthCheck']
      .filter((hookName) => typeof (plugin as unknown as Record<string, unknown>)[hookName] === 'function');
  }
}
