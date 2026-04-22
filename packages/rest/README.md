# @gortjs/rest

`@gortjs/rest` exposes an `IoTApp` instance over HTTP and WebSocket for control, observability, and live monitoring.

Documented for release `0.8.0`.

## Purpose

- Provide an HTTP API to inspect runtime state and execute commands.
- Expose operational health and persisted data.
- Stream runtime events over WebSocket.
- Include the configured runtime time zone in operational responses.
- Support control-plane visibility, remote command routing, and cluster-aware runtime summaries.

## Main endpoints

- `GET /status`
- `GET /inspector`
- `GET /snapshot`
- `GET /health`
- `GET /health/deep`
- `GET /diagnostics`
- `GET /plugins`
- `GET /jobs`
- `GET /runtime`
- `GET /cluster`
- `GET /cluster/nodes`
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
- `POST /events/ingest`
- `POST /cluster/nodes/register`
- `POST /cluster/events`
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

## Why it matters in 0.8.0

- it keeps the distributed runtime base from `0.7.0`
- it adds an adoption-focused browser inspector for devices, workflows, plugins, metrics, and cluster state
- it exposes explicit version compatibility data that the CLI and dashboard can surface

## curl example

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
curl http://localhost:3000/devices
curl -X POST http://localhost:3000/devices/led1/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"on"}'
```
