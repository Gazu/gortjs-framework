# @gortjs/events

`@gortjs/events` provides `EventBusContract` implementations for local and distributed event flows.

Documented for release `0.4.0`.

## Purpose

- Publish and consume runtime events.
- Support in-memory, WebSocket, and Redis transports behind one contract.
- Bridge GortJS with external processes and monitoring tools.

## Main classes

- `EventBus`: in-memory event bus
- `WebSocketEventBus`: transport powered by `ws`
- `RedisEventBus`: pub/sub transport powered by `redis`
- `NoopEventBus`: no-op implementation for tests or dependency wiring

## Why it matters in 0.4.0

- it supports the stronger runtime lifecycle introduced in `@gortjs/core`
- it remains the common event surface for automation, persistence, and monitoring
- it works with local, socket-based, and distributed topologies without changing app code

## Installation

```bash
npm install @gortjs/events @gortjs/contracts
```

## In-memory example

```ts
import { EventBus } from '@gortjs/events';

const bus = new EventBus();

bus.on('device:led1:ready', (payload) => {
  console.log(payload);
});

bus.on('*', (entry) => {
  console.log(entry);
});

bus.emit('device:led1:ready', { ok: true });
```

## WebSocket example

```ts
import WebSocket from 'ws';
import { WebSocketEventBus } from '@gortjs/events';

const client = new WebSocket('ws://localhost:3000/ws');
const bus = new WebSocketEventBus({ client });

bus.on('*', (entry) => {
  console.log(entry);
});
```

## Redis example

```ts
import { createClient } from 'redis';
import { RedisEventBus } from '@gortjs/events';

const publisher = createClient();
const subscriber = publisher.duplicate();

await publisher.connect();
await subscriber.connect();

const bus = new RedisEventBus({
  channel: 'gortjs:events',
  publisher,
  subscriber,
});
```
