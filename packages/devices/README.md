# @gortjs/devices

`@gortjs/devices` contains the GortJS device model: base classes, actuators, sensors, and generic component devices.

## Purpose

- Represent the IoT domain through reusable classes.
- Encapsulate behavior per device type.
- Separate device logic from hardware-specific implementations.

## Goals

- Keep the domain layer clear and extensible.
- Provide strong typed devices for high-priority components.
- Preserve broad hardware coverage through `GenericComponentDevice`.

## Installation

```bash
npm install @gortjs/devices @gortjs/contracts
```

## What it includes

- Base classes: `BaseDevice`, `ActuatorDevice`, `SensorDevice`, `GenericComponentDevice`
- Actuators: `LedDevice`, `RelayDevice`, `MotorDevice`, `ServoDevice`, `PiezoDevice`
- Sensors: `TemperatureSensorDevice`, `ThermometerDevice`, `ButtonDevice`, `ProximityDevice`

## Strong device example

```ts
import { ServoDevice } from '@gortjs/devices';

const servo = new ServoDevice({
  id: 'servo1',
  type: 'servo',
  pin: 9,
  options: { startAt: 90 },
});
```

## Generic component example

```ts
import { GenericComponentDevice } from '@gortjs/devices';

const lcd = new GenericComponentDevice({
  id: 'lcd1',
  type: 'lcd',
  componentClass: 'LCD',
  componentKind: 'actuator',
  commandMethods: ['print', 'clear', 'cursor'],
});
```

## Recommended use cases

Use this package when you want to:

- create a custom device class
- extend GortJS with a specialized device abstraction
- reuse the GortJS device model in another runtime
