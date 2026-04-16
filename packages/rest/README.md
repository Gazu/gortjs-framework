# @gortjs/rest

`@gortjs/rest` exposes an `IoTApp` instance over HTTP and WebSocket for control, observability, and live monitoring.

Documented for release `0.3.0`.

## Purpose

- Provide an HTTP API to inspect runtime state and execute commands.
- Expose operational health and persisted data.
- Stream runtime events over WebSocket.

## Main endpoints

- `GET /status`
- `GET /snapshot`
- `GET /health`
- `GET /health/deep`
- `GET /devices`
- `GET /devices/:id`
- `GET /device-types`
- `GET /rules`
- `GET /events`
- `GET /persisted-state`
- `POST /devices`
- `POST /devices/:id/commands`
- `POST /rules`
- `DELETE /rules/:id`
- `POST /lifecycle/:action`
- `WS /ws`

## Installation

```bash
npm install @gortjs/rest @gortjs/core
```

## Example

```ts
import { AppRuntime } from '@gortjs/rest';

const runtime = await AppRuntime.fromConfig({
  runtime: { driver: 'mock' },
  rest: { port: 3000, websocketPath: '/ws' },
  devices: [{ id: 'led1', type: 'led', pin: 13 }],
});

await runtime.start();
```

## Why it matters in 0.3.0

- it exposes the richer health model from `@gortjs/core`
- it fits naturally on top of lifecycle-aware `IoTApp` instances
- it gives dashboards and external services a thin operational interface
- it can now bootstrap a complete runtime from config with `AppRuntime`

## curl example

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
curl http://localhost:3000/devices
curl -X POST http://localhost:3000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
