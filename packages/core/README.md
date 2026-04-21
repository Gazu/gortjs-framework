# @gortjs/core

`@gortjs/core` is the main GortJS runtime package. It provides `IoTApp`, the built-in drivers, device orchestration, command dispatching, automation, persistence, configuration loading, and health reporting.

Documented for release `0.6.0`.

## Purpose

- Orchestrate devices, rules, events, and persistence in one runtime.
- Run the same application logic with real hardware or simulation.
- Provide a clean entry point for building modular IoT applications.

## Highlights in 0.6.0

- Workflow engine v2 with retries, branch steps, and explicit step-level error handling
- Cron-like schedules, queue/forbid concurrency policies, and schedulable job inspection
- Snapshot import support for rebuilding runtime topology while the app is stopped
- Formal plugin catalog support for drivers and device types

## Installation

```bash
npm install @gortjs/core @gortjs/contracts @gortjs/devices @gortjs/events
```

## Main exports

- `IoTApp`
- `ConfigValidationError`
- `loadAppConfig`
- `validateAppConfig`
- `FilePersistence`
- `HealthService`
- `BoardManager`
- `CommandDispatcher`
- `DeviceRegistry`

## Lifecycle example

```ts
import { IoTApp } from '@gortjs/core';

const app = new IoTApp({ driver: 'mock' });

app.registerDevice({
  id: 'relay1',
  type: 'relay',
  pin: 7,
});

await app.attach();
await app.start();
await app.command('relay1', 'open');

console.log(app.getStatus());
console.log(app.getSnapshot());

await app.stop();
await app.dispose();
```

## Config-driven app creation

```ts
import { IoTApp } from '@gortjs/core';

const app = IoTApp.fromConfig({
  runtime: { driver: 'mock', timezone: 'America/Santiago' },
  persistence: { directory: './data' },
});
```

## Automation example

```ts
import { IoTApp } from '@gortjs/core';
import { deviceEventNames } from '@gortjs/contracts';

const app = new IoTApp({ driver: 'mock' });

await app.configure({
  devices: [
    { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 1000 } },
    { id: 'led1', type: 'led', pin: 13 },
  ],
  rules: [
    {
      id: 'turn_on_led',
      eventName: deviceEventNames.sensorReading('temp1'),
      condition: { path: 'payload.value', operator: 'gt', value: 50 },
      actions: [{ deviceId: 'led1', command: 'on' }],
    },
  ],
});

await app.start();
```

## File-based configuration example

```ts
import { IoTApp } from '@gortjs/core';

const app = new IoTApp({ driver: 'mock' });

await app.configureFromFile('./iot.config.json');
await app.start();
```

## Health example

```ts
const health = await app.getHealth();

console.log(health.app.status);
console.log(health.board.driver);
console.log(health.board.connected);
```

## When to use this package

Use `@gortjs/core` when you want the full application runtime: driver wiring, device orchestration, automation rules, config validation, persistence, and operational health.
