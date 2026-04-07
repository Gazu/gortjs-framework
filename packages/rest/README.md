# @gortjs/rest

`@gortjs/rest` exposes an `IoTApp` instance over HTTP and WebSocket for control, observability, and live monitoring.

## Purpose

- Provide a simple API to inspect state and execute commands.
- Expose health information and persisted data.
- Stream runtime events over WebSocket.

## Goals

- Reduce the amount of work required to publish an IoT runtime.
- Offer a friendly interface for dashboards and external tools.
- Keep the integration thin and focused around `IoTApp`.

## Installation

```bash
npm install @gortjs/rest @gortjs/core
```

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

## curl example

```bash
curl http://localhost:3000/health
curl http://localhost:3000/devices
curl -X POST http://localhost:3000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
