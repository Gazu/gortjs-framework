# @gortjs/contracts

`@gortjs/contracts` contains the shared contracts and type definitions used across GortJS. It defines the common language between `core`, `devices`, `events`, and `rest`.

Documented for release `0.7.0`.

## Purpose

- Centralize reusable interfaces and runtime types.
- Define contracts for devices, drivers, event buses, persistence, and app health.
- Keep packages decoupled while preserving a consistent TypeScript API.

## What it includes

- `EventBusContract`
- `DriverContract`
- `BaseDeviceContract`
- `DeviceCommand`
- `DeviceState`
- `IoTAppConfig`
- `IoTAppHealth`
- `IoTAppSnapshot`
- `AutomationRule`
- `PersistenceProvider`
- `EventSerializer`

## 0.7.0 contract additions

- cluster and runtime node summaries for distributed deployments
- storage adapter contracts for file, memory, and redis backends
- runtime event adapter config for redis, webhook, and MQTT-ready integration
- WebSocket streaming controls for replay and slow-client handling
- auth secret and key rotation configuration for operational hardening

## Installation

```bash
npm install @gortjs/contracts
```

## Example

```ts
import type {
  DeviceCommand,
  DriverContract,
  EventBusContract,
  IoTAppSnapshot,
} from '@gortjs/contracts';

const command: DeviceCommand = {
  name: 'blink',
  payload: { interval: 200 },
};

function announceReady(
  bus: EventBusContract,
  driver: DriverContract,
  snapshot: IoTAppSnapshot,
): void {
  bus.emit('system:ready', {
    driver: driver.name,
    connected: driver.isConnected?.() ?? false,
    devices: snapshot.devices.length,
  });
}
```

## Recommended use cases

Use this package when you want to:

- build a custom driver
- create a custom event transport
- implement a persistence provider
- share runtime contracts between backend, dashboard, and automation services
