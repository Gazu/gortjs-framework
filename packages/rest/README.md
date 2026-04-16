# @gortjs/rest

`@gortjs/rest` exposes an `IoTApp` instance over HTTP and WebSocket for control, observability, and live monitoring.

Documented for release `0.2.0`.

## Purpose

- Provide an HTTP API to inspect runtime state and execute commands.
- Expose operational health and persisted data.
- Stream runtime events over WebSocket.

## Main endpoints

- `GET /health`
- `GET /health/deep`
- `GET /devices`
- `GET /devices/:id`
- `GET /device-types`
- `GET /rules`
- `GET /events`
- `GET /persisted-state`
- `POST /devices/:id/commands`
- `WS /ws`

## Installation

```bash
npm install @gortjs/rest @gortjs/core
```

## Example

```ts
import { IoTApp } from '@gortjs/core';
import { RestServer } from '@gortjs/rest';

const app = new IoTApp({ driver: 'mock' });

await app.configure({
  devices: [
    { id: 'led1', type: 'led', pin: 13 },
  ],
});

await app.start();

const rest = new RestServer({
  app,
  port: 3000,
  websocketPath: '/ws',
});

await rest.start();
```

## Why it matters in 0.2.0

- it exposes the richer health model from `@gortjs/core`
- it fits naturally on top of lifecycle-aware `IoTApp` instances
- it gives dashboards and external services a thin operational interface

## curl example

```bash
curl http://localhost:3000/health
curl http://localhost:3000/devices
curl -X POST http://localhost:3000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
