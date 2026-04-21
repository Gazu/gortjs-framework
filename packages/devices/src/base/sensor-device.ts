import { createTimestamp, deviceEventNames } from '@gortjs/contracts';
import { BaseDevice } from './base-device';

export abstract class SensorDevice extends BaseDevice {
  protected updateState(value: unknown, extra: Record<string, unknown> = {}): void {
    this.lastState = {
      value,
      ...extra,
      updatedAt: createTimestamp(),
    };

    this.emit(deviceEventNames.sensorReading(this.id), { value, state: this.lastState });
  }
}
