import type { DeviceConstructor } from '@gortjs/contracts';

export class DeviceTypeRegistry {
  private readonly deviceTypes = new Map<string, DeviceConstructor>();

  constructor(initialTypes: Record<string, DeviceConstructor> = {}) {
    this.registerMany(initialTypes);
  }

  register(type: string, deviceConstructor: DeviceConstructor): void {
    this.deviceTypes.set(type, deviceConstructor);
  }

  registerMany(deviceTypes: Record<string, DeviceConstructor>): void {
    for (const [type, deviceConstructor] of Object.entries(deviceTypes)) {
      this.register(type, deviceConstructor);
    }
  }

  get(type: string): DeviceConstructor | undefined {
    return this.deviceTypes.get(type);
  }

  list(): string[] {
    return Array.from(this.deviceTypes.keys()).sort();
  }
}
