import { resolve } from 'node:path';
import { EventSerializer } from '@gortjs/contracts';
import { AppRuntime } from '@gortjs/rest';

function logEvent(entry: unknown): void {
  console.log(EventSerializer.stringifyLog(entry));
}

async function bootstrap(): Promise<void> {
  const configPath = process.env.GORT_CONFIG_PATH
    ? resolve(process.cwd(), process.env.GORT_CONFIG_PATH)
    : resolve(process.cwd(), 'apps/basic-app/config/iot.config.json');
  const runtime = await AppRuntime.fromFile(configPath);
  const app = runtime.getApp();
  const appConfig = runtime.getConfig();

  app.on('*', (entry) => {
    logEvent(entry);
  });

  await runtime.start();

  console.log(`Loaded config from ${configPath}`);
  console.log(`REST server running on http://localhost:${appConfig.rest?.port ?? 3000}`);
  console.log(`WebSocket monitoring on ws://localhost:${appConfig.rest?.port ?? 3000}${appConfig.rest?.websocketPath ?? '/ws'}`);

  const shutdown = async () => {
    await runtime.dispose();
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
