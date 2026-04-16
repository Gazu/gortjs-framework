# GortJS Framework

GortJS is a modular IoT framework for JavaScript and TypeScript. It uses a driver-based architecture built around devices and events so you can write your application logic once and run it with real hardware or simulated environments.

Current documented release: `0.2.0`

## Core idea

- Keep application logic decoupled from hardware specifics.
- Model runtime behavior through reusable devices and event flows.
- Support the same app lifecycle with `johnny-five` or `mock`.
- Provide configuration, automation, persistence, and health checks out of the box.

## Packages

- `@gortjs/contracts`: shared contracts, event envelopes, config types, and persistence interfaces.
- `@gortjs/events`: in-memory, WebSocket, Redis, and no-op event buses.
- `@gortjs/devices`: base device classes plus typed sensors, actuators, and generic components.
- `@gortjs/core`: `IoTApp`, drivers, lifecycle, registry, automation, validation, persistence, and health.
- `@gortjs/rest`: REST and WebSocket exposure for a running `IoTApp`.
- `@gortjs/basic-app`: example application inside the monorepo.

## What changed in 0.2.0

- Explicit application lifecycle with `attach`, `start`, `stop`, and `dispose`.
- Stronger device and driver contracts for runtime introspection.
- More capable device registry with type lookup and lifecycle-safe orchestration.
- Runtime snapshots and enriched health reporting.
- Better restart behavior for local development and long-running services.
- Stable config validation, automation, persistence, and event transport foundations.

## Quick start

```bash
npm install
npm run build
npm test
npm start
```

## Minimal example

```ts
import { IoTApp } from '@gortjs/core';

const app = new IoTApp({ driver: 'mock' });

app.registerDevice({
  id: 'led1',
  type: 'led',
  pin: 13,
});

await app.attach();
await app.start();
await app.command('led1', 'on');

console.log(app.getSnapshot());
console.log(await app.getHealth());

await app.stop();
await app.dispose();
```

## Typical use cases

- Build a local IoT app against `mock`, then switch to `johnny-five` for real hardware.
- Register devices declaratively from a JSON config file.
- Expose runtime state over REST and WebSocket.
- Persist events and state snapshots for debugging and auditability.
- Run declarative automation rules triggered by device events.

## Package documentation

Each package includes its own README with scope, examples, and integration notes:

- [packages/contracts/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/contracts/README.md)
- [packages/events/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/events/README.md)
- [packages/devices/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/devices/README.md)
- [packages/core/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/core/README.md)
- [packages/rest/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/rest/README.md)
