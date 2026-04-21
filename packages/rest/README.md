# @gortjs/rest

`@gortjs/rest` exposes an `IoTApp` instance over HTTP and WebSocket for control, observability, and live monitoring.

Documented for release `0.6.0`.

## Purpose

- Provide an HTTP API to inspect runtime state and execute commands.
- Expose operational health and persisted data.
- Stream runtime events over WebSocket.
- Include the configured runtime time zone in operational responses.

## Main endpoints

- `GET /status`
- `GET /snapshot`
- `GET /health`
- `GET /health/deep`
- `GET /diagnostics`
- `GET /plugins`
- `GET /jobs`
- `GET /runtime`
- `GET /devices`
- `GET /devices/:id`
- `GET /device-types`
- `GET /rules`
- `GET /events`
- `GET /persisted-state`
- `POST /devices`
- `POST /devices/:id/commands`
- `POST /rules`
- `POST /workflows`
- `POST /workflows/:id/run`
- `POST /snapshot/import`
- `DELETE /rules/:id`
- `DELETE /workflows/:id`
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
  runtime: { driver: 'mock', timezone: 'America/Santiago' },
  rest: { port: 3000, websocketPath: '/ws' },
  devices: [{ id: 'led1', type: 'led', pin: 13 }],
});

await runtime.start();
```

## Why it matters in 0.6.0

- it exposes a true admin/runtime surface instead of only device control endpoints
- it makes plugin catalogs, scheduler jobs, and runtime configuration inspectable over HTTP
- it supports workflow operations and snapshot import as first-class runtime actions

## curl example

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
curl http://localhost:3000/devices
curl -X POST http://localhost:3000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
