import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
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
  options?: WebSocket.ClientOptions,
): Promise<{ socket: WebSocket; event: Record<string, unknown> }> {
  const socket = new WebSocket(url, options);

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

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(
  privateKey: string,
  payload: Record<string, unknown>,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
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

test('REST and WebSocket auth support static bearer tokens and scope enforcement', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'gortjs-rest-auth-static-'));
  const runtime = await AppRuntime.fromConfig({
    runtime: { driver: 'mock' },
    rest: {
      host: '127.0.0.1',
      port: 0,
      auth: {
        mode: 'static',
        token: 'static-test-token',
        tokenScopes: ['gortjs:read', 'gortjs:write', 'gortjs:stream'],
        scopes: {
          'status:read': ['gortjs:read'],
          'devices:write': ['gortjs:write'],
          'ws:connect': ['gortjs:stream'],
          'lifecycle:write': ['gortjs:admin'],
        },
      },
    },
    persistence: { directory: persistenceDir },
    devices: [{ id: 'led1', type: 'led', pin: 13 }],
  });

  await runtime.start();
  const rest = runtime.getRestServer();
  assert.ok(rest);

  const unauthorized = await requestJson(`${rest.getUrl()}/status`);
  assert.equal(unauthorized.status, 401);

  const authorized = await requestJson(`${rest.getUrl()}/status`, {
    headers: { Authorization: 'Bearer static-test-token' },
  });
  assert.equal(authorized.status, 200);

  const forbidden = await requestJson(`${rest.getUrl()}/lifecycle/stop`, {
    method: 'POST',
    headers: { Authorization: 'Bearer static-test-token' },
  });
  assert.equal(forbidden.status, 403);

  const { socket } = await connectAndWaitForEvent(
    `${rest.getWebSocketUrl()}?token=static-test-token`,
    'ws:connected',
  );
  socket.close();
  await runtime.dispose();
});

test('REST and WebSocket auth validate JWT signatures, claims, and scopes', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'gortjs-rest-auth-jwt-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const token = signJwt(privateKey, {
    iss: 'https://auth.gortjs.local',
    aud: 'gortjs-basic-app',
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: 'gortjs:read gortjs:metrics gortjs:stream',
  });

  const runtime = await AppRuntime.fromConfig({
    runtime: { driver: 'mock' },
    rest: {
      host: '127.0.0.1',
      port: 0,
      auth: {
        mode: 'jwt',
        publicKey,
        issuer: 'https://auth.gortjs.local',
        audience: 'gortjs-basic-app',
        scopeClaim: 'scope',
        scopes: {
          'status:read': ['gortjs:read'],
          'metrics:read': ['gortjs:metrics'],
          'ws:connect': ['gortjs:stream'],
          'commands:write': ['gortjs:write'],
        },
      },
    },
    persistence: { directory: persistenceDir },
    devices: [{ id: 'led1', type: 'led', pin: 13 }],
  });

  await runtime.start();
  const rest = runtime.getRestServer();
  assert.ok(rest);

  const statusResponse = await requestJson(`${rest.getUrl()}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(statusResponse.status, 200);

  const metricsResponse = await requestJson(`${rest.getUrl()}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(metricsResponse.status, 200);

  const forbiddenCommand = await requestJson(`${rest.getUrl()}/devices/led1/commands`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: 'on' }),
  });
  assert.equal(forbiddenCommand.status, 403);

  const { socket } = await connectAndWaitForEvent(
    rest.getWebSocketUrl()!,
    'ws:connected',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  socket.close();
  await runtime.dispose();
});
