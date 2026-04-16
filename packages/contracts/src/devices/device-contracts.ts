import type { DriverContract } from '../drivers/driver-contracts';
import type { EventBusContract } from '../events/event-bus-contract';
import type {
  DeviceCommand,
  DeviceConfig,
  DeviceLifecycleAction,
  DeviceState,
  DeviceStatus,
} from './device-types';

export interface DeviceAttachContext {
  eventBus: EventBusContract;
  driver: DriverContract;
}

export interface BaseDeviceContract {
  readonly id: string;
  readonly type: string;
  attach(context: DeviceAttachContext): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  getState(): DeviceState;
  getStatus(): DeviceStatus;
  canHandle(action: DeviceLifecycleAction): boolean;
}

export interface ActuatorDeviceContract extends BaseDeviceContract {
  execute(command: DeviceCommand): Promise<void>;
}

export type DeviceConstructor<T extends BaseDeviceContract = BaseDeviceContract> = new (
  config: DeviceConfig
) => T;
