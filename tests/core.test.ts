import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deviceEventNames, type DeviceEventEnvelope } from '@gortjs/contracts';
import { ConfigValidationError, IoTApp } from '@gortjs/core';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('registers motor devices from the default registry and executes typed commands', async () => {
  const app = new IoTApp({ driver: 'mock' });

  app.registerDevice({
    id: 'motor1',
    type: 'motor',
    pins: { pwm: 3, dir: 4 },
  });

  await app.start();
  const state = await app.command('motor1', 'forward', { speed: 180 });

  assert.equal(state.status, 'ready');
  assert.deepEqual(state.state, {
    on: true,
    direction: 'forward',
    speed: 180,
    braking: false,
    updatedAt: state.state?.updatedAt,
  });

  await app.stop();
});

test('exposes an explicit lifecycle and supports restart after stop', async () => {
  const app = new IoTApp({ driver: 'mock' });

  app.registerDevice({
    id: 'led1',
    type: 'led',
    pin: 13,
  });

  assert.equal(app.getStatus(), 'created');

  await app.attach();
  assert.equal(app.getStatus(), 'attached');

  await app.start();
  assert.equal(app.getStatus(), 'running');

  await app.command('led1', 'on');
  assert.equal(app.getDevice('led1').getState().state?.on, true);

  await app.stop();
  assert.equal(app.getStatus(), 'stopped');
  assert.equal(app.getDevice('led1').getStatus(), 'stopped');

  await app.start();
  assert.equal(app.getStatus(), 'running');
  assert.equal(app.getDevice('led1').getStatus(), 'ready');

  await app.dispose();
  assert.equal(app.getStatus(), 'disposed');
  assert.equal(app.getDevice('led1').getStatus(), 'disposed');
});

test('exposes registry-backed snapshots with device types and rules', async () => {
  const app = new IoTApp({ driver: 'mock' });

  app.registerDevice({
    id: 'relay1',
    type: 'relay',
    pin: 7,
  });

  app.registerRule({
    id: 'turn_on_relay',
    eventName: 'device:test',
    actions: [{ deviceId: 'relay1', command: 'open' }],
  });

  const snapshot = app.getSnapshot();

  assert.equal(snapshot.status, 'created');
  assert.ok(snapshot.deviceTypes.includes('relay'));
  assert.equal(snapshot.devices.length, 1);
  assert.equal(snapshot.rules.length, 1);
});

test('supports generic Johnny-Five component device types through the mock driver', async () => {
  const app = new IoTApp({ driver: 'mock' });

  app.registerDevice({
    id: 'lcd1',
    type: 'lcd',
    options: { controller: 'PCF8574' },
  });

  await app.start();
  const state = await app.command('lcd1', 'print', { value: 'hello world' });

  assert.equal(state.id, 'lcd1');
  assert.equal(state.type, 'lcd');
  assert.equal((state.state?.command as string), 'print');
  assert.deepEqual(state.state?.args, ['hello world']);

  await app.stop();
});

test('uses strong thermometer device while keeping generic coverage for the rest', async () => {
  const app = new IoTApp({ driver: 'mock' });
  let lastReading:
    | DeviceEventEnvelope<{ value: number; state: Record<string, unknown> }>
    | undefined;

  app.registerDevice({
    id: 'thermo1',
    type: 'thermometer',
    pin: 'A0',
    options: { freq: 10 },
  });

  app.on(deviceEventNames.sensorReading('thermo1'), (payload) => {
    lastReading = payload as DeviceEventEnvelope<{ value: number; state: Record<string, unknown> }>;
  });

  await app.start();
  await sleep(30);

  assert.ok(lastReading);
  assert.equal(lastReading.deviceType, 'thermometer');
  assert.equal(typeof lastReading.payload.state.celsius, 'number');

  await app.stop();
});

test('emits consistent command events with envelopes', async () => {
  const app = new IoTApp({ driver: 'mock' });

  app.registerDevice({
    id: 'led1',
    type: 'led',
    pin: 13,
  });

  app.on(deviceEventNames.ready('led1'), (payload) => {
    assert.equal((payload as DeviceEventEnvelope<{ state: { status: string } }>).deviceId, 'led1');
  });

  await app.start();
  const receivedPromise = new Promise<
    DeviceEventEnvelope<{ command: Record<string, unknown>; state: Record<string, unknown> }>
  >((resolve) => {
    app.once(deviceEventNames.commandExecuted('led1'), (payload) => {
      resolve(
        payload as DeviceEventEnvelope<{
          command: Record<string, unknown>;
          state: Record<string, unknown>;
        }>,
      );
    });
  });

  await app.command('led1', { name: 'blink', payload: { interval: 150 } });
  const received = await receivedPromise;

  assert.equal(received.deviceId, 'led1');
  assert.equal(received.deviceType, 'led');
  assert.equal(received.payload.state?.state?.interval, 150);

  await app.stop();
});

