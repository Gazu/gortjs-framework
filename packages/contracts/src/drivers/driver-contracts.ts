import type {
  Cleanup,
  DeviceOptions,
  DevicePin,
  DevicePins,
} from '../devices/device-types';
import type { EventBusContract } from '../events/event-bus-contract';

export interface LedDriver {
  on(): void;
  off(): void;
  toggle(): void;
  blink(interval?: number): void;
  stop(): void;
}

export interface RelayDriver {
  open(): void;
  close(): void;
  toggle(): void;
}

export interface MotorDriver {
  forward(speed?: number): void;
  reverse(speed?: number): void;
  start(speed?: number): void;
  stop(): void;
  brake(): void;
  release(): void;
}

export interface SensorDriver {
  on(eventName: 'data', handler: (value: unknown) => void): Cleanup;
  destroy?(): void;
}

export interface ComponentDriver {
  on(eventName: string, handler: (payload: unknown) => void): Cleanup;
  invoke(methodName: string, args?: unknown[]): unknown;
  get(path?: string): unknown;
  destroy?(): void;
}

export type EventEmitterOptions = {
  deviceId: string;
  interval: number;
  eventBus: EventBusContract;
};

export interface CreateDeviceParams {
  pin?: DevicePin;
  pins?: DevicePins;
  options?: DeviceOptions;
  emitterOptions?: EventEmitterOptions;
}

export interface CreateComponentParams extends CreateDeviceParams {
  componentClass: string;
}

export interface DriverContract {
  connect(): Promise<void>;
  disconnect?(): Promise<void>;
  createLed(params: CreateDeviceParams): LedDriver;
  createRelay(params: CreateDeviceParams): RelayDriver;
  createSensor(params: CreateDeviceParams): SensorDriver;
  createMotor(params: CreateDeviceParams): MotorDriver;
  createComponent?(params: CreateComponentParams): ComponentDriver;
}

export type DeviceFactories = {
  led: (params: CreateDeviceParams) => LedDriver;
  relay: (params: CreateDeviceParams) => RelayDriver;
  motor: (params: CreateDeviceParams) => MotorDriver;
  sensor: (params: CreateDeviceParams) => SensorDriver;
};
