import { resolve } from 'node:path';
import { EventSerializer } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import { RestServer } from '@gortjs/rest';

function logEvent(entry: unknown): void {
  console.log(EventSerializer.stringifyLog(entry));
}

async function bootstrap(): Promise<void> {
  const configPath = resolve(process.cwd(), 'apps/basic-app/config/iot.config.json');
  const app = new IoTApp({ driver: 'mock' });
  const appConfig = await app.configureFromFile(configPath);

  app.on('*', (entry) => {
    logEvent(entry);
  });

  await app.start();

  const rest = new RestServer({
    app,
    port: appConfig.rest?.port ?? 3000,
    websocketPath: appConfig.rest?.websocketPath ?? '/ws',
  });
  await rest.start();

  console.log(`REST server running on http://localhost:${appConfig.rest?.port ?? 3000}`);
  console.log(`WebSocket monitoring on ws://localhost:${appConfig.rest?.port ?? 3000}${appConfig.rest?.websocketPath ?? '/ws'}`);

  const shutdown = async () => {
    await rest.stop();
    await app.stop();
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
