import type { EventBusContract } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import { RedisEventBus, WebSocketEventBus } from '@gortjs/events';
import type { RedisClientType } from 'redis';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';

export function createIoTAppWithWebSocketEventBus(params: {
  server?: WebSocketServer;
  client?: WebSocket;
}): IoTApp {
  const eventBus = new WebSocketEventBus({
    server: params.server,
    client: params.client,
  });

  return new IoTApp({
    driver: 'mock',
    eventBus,
  });
}

export function createIoTAppWithRedisEventBus(params: {
  channel: string;
  publisher: RedisClientType;
  subscriber: RedisClientType;
}): IoTApp {
  const eventBus = new RedisEventBus({
    channel: params.channel,
    publisher: params.publisher,
    subscriber: params.subscriber,
  });

  return new IoTApp({
    driver: 'mock',
    eventBus,
  });
}

export async function bootstrapWithInjectedEventBus(eventBus: EventBusContract): Promise<IoTApp> {
  const app = new IoTApp({
    driver: 'johnny-five',
    eventBus,
    board: { repl: false },
  });

  app.registerDevice({
    id: 'temp1',
    type: 'temperature',
    pin: 'A0',
    options: { freq: 1000, unit: 'celsius' },
  });

  app.registerDevice({
    id: 'led1',
    type: 'led',
    pin: 13,
  });

  app.on(deviceEventNames.sensorReading('temp1'), async (payload) => {
    const reading = payload as {
      payload: {
        value: number;
      };
    };

    if (reading.payload.value > 60) {
      await app.command('led1', 'on');
      return;
    }

    await app.command('led1', 'off');
  });

  await app.start();
  return app;
}
