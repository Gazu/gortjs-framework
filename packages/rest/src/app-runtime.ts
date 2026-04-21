import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type {
  DeviceConstructor,
  IoTAppConfig,
  RuntimeAdminProvider,
  RuntimeProfileConfig,
} from '@gortjs/contracts';
import { IoTApp, PluginRegistry, JohnnyFiveDriver, MockDriver } from '@gortjs/core';
import type { GortPlugin } from '@gortjs/core';
import { RestServer } from './rest-server';

function mergeProfile(base: IoTAppConfig, profile?: RuntimeProfileConfig): IoTAppConfig {
  if (!profile) {
    return base;
  }

  return {
    ...base,
    runtime: {
      ...(base.runtime ?? {}),
      ...(profile.runtime ?? {}),
    },
    rest: {
      ...(base.rest ?? {}),
      ...(profile.rest ?? {}),
    },
    persistence: profile.persistence ?? base.persistence,
    plugins: [
      ...(base.plugins ?? []),
      ...(profile.plugins ?? []),
    ],
  };
}

function resolveRuntimePaths(config: IoTAppConfig, filePath: string): IoTAppConfig {
  const configDir = dirname(filePath);
  const resolveMaybe = (target?: string): string | undefined => {
    if (!target || isAbsolute(target)) {
      return target;
    }

    return resolve(configDir, target);
  };

  if (config.persistence?.directory) {
    config.persistence.directory = resolveMaybe(config.persistence.directory)!;
  }

  if (config.rest?.auth?.publicKeyFile) {
    config.rest.auth.publicKeyFile = resolveMaybe(config.rest.auth.publicKeyFile)!;
  }

  for (const pluginRef of config.plugins ?? []) {
    if (pluginRef.path) {
      pluginRef.path = resolveMaybe(pluginRef.path)!;
    }
  }

  for (const profile of Object.values(config.profiles ?? {})) {
    if (profile.persistence?.directory) {
      profile.persistence.directory = resolveMaybe(profile.persistence.directory)!;
    }

    if (profile.rest?.auth?.publicKeyFile) {
      profile.rest.auth.publicKeyFile = resolveMaybe(profile.rest.auth.publicKeyFile)!;
    }

    for (const pluginRef of profile.plugins ?? []) {
      if (pluginRef.path) {
        pluginRef.path = resolveMaybe(pluginRef.path)!;
      }
    }
  }

  return config;
}

async function loadPluginFromReference(pluginRef: { name: string; path?: string }): Promise<GortPlugin | undefined> {
  if (!pluginRef.path) {
    return undefined;
  }

  const module = await import(pathToFileURL(pluginRef.path).href);
  const plugin = (module.default ?? module.plugin ?? module) as GortPlugin;
  if (!plugin?.manifest || typeof plugin.register !== 'function') {
    throw new Error(`Plugin module '${pluginRef.path}' must export a GortPlugin`);
  }

  return plugin;
}

export type AppRuntimeOptions = {
  plugins?: GortPlugin[];
  deviceTypes?: Record<string, DeviceConstructor>;
};

export class AppRuntime {
  constructor(
    private readonly params: {
      app: IoTApp;
      config: IoTAppConfig;
      restServer?: RestServer;
      admin: RuntimeAdminProvider;
    },
  ) {}

  static async fromConfig(config: IoTAppConfig, options: AppRuntimeOptions = {}): Promise<AppRuntime> {
    const effectiveConfig = this.resolveConfig(config);
    const plugins = new PluginRegistry({
      plugins: options.plugins,
      deviceTypes: options.deviceTypes,
      driverFactories: {
        mock: () => new MockDriver(),
        'johnny-five': () => new JohnnyFiveDriver({
          board: effectiveConfig.runtime?.board,
        }),
      },
    });

    for (const pluginRef of effectiveConfig.plugins ?? []) {
      const dynamicPlugin = await loadPluginFromReference(pluginRef);
      if (dynamicPlugin) {
        plugins.loadPlugin(dynamicPlugin, 'module', pluginRef.path);
      }
      await plugins.applyPlugin(pluginRef.name, pluginRef.options, pluginRef.path);
    }

    const app = new IoTApp({
      driverInstance: plugins.createDriver(effectiveConfig.runtime?.driver ?? 'johnny-five'),
      deviceTypes: plugins.getDeviceTypes(),
      persistence: effectiveConfig.persistence,
      timeZone: effectiveConfig.runtime?.timezone,
    });
    await app.configure(effectiveConfig);

    const restServer = effectiveConfig.rest?.enabled === false
      ? undefined
      : new RestServer({
          app,
          admin: {
            getPluginCatalog: () => plugins.listPlugins(),
            getJobs: () => app.getWorkflowJobs(),
            getRuntimeSummary: () => ({
              config: effectiveConfig,
              plugins: plugins.listPlugins(),
              availableDrivers: plugins.listDrivers(),
              availableDeviceTypes: plugins.listDeviceTypes(),
              jobs: app.getWorkflowJobs(),
            }),
          },
          host: effectiveConfig.rest?.host,
          port: effectiveConfig.rest?.port,
          websocketPath: effectiveConfig.rest?.websocketPath,
          auth: effectiveConfig.rest?.auth,
        });

    return new AppRuntime({
      app,
      config: effectiveConfig,
      restServer,
      admin: {
        getPluginCatalog: () => plugins.listPlugins(),
        getJobs: () => app.getWorkflowJobs(),
        getRuntimeSummary: () => ({
          config: effectiveConfig,
          plugins: plugins.listPlugins(),
          availableDrivers: plugins.listDrivers(),
          availableDeviceTypes: plugins.listDeviceTypes(),
          jobs: app.getWorkflowJobs(),
        }),
      },
    });
  }

  static async fromFile(filePath: string): Promise<AppRuntime> {
    const raw = await readFile(filePath, 'utf8');
    const config = resolveRuntimePaths(JSON.parse(raw) as IoTAppConfig, filePath);
    return this.fromConfig(config);
  }

  getApp(): IoTApp {
    return this.params.app;
  }

  getConfig(): IoTAppConfig {
    return this.params.config;
  }

  getRestServer(): RestServer | undefined {
    return this.params.restServer;
  }

  getAdmin(): RuntimeAdminProvider {
    return this.params.admin;
  }

  async start(): Promise<void> {
    await this.params.app.start();
    await this.params.restServer?.start();
  }

  async stop(): Promise<void> {
    await this.params.restServer?.stop();
    await this.params.app.stop();
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.params.app.dispose();
  }

  private static resolveConfig(config: IoTAppConfig): IoTAppConfig {
    const profileName = config.runtime?.profile;
    if (!profileName) {
      return config;
    }

    const profile = config.profiles?.[profileName];
    if (!profile) {
      throw new Error(`Unknown runtime profile '${profileName}'`);
    }

    return mergeProfile(config, profile);
  }
}
