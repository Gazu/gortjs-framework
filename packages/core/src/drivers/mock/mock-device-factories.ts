import { MockLed } from './devices/mock-led';
import { MockRelay } from './devices/mock-relay';
import { MockMotor } from './devices/mock-motor';
import { MockSensor } from './devices/mock-sensor';
import { CreateDeviceParams, DeviceFactories } from '@gortjs/contracts';

export const mockDeviceFactories: DeviceFactories = {
  led: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Led does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Led requires "pin".');
    }

    return new MockLed();
  },
  relay: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Relay does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Relay requires "pin".');
    }

    return new MockRelay();
  },
  motor: (params: CreateDeviceParams) => {
    if (typeof params.pins === 'undefined') {
      throw new Error('Motor requires "pins".');
    }

    return new MockMotor();
  },
  sensor: (params: CreateDeviceParams) => {
    if (typeof params.pins !== 'undefined') {
      throw new Error('Sensor does not support "pins". Use "pin" instead.');
    }

    if (typeof params.pin === 'undefined') {
      throw new Error('Sensor requires "pin".');
    }

    if (!params.emitterOptions) {
      throw new Error('Sensor requires "emitterOptions".');
    }

    return new MockSensor(params.emitterOptions);
  },
};
