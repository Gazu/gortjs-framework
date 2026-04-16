import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { IoTAppConfig } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import { RestServer } from './rest-server';

export class AppRuntime {
  constructor(
    private readonly params: {
      app: IoTApp;
      config: IoTAppConfig;
      restServer?: RestServer;
    },
  ) {}

  static async fromConfig(config: IoTAppConfig): Promise<AppRuntime> {
    const app = IoTApp.fromConfig(config);
    await app.configure(config);

    const restServer = config.rest?.enabled === false
      ? undefined
      : new RestServer({
          app,
          host: config.rest?.host,
          port: config.rest?.port,
          websocketPath: config.rest?.websocketPath,
        });

    return new AppRuntime({ app, config, restServer });
  }

  static async fromFile(filePath: string): Promise<AppRuntime> {
    const raw = await readFile(filePath, 'utf8');
    const config = JSON.parse(raw) as IoTAppConfig;

    if (config.persistence?.directory && !isAbsolute(config.persistence.directory)) {
      config.persistence.directory = resolve(dirname(filePath), config.persistence.directory);
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
}
