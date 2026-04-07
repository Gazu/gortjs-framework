# GortJS Framework

GortJS is a modular IoT framework for TypeScript. It is designed to separate contracts, devices, event buses, runtime orchestration, and HTTP exposure so you can build anything from local prototypes to reusable IoT gateways.

## Packages

- `@gortjs/contracts`: shared types, contracts, and serialization helpers.
- `@gortjs/events`: in-memory, WebSocket, and Redis event buses.
- `@gortjs/devices`: base device classes plus typed sensors and actuators.
- `@gortjs/core`: the main runtime, drivers, automation, persistence, and health.
- `@gortjs/rest`: REST API and WebSocket monitoring for an `IoTApp` instance.
- `@gortjs/basic-app`: example application included in the monorepo.

## Goals

- Separate domain logic from hardware-specific implementations.
- Support fast local development with mocks and smooth migration to Johnny-Five.
- Provide automation, observability, and remote control through a simple API.
- Keep the architecture extensible for new sensors, actuators, and transports.

## Quick start

```bash
npm install
npm run build
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

await app.start();
await app.command('led1', 'on');
```

## Package documentation

Each package includes its own README with purpose, goals, usage, and API examples:

- [packages/contracts/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/contracts/README.md)
- [packages/events/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/events/README.md)
- [packages/devices/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/devices/README.md)
- [packages/core/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/core/README.md)
- [packages/rest/README.md](https://github.com/Gazu/gortjs-framework/blob/main/packages/rest/README.md)
