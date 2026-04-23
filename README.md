# GortJS Framework

GortJS is a modular IoT framework for JavaScript and TypeScript. It uses a driver-based architecture built around devices and events so you can write your application logic once and run it with real hardware or simulated environments.

Current documented release: `0.9.0`

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

## What changed in 0.9.0

- Structured runtime logs and audit trail endpoints for operational visibility.
- Correlation IDs propagated through REST commands and event history.
- Separate `/health/live` and `/health/ready` endpoints for deployment health probes.
- Stronger plugin runtime lifecycle with start/stop/dispose hooks and health summaries.
- CLI operational flows for `logs` and `audit`, on top of the developer tooling introduced in `0.8.0`.

## Quick start

```bash
npm install
npm run build
npm test
npm start
npm run cli -- templates
```

## Minimal example

```ts
import { AppRuntime } from '@gortjs/rest';

const runtime = await AppRuntime.fromConfig({
  runtime: { driver: 'mock', timezone: 'America/Santiago' },
  rest: { port: 3000, websocketPath: '/ws' },
  devices: [{ id: 'led1', type: 'led', pin: 13 }],
});

await runtime.start();

console.log(runtime.getApp().getSnapshot());
console.log(runtime.getRestServer()?.getUrl());

await runtime.dispose();
```

## Typical use cases

- Build a local IoT app against `mock`, then switch to `johnny-five` for real hardware.
- Register devices declaratively from a JSON config file.
- Expose runtime state over REST and filtered WebSocket streams.
- Persist events and state snapshots for debugging and auditability.
- Run declarative automation rules triggered by device events.
- Inspect plugin catalogs and scheduled jobs through the admin API or CLI.
- Move from a single local app to a connected multi-runtime topology with a control plane.
- Bootstrap new apps and extension points from the official templates and scaffolds, then operate them with structured diagnostics.

## Product docs

- [docs/getting-started.md](./docs/getting-started.md)
- [docs/cookbook.md](./docs/cookbook.md)
- [docs/guides/distributed-runtime.md](./docs/guides/distributed-runtime.md)
- [docs/guides/mock-to-hardware.md](./docs/guides/mock-to-hardware.md)
- [docs/migration-guides/0.7-to-0.8.md](./docs/migration-guides/0.7-to-0.8.md)
- [docs/migration-guides/0.8-to-0.9.md](./docs/migration-guides/0.8-to-0.9.md)

## Package documentation

Each package includes its own README with scope, examples, and integration notes:

- [packages/contracts/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/contracts/README.md)
- [packages/events/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/events/README.md)
- [packages/devices/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/devices/README.md)
- [packages/core/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/core/README.md)
- [packages/rest/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/rest/README.md)
