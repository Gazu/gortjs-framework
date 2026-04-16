import type {
  ComponentDriver,
  DriverContract,
  LedDriver,
  RelayDriver,
  SensorDriver,
  MotorDriver,
  CreateDeviceParams,
  CreateComponentParams,
  DeviceFactories,
} from '@gortjs/contracts';

import { mockDeviceFactories } from './mock-device-factories';
import { MockGenericComponent } from './devices/mock-generic-component';

export class MockDriver implements DriverContract {
  readonly name = 'mock';
  private connected = false;

  constructor(private readonly factories: DeviceFactories = mockDeviceFactories) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  createLed(params: CreateDeviceParams): LedDriver {
    return this.factories.led(params);
  }

  createRelay(params: CreateDeviceParams): RelayDriver {
    return this.factories.relay(params);
  }

  createSensor(params: CreateDeviceParams): SensorDriver {
    return this.factories.sensor(params);
  }

  createMotor(params: CreateDeviceParams): MotorDriver {
    return this.factories.motor(params);
  }

  createComponent(params: CreateComponentParams): ComponentDriver {
    return new MockGenericComponent({
      componentClass: params.componentClass,
      options: params.options as Record<string, unknown> | undefined,
      emitterOptions: params.emitterOptions,
    });
  }
}
