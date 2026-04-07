import type { LedDriver } from '@gortjs/contracts';
import five = require('johnny-five');

export class LedAdapter implements LedDriver {
  constructor(private readonly led: InstanceType<typeof five.Led>) {}

  on(): void {
    this.led.on();
  }

  off(): void {
    this.led.off();
  }

  toggle(): void {
    this.led.toggle();
  }

  blink(): void {
    this.led.blink();
  }

  stop(): void {
    this.led.stop();
  }
}