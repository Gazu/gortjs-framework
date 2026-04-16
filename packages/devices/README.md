# @gortjs/devices

`@gortjs/devices` contains the GortJS device model: base classes, actuators, sensors, and generic component devices.

Documented for release `0.3.0`.

## Purpose

- Represent the IoT domain through reusable device classes.
- Encapsulate behavior per device type while staying hardware-agnostic.
- Keep device lifecycle and state handling consistent across the runtime.

## What it includes

- Base classes: `BaseDevice`, `ActuatorDevice`, `SensorDevice`, `GenericComponentDevice`
- Actuators: `LedDevice`, `RelayDevice`, `MotorDevice`, `ServoDevice`, `PiezoDevice`
- Sensors: `TemperatureSensorDevice`, `ThermometerDevice`, `ButtonDevice`, `ProximityDevice`

## 0.3.0 highlights

- clearer lifecycle state transitions
- public `getStatus()` support through the shared contract
- lifecycle-aware orchestration via `canHandle(...)`
- better alignment with runtime restart and disposal flows

## Installation

```bash
npm install @gortjs/devices @gortjs/contracts
```

## Strong device example

```ts
import { ServoDevice } from '@gortjs/devices';

const servo = new ServoDevice({
  id: 'servo1',
  type: 'servo',
  pin: 9,
  options: { startAt: 90 },
});

console.log(servo.getStatus());
```

## Generic component example

```ts
import { GenericComponentDevice } from '@gortjs/devices';

const lcd = new GenericComponentDevice({
  id: 'lcd1',
  type: 'lcd',
  pin: 3,
  componentClass: 'LCD',
  componentKind: 'actuator',
  commandMethods: ['print', 'clear', 'cursor'],
});
```

## Recommended use cases

Use this package when you want to:

- create a custom device class
- extend GortJS with a specialized abstraction for a hardware component
- reuse the GortJS device model in another runtime
