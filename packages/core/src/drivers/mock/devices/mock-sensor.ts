import type { Cleanup, EventEmitterOptions, SensorDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';

export class MockSensor implements SensorDriver {
  private readonly timer: NodeJS.Timeout;
  private readonly dataEventName: string;

  constructor(private readonly options: EventEmitterOptions) {
    this.dataEventName = deviceEventNames.sensorData(options.deviceId);

    this.timer = setInterval(() => {
      const value = Math.floor(Math.random() * 1024);
      this.options.eventBus.emit(this.dataEventName, value);
    }, options.interval);
  }

  on(eventName: string, handler: (value: unknown) => void): Cleanup {
    if (eventName !== 'data') {
      throw new Error(`Unsupported event: ${eventName}`);
    }

    return this.options.eventBus.on(this.dataEventName, handler);
  }

  destroy(): void {
    clearInterval(this.timer);
  }
}
