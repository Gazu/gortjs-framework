import type { BaseDeviceContract, DriverContract, EventBusContract } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';

export class DeviceRegistry {
  private readonly devices = new Map<string, BaseDeviceContract>();

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      driver: DriverContract;
    }
  ) {}

  register(device: BaseDeviceContract): BaseDeviceContract {
    if (this.devices.has(device.id)) {
      throw new Error(`Device '${device.id}' is already registered`);
    }

    device.attach({ eventBus: this.params.eventBus, driver: this.params.driver });
    this.devices.set(device.id, device);

    this.params.eventBus.emit(deviceEventNames.registered, {
      deviceId: device.id,
      deviceType: device.type,
      payload: {},
      timestamp: new Date().toISOString(),
    });

    return device;
  }

  get(deviceId: string): BaseDeviceContract {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device '${deviceId}' not found`);
    }
    return device;
  }

  getAll(): BaseDeviceContract[] {
    return Array.from(this.devices.values());
  }

  has(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  unregister(deviceId: string): BaseDeviceContract {
    const device = this.get(deviceId);
    this.devices.delete(deviceId);
    return device;
  }

  findByType(type: string): BaseDeviceContract[] {
    return this.getAll().filter((device) => device.type === type);
  }

  count(): number {
    return this.devices.size;
  }

  async startAll(): Promise<void> {
    for (const device of this.devices.values()) {
      if (device.canHandle('start')) {
        await device.start();
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const device of this.devices.values()) {
      if (device.canHandle('stop')) {
        await device.stop();
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const device of this.devices.values()) {
      if (device.canHandle('dispose')) {
        await device.dispose();
      }
    }
  }

  serializeAll() {
    return this.getAll().map((device) => device.getState());
  }
}
