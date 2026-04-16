import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type {
  DeviceConstructor,
  IoTAppConfig,
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
      await plugins.applyPlugin(pluginRef.name, pluginRef.options);
    }

    const app = new IoTApp({
      driverInstance: plugins.createDriver(effectiveConfig.runtime?.driver ?? 'johnny-five'),
      deviceTypes: plugins.getDeviceTypes(),
      persistence: effectiveConfig.persistence,
    });
    await app.configure(effectiveConfig);

    const restServer = effectiveConfig.rest?.enabled === false
      ? undefined
      : new RestServer({
          app,
          host: effectiveConfig.rest?.host,
          port: effectiveConfig.rest?.port,
          websocketPath: effectiveConfig.rest?.websocketPath,
          auth: effectiveConfig.rest?.auth,
        });

    return new AppRuntime({ app, config: effectiveConfig, restServer });
  }

  static async fromFile(filePath: string): Promise<AppRuntime> {
    const raw = await readFile(filePath, 'utf8');
    const config = JSON.parse(raw) as IoTAppConfig;

    if (config.persistence?.directory && !isAbsolute(config.persistence.directory)) {
      config.persistence.directory = resolve(dirname(filePath), config.persistence.directory);
    }

    if (
      config.rest?.auth?.publicKeyFile
      && !isAbsolute(config.rest.auth.publicKeyFile)
    ) {
      config.rest.auth.publicKeyFile = resolve(dirname(filePath), config.rest.auth.publicKeyFile);
    }

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
