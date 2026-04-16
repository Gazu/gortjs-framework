import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import type { IoTAppConfig } from '@gortjs/contracts';
import { AppRuntime } from '@gortjs/rest';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url: string, init?: RequestInit): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function waitForEvent(
  socket: WebSocket,
  eventName: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for '${eventName}'`));
    }, 2000);

    const onMessage = (raw: WebSocket.RawData) => {
      const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (parsed.eventName === eventName) {
        cleanup();
        resolve(parsed);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };

    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

async function connectAndWaitForEvent(
  url: string,
  eventName: string,
): Promise<{ socket: WebSocket; event: Record<string, unknown> }> {
  const socket = new WebSocket(url);

  const eventPromise = waitForEvent(socket, eventName);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    socket,
    event: await eventPromise,
  };
}

test('AppRuntime boots a complete config and exposes operational REST and WebSocket endpoints', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'gortjs-rest-runtime-'));
  const runtime = await AppRuntime.fromConfig({
    runtime: { driver: 'mock' },
    rest: {
      host: '127.0.0.1',
      port: 0,
      websocketPath: '/socket',
    },
    persistence: {
      directory: persistenceDir,
      maxEvents: 50,
    },
    devices: [
      { id: 'led1', type: 'led', pin: 13 },
    ],
  });

  await runtime.start();

  const rest = runtime.getRestServer();
  assert.ok(rest);
  assert.equal(rest.isRunning(), true);
  assert.ok(rest.getUrl());
  assert.ok(rest.getWebSocketUrl());

  const statusResponse = await requestJson(`${rest.getUrl()}/status`);
  assert.equal(statusResponse.status, 200);
  assert.equal((statusResponse.body as { status: string }).status, 'running');

  const snapshotResponse = await requestJson(`${rest.getUrl()}/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  assert.equal((snapshotResponse.body as { status: string }).status, 'running');
  assert.equal((snapshotResponse.body as { devices: unknown[] }).devices.length, 1);

  const healthResponse = await requestJson(`${rest.getUrl()}/health/deep`);
  assert.equal(healthResponse.status, 200);
  assert.equal((healthResponse.body as { app: { status: string } }).app.status, 'running');
  assert.equal((healthResponse.body as { board: { driver: string } }).board.driver, 'mock');

  const { socket } = await connectAndWaitForEvent(rest.getWebSocketUrl()!, 'ws:connected');

  const commandEventPromise = waitForEvent(socket, 'device:led1:command:executed');

  const commandResponse = await requestJson(`${rest.getUrl()}/devices/led1/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'on' }),
  });

  assert.equal(commandResponse.status, 200);
  const commandEvent = await commandEventPromise;
  assert.equal(
    ((commandEvent.payload as {
      payload: {
        state: {
          state: { on: boolean };
        };
      };
    }).payload.state.state.on),
    true,
  );

  socket.close();
  await runtime.dispose();
});

test('REST lifecycle and mutation endpoints manage complete runtime configuration', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'gortjs-rest-mutations-'));
  const config: IoTAppConfig = {
    runtime: { driver: 'mock' },
    rest: {
      host: '127.0.0.1',
      port: 0,
    },
    persistence: {
      directory: persistenceDir,
      maxEvents: 50,
    },
    devices: [
      { id: 'led1', type: 'led', pin: 13 },
    ],
    rules: [],
  };

  const runtime = await AppRuntime.fromConfig(config);
  await runtime.start();

  const rest = runtime.getRestServer();
  assert.ok(rest);

  const stopResponse = await requestJson(`${rest.getUrl()}/lifecycle/stop`, {
    method: 'POST',
  });
  assert.equal(stopResponse.status, 200);
  assert.equal((stopResponse.body as { status: string }).status, 'stopped');

  const deviceResponse = await requestJson(`${rest.getUrl()}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'relay1', type: 'relay', pin: 7 }),
  });
  assert.equal(deviceResponse.status, 201);

  const ruleResponse = await requestJson(`${rest.getUrl()}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'sync_relay_with_led',
      eventName: 'device:led1:command:executed',
      condition: {
        path: 'payload.command.name',
        operator: 'eq',
        value: 'on',
      },
      actions: [
        { deviceId: 'relay1', command: 'open' },
      ],
    }),
  });
  assert.equal(ruleResponse.status, 201);
  assert.equal((ruleResponse.body as { rules: unknown[] }).rules.length, 1);

  const startResponse = await requestJson(`${rest.getUrl()}/lifecycle/start`, {
    method: 'POST',
  });
  assert.equal(startResponse.status, 200);
  assert.equal((startResponse.body as { status: string }).status, 'running');

  const ledOnResponse = await requestJson(`${rest.getUrl()}/devices/led1/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'on' }),
  });
  assert.equal(ledOnResponse.status, 200);

  await sleep(20);

  const relayStateResponse = await requestJson(`${rest.getUrl()}/devices/relay1`);
  assert.equal(relayStateResponse.status, 200);
  assert.equal((relayStateResponse.body as { state: { on: boolean } }).state.on, true);

  await requestJson(`${rest.getUrl()}/lifecycle/stop`, {
    method: 'POST',
  });

  const deleteRuleResponse = await requestJson(`${rest.getUrl()}/rules/sync_relay_with_led`, {
    method: 'DELETE',
  });
  assert.equal(deleteRuleResponse.status, 200);
  assert.equal((deleteRuleResponse.body as { rules: unknown[] }).rules.length, 0);

  await runtime.dispose();
});
