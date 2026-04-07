# @gortjs/core

`@gortjs/core` is the main GortJS runtime. It contains `IoTApp`, device registration, command dispatching, automation, persistence, health reporting, and hardware drivers.

## Purpose

- Orchestrate devices, rules, events, and persistence.
- Connect an application to real hardware or mocks.
- Provide a simple entry point for building IoT applications.

## Goals

- Keep the runtime modular and extensible.
- Support local development with `mock` and deployment with `johnny-five`.
- Provide built-in declarative automation, health checks, and persistence.

## Installation

```bash
npm install @gortjs/core @gortjs/contracts @gortjs/devices @gortjs/events
```

## Main API

- `IoTApp`
- `ConfigValidationError`
- `loadAppConfig`
- `validateAppConfig`
- `FilePersistence`
- `HealthService`

## Minimal example

```ts
import { IoTApp } from '@gortjs/core';

const app = new IoTApp({ driver: 'mock' });

app.registerDevice({
  id: 'relay1',
  type: 'relay',
  pin: 7,
});

await app.start();
await app.command('relay1', 'open');
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
```

## File-based configuration example

```ts
import { IoTApp } from '@gortjs/core';

const app = new IoTApp({ driver: 'mock' });
await app.configureFromFile('./iot.config.json');
await app.start();
```
