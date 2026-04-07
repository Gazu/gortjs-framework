# @gortjs/contracts

`@gortjs/contracts` contains the shared contracts and type definitions used across GortJS. It is the foundation of the ecosystem and defines the common language between `core`, `devices`, `events`, and `rest`.

## Purpose

- Centralize reusable interfaces and types.
- Define contracts for devices, drivers, event buses, and persistence.
- Reduce coupling between higher-level packages.

## Goals

- Provide a consistent TypeScript API for building extensions.
- Make it easy to implement custom drivers and adapters.
- Keep commands, events, and device state aligned across packages.

## Installation

```bash
npm install @gortjs/contracts
```

## What it includes

- `EventBusContract`
- `DriverContract`
- `BaseDeviceContract`
- `DeviceCommand`
- `IoTAppConfig`
- `AutomationRule`
- `PersistenceProvider`
- `EventSerializer`

## Example

```ts
import type {
  DeviceCommand,
  DriverContract,
  EventBusContract,
} from '@gortjs/contracts';

const command: DeviceCommand = {
  name: 'blink',
  payload: { interval: 200 },
};

function attach(bus: EventBusContract, driver: DriverContract): void {
  bus.emit('system:ready', {
    driverAvailable: Boolean(driver),
  });
}
```

## Recommended use cases

Use this package when you want to:

- build a custom driver
- type an external event transport
- implement your own persistence provider
- share contracts between backend, dashboard, and automation layers
