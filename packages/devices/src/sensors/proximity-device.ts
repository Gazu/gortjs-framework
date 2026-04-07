import type { ComponentDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { SensorDevice } from '../base/sensor-device';

export class ProximityDevice extends SensorDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: 'Proximity',
      pin: this.pin,
      options: this.options,
    });

    this.status = 'ready';
    this.addCleanup(this.component.on('change', () => {
      const cm = Number(this.component.get('cm') ?? 0);
      const inches = Number(this.component.get('in') ?? this.component.get('inches') ?? cm / 2.54);
      this.updateState(cm, { cm, inches, unit: 'cm' });
    }));

    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async stop(): Promise<void> {
    this.component.destroy?.();
    await super.stop();
  }
}
