import five = require('johnny-five');
import type {
  ComponentDriver,
  CreateDeviceParams,
  CreateComponentParams,
  DeviceFactories,
  DriverContract,
  LedDriver,
  MotorDriver,
  RelayDriver,
  SensorDriver,
} from '@gortjs/contracts';
import { GenericJohnnyFiveComponentDriver } from './devices/generic-component-driver';
import { johnnyFiveDeviceFactories } from './johnny-five-device-factories';

function resolveJohnnyFiveConstructor(componentClass: string): new (options?: unknown) => Record<string, unknown> {
  const resolved = componentClass
    .split('.')
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, five as unknown);

  if (typeof resolved !== 'function') {
    throw new Error(`Johnny-Five component class '${componentClass}' is not supported`);
  }

  return resolved as new (options?: unknown) => Record<string, unknown>;
}

export class JohnnyFiveDriver implements DriverContract {
  readonly name = 'johnny-five';
  private board?: InstanceType<typeof five.Board>;
  private connected = false;

  constructor(
    private readonly options: { board?: Record<string, unknown> } = {},
    private readonly factories: DeviceFactories = johnnyFiveDeviceFactories,
  ) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.board = new five.Board(this.options.board ?? {});
      this.board.on('ready', () => {
        this.connected = true;
        resolve();
      });
      this.board.on('error', (error?: Error) => reject(error ?? new Error('Board error')));
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.board = undefined;
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
    const ComponentConstructor = resolveJohnnyFiveConstructor(params.componentClass);
    const options = {
      ...(params.options ?? {}),
      ...(typeof params.pin !== 'undefined' ? { pin: params.pin } : {}),
      ...(typeof params.pins !== 'undefined' ? { pins: params.pins } : {}),
    };

    const instance = new ComponentConstructor(options);
    return new GenericJohnnyFiveComponentDriver(instance);
  }
}
