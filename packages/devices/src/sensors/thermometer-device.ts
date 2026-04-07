import type { ComponentDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { SensorDevice } from '../base/sensor-device';

export class ThermometerDevice extends SensorDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: 'Thermometer',
      pin: this.pin,
      options: this.options,
      emitterOptions: {
        deviceId: this.id,
        interval: Number((this.options.freq as number | undefined) ?? 1000),
        eventBus: this.eventBus,
      },
    });

    this.status = 'ready';
    const handleReading = (payload: unknown) => {
      const reading = payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {};
      const celsius = Number(reading.celsius ?? this.component.get('celsius') ?? 0);
      const fahrenheit = Number(
        reading.fahrenheit ?? this.component.get('fahrenheit') ?? celsius * 1.8 + 32,
      );
      const kelvin = Number(reading.kelvin ?? this.component.get('kelvin') ?? celsius + 273.15);
      this.updateState(celsius, { celsius, fahrenheit, kelvin, unit: 'celsius' });
    };

    this.addCleanup(this.component.on('data', handleReading));
    this.addCleanup(this.component.on('change', handleReading));

    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async stop(): Promise<void> {
    this.component.destroy?.();
    await super.stop();
  }
}
