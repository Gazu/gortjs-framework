import assert from 'node:assert/strict';
import test from 'node:test';
import type { RedisClientType } from 'redis';
import WebSocket, { WebSocketServer } from 'ws';
import { RedisEventBus, WebSocketEventBus } from '@gortjs/events';

test('WebSocketEventBus uses ws sockets for local dispatch and transport', async () => {
  const clientHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const serverHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const sentMessages: string[] = [];

  const client = {
    readyState: WebSocket.OPEN,
    on(eventName: string, handler: (...args: unknown[]) => void) {
      const handlers = clientHandlers.get(eventName) ?? new Set();
      handlers.add(handler);
      clientHandlers.set(eventName, handlers);
      return this;
    },
    once(eventName: string, handler: (...args: unknown[]) => void) {
      const onceHandler = (...args: unknown[]) => {
        this.off(eventName, onceHandler);
        handler(...args);
      };
      return this.on(eventName, onceHandler);
    },
    off(eventName: string, handler: (...args: unknown[]) => void) {
      clientHandlers.get(eventName)?.delete(handler);
      return this;
    },
    send(message: string) {
      sentMessages.push(message);
    },
  } as unknown as WebSocket;

  const clientSet = new Set<WebSocket>([client]);
  const server = {
    clients: clientSet,
    on(eventName: string, handler: (...args: unknown[]) => void) {
      const handlers = serverHandlers.get(eventName) ?? new Set();
      handlers.add(handler);
      serverHandlers.set(eventName, handlers);
      return this;
    },
    off(eventName: string, handler: (...args: unknown[]) => void) {
      serverHandlers.get(eventName)?.delete(handler);
      return this;
    },
  } as unknown as WebSocketServer;

  const eventBus = new WebSocketEventBus({ server, client });

  let localPayload: unknown;
  eventBus.on('device:test', (payload) => {
    localPayload = payload;
  });

  eventBus.emit('device:test', { ok: true });
  assert.deepEqual(localPayload, { ok: true });
  assert.equal(sentMessages.length, 2);

  let inboundPayload: unknown;
  eventBus.on('device:inbound', (payload) => {
    inboundPayload = payload;
  });

  for (const handler of clientHandlers.get('message') ?? []) {
    handler(JSON.stringify({ eventName: 'device:inbound', payload: { value: 42 } }), false);
  }

  assert.deepEqual(inboundPayload, { value: 42 });

  eventBus.dispose();
});

test('RedisEventBus uses redis publish/subscribe clients directly', async () => {
  const subscriptions = new Map<string, (message: string) => void>();
  const published: Array<{ channel: string; message: string }> = [];

  const publisher = {
    publish(channel: string, message: string) {
      published.push({ channel, message });
      return Promise.resolve(1);
    },
  } as unknown as RedisClientType;

  const subscriber = {
    subscribe(channel: string, listener: (message: string) => void) {
      subscriptions.set(channel, listener);
      return Promise.resolve();
    },
    unsubscribe(channel: string) {
      subscriptions.delete(channel);
      return Promise.resolve();
    },
  } as unknown as RedisClientType;

  const eventBus = new RedisEventBus({
    channel: 'iot:events',
    publisher,
    subscriber,
  });

  let localPayload: unknown;
  eventBus.on('device:test', (payload) => {
    localPayload = payload;
  });

  eventBus.emit('device:test', { ok: true });
  assert.deepEqual(localPayload, { ok: true });
  assert.equal(published[0]?.channel, 'iot:events');

  let inboundPayload: unknown;
  eventBus.on('device:inbound', (payload) => {
    inboundPayload = payload;
  });

  subscriptions.get('iot:events')?.(JSON.stringify({ eventName: 'device:inbound', payload: { value: 7 } }));
  assert.deepEqual(inboundPayload, { value: 7 });

  await eventBus.dispose();
  assert.equal(subscriptions.has('iot:events'), false);
});
