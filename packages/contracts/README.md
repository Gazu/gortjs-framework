# @gortjs/contracts

`@gortjs/contracts` contains the shared contracts and type definitions used across GortJS. It defines the common language between `core`, `devices`, `events`, and `rest`.

Documented for release `0.5.0`.

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

## 0.5.0 contract additions

- richer config validation issue metadata
- auth health reporting contracts for REST diagnostics
- deeper persistence health payloads for recovery scenarios
- runtime time zone support for timestamped health and event metadata
- driver metadata with `name` and optional `isConnected()`
- device lifecycle helpers such as `getStatus()` and `canHandle(...)`
- lifecycle-oriented device status values including `disposed`
- runtime config support through `IoTRuntimeConfig` and `RestServerConfig`

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