test('stopping the app disposes sensor streams and stops mock emissions', async () => {
  const app = new IoTApp({ driver: 'mock' });
  let readings = 0;

  app.registerDevice({
    id: 'temp1',
    type: 'temperature',
    pin: 'A0',
    options: { freq: 10 },
  });

  app.on(deviceEventNames.sensorReading('temp1'), () => {
    readings += 1;
  });

  await app.start();
  await sleep(35);
  assert.ok(readings > 0);

  const readingsBeforeStop = readings;
  await app.stop();
  await sleep(30);

  assert.equal(readings, readingsBeforeStop);
});

test('loads devices and rules from config file and triggers declarative automation', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'iot-config-'));
  const configPath = join(configDir, 'iot.config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      devices: [
        { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 10 } },
        { id: 'led1', type: 'led', pin: 13 },
      ],
      rules: [
        {
          id: 'turn_led_on',
          eventName: deviceEventNames.sensorReading('temp1'),
          condition: { path: 'payload.value', operator: 'gt', value: 50 },
          actions: [{ deviceId: 'led1', command: 'on' }],
        },
      ],
    }),
    'utf8',
  );

  const app = new IoTApp({ driver: 'mock' });
  await app.configureFromFile(configPath);
  await app.start();
  await sleep(30);

  const ledState = app.getDevice('led1').getState();
  assert.equal(ledState.state?.on, true);
  assert.equal(app.getRules().length, 1);

  await app.stop();
});

test('fails fast with clear config validation errors before startup', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'iot-config-invalid-'));
  const configPath = join(configDir, 'iot.config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      devices: [
        { id: 'dup', type: 'led' },
        { id: 'dup', type: 'unknown', pin: 13 },
      ],
      rules: [
        {
          id: 'rule1',
          eventName: '',
          actions: [{ deviceId: 'missing-device', command: 'on' }],
        },
      ],
    }),
    'utf8',
  );

  const app = new IoTApp({ driver: 'mock' });

  await assert.rejects(
    () => app.configureFromFile(configPath),
    (error: unknown) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /devices\[0\]: led devices require 'pin'/);
      assert.match(error.message, /devices\[1\]\.type: unknown device type 'unknown'/);
      assert.match(error.message, /devices\[1\]\.id: duplicate device id 'dup'/);
      assert.match(error.message, /rules\[0\]\.eventName: must be a non-empty string/);
      assert.match(error.message, /rules\[0\]\.actions\[0\]\.deviceId: references unknown device 'missing-device'/);
      return true;
    },
  );
});

test('persists events and state snapshots to disk', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'iot-persist-'));
  const app = new IoTApp({
    driver: 'mock',
    persistence: {
      directory: persistenceDir,
      maxEvents: 50,
    },
  });

  app.registerDevice({
    id: 'led1',
    type: 'led',
    pin: 13,
  });

  await app.start();
  await app.command('led1', 'on');
  await sleep(10);
  const stateBeforeStop = app.getPersistedDeviceStates().find((device) => device.id === 'led1');
  await app.stop();

  const stateRaw = await readFile(join(persistenceDir, 'state.json'), 'utf8');
  const eventsRaw = await readFile(join(persistenceDir, 'events.jsonl'), 'utf8');

  const stateSnapshot = JSON.parse(stateRaw) as {
    devices: Record<string, { state: { on: boolean } }>;
  };

  assert.equal(stateBeforeStop?.state?.on, true);
  assert.equal(stateSnapshot.devices.led1.state.on, false);
  assert.ok(eventsRaw.includes('device:led1:command:executed'));
});

test('reports deep health and rotates event logs with backups', async () => {
  const persistenceDir = await mkdtemp(join(tmpdir(), 'iot-health-'));
  const app = new IoTApp({
    driver: 'mock',
    persistence: {
      directory: persistenceDir,
      maxEvents: 100,
      rotateAfterBytes: 50,
      maxBackups: 2,
    },
  });

  app.registerDevice({
    id: 'led1',
    type: 'led',
    pin: 13,
  });

  await app.start();
  for (let index = 0; index < 20; index += 1) {
    await app.command('led1', index % 2 === 0 ? 'on' : 'off');
  }

  const health = await app.getHealth();
  await app.stop();

  assert.equal(health.app.status, 'running');
  assert.equal(health.board.ready, true);
  assert.equal(health.board.driver, 'mock');
  assert.equal(health.board.connected, true);
  assert.equal(health.persistence.enabled, true);
  assert.equal(health.persistence.initialized, true);
  assert.ok(health.persistence.backups.length > 0);
  assert.ok(health.persistence.backups.length <= 2);
});
