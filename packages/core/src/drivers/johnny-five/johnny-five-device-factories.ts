import five = require('johnny-five');
import type {
  CreateDeviceParams,
  DeviceFactories,
  DevicePins,
  EventEmitterOptions,
} from '@gortjs/contracts';
import { LedAdapter } from './devices/led-adapter';
import { MotorAdapter } from './devices/motor-adapter';
import { RelayAdapter } from './devices/relay-adapter';
import { SensorAdapter } from './devices/sensor-adapter';

function assertMotorPinsAreNumeric(
  pins: DevicePins,
): { pwm: number; dir: number; cdir?: number } {
  if (Array.isArray(pins)) {
    throw new Error('Motor "pins" must be an object like { pwm, dir, cdir? }.');
  }

  const pwm = pins.pwm;
  const dir = pins.dir;
  const cdir = pins.cdir;

  if (typeof pwm !== 'number') {
    throw new Error('Motor "pins.pwm" must be a number.');
  }

  if (typeof dir !== 'number') {
    throw new Error('Motor "pins.dir" must be a number.');
  }

  if (typeof cdir !== 'undefined' && typeof cdir !== 'number') {
    throw new Error('Motor "pins.cdir" must be a number when provided.');
  }

  return typeof cdir === 'number' ? { pwm, dir, cdir } : { pwm, dir };
}

function assertEmitterOptions(
  emitterOptions: EventEmitterOptions | undefined,
): EventEmitterOptions {
  if (!emitterOptions) {
    throw new Error('Sensor requires "emitterOptions".');
  }

  return emitterOptions;
}

export const johnnyFiveDeviceFactories: DeviceFactories = {
  led: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Led does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Led requires "pin".');
    }

    const led = new five.Led({
      pin: params.pin,
      ...(params.options ?? {}),
    });

    return new LedAdapter(led);
  },
  relay: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Relay does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Relay requires "pin".');
    }

    const relay = new five.Relay({
      pin: params.pin,
      ...(params.options ?? {}),
    });

    return new RelayAdapter(relay);
  },
  motor: (params: CreateDeviceParams) => {
    const { pins: _ignoredPins, ...restOptions } = params.options ?? {};

    if (typeof params.pins === 'undefined') {
      throw new Error('Motor requires "pins".');
    }

    const motor = new five.Motor({
      ...restOptions,
      pins: assertMotorPinsAreNumeric(params.pins),
    });

    return new MotorAdapter(motor);
  },
  sensor: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Sensor does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Sensor requires "pin".');
    }

    const { freq, ...restOptions } = params.options ?? {};
    const sensor = new five.Sensor({
      pin: params.pin,
      freq: Number(freq ?? 1000),
      ...restOptions,
    });

    return new SensorAdapter(assertEmitterOptions(params.emitterOptions), sensor);
  },
};
