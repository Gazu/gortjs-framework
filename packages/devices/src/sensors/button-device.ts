import type { ComponentDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { SensorDevice } from '../base/sensor-device';

export class ButtonDevice extends SensorDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: 'Button',
      pin: this.pin,
      options: this.options,
    });

    this.status = 'ready';
    for (const sourceEvent of ['press', 'release', 'hold']) {
      this.addCleanup(this.component.on(sourceEvent, () => {
        const pressed = sourceEvent !== 'release';
        this.updateState(pressed, { pressed, sourceEvent });
      }));
    }

    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async stop(): Promise<void> {
    this.component.destroy?.();
    await super.stop();
  }
}
