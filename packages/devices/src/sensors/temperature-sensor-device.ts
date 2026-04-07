import type { SensorDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { SensorDevice } from '../base/sensor-device';

export class TemperatureSensorDevice extends SensorDevice {
  private get sensor(): SensorDriver {
    return this.instance as SensorDriver;
  }

  async start(): Promise<void> {
    if (!this.driver) {
      throw new Error(`Driver not attached for device ${this.id}`);
    }

    const freq = Number(this.options.freq ?? 1000);
    this.instance = this.driver.createSensor({
      pin: this.pin,
      options: { ...this.options, freq },
      emitterOptions: {
        deviceId: this.id,
        interval: freq,
        eventBus: this.eventBus,
      },
    });

    this.status = 'ready';
    this.addCleanup(this.sensor.on('data', (value) => {
      this.updateState(value, { unit: this.options.unit ?? 'raw' });
    }));
    this.addCleanup(() => this.sensor.destroy?.());
    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async stop(): Promise<void> {
    await super.stop();
  }
}
