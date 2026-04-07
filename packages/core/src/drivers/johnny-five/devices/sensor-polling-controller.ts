import type { EventEmitterOptions } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';

type SensorValueReader = {
  readonly value: unknown;
};

export class SensorPollingController {
  private timer?: NodeJS.Timeout;
  private readonly eventName: string;

  constructor(
    private readonly params: {
      sensor: SensorValueReader;
      emitterOptions: EventEmitterOptions;
    },
  ) {
    this.eventName = deviceEventNames.sensorData(this.params.emitterOptions.deviceId);
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.params.emitterOptions.eventBus.emit(this.eventName, this.params.sensor.value);
    }, this.params.emitterOptions.interval);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }
}
