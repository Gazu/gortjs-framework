import five = require('johnny-five');
import type { Cleanup, EventEmitterOptions, SensorDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { SensorPollingController } from './sensor-polling-controller';

export class SensorAdapter implements SensorDriver {
  private readonly eventName: string;
  private readonly pollingController: SensorPollingController;

  constructor(
    private readonly options: EventEmitterOptions,
    private readonly sensor: InstanceType<typeof five.Sensor>
  ) {
    this.eventName = deviceEventNames.sensorData(this.options.deviceId);
    this.pollingController = new SensorPollingController({
      sensor: this.sensor,
      emitterOptions: this.options,
    });
    this.pollingController.start();
  }

  on(eventName: string, handler: (value: unknown) => void): Cleanup {
    if (eventName !== 'data') {
      throw new Error(`Unsupported event: ${eventName}`);
    }

    return this.options.eventBus.on(this.eventName, handler);
  }

  destroy(): void {
    this.pollingController.stop();
  }
}
