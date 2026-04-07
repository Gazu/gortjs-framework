import five = require('johnny-five');
import type { MotorDriver } from '@gortjs/contracts';

export class MotorAdapter implements MotorDriver {
  constructor(private readonly motor: InstanceType<typeof five.Motor>) {}

  forward(speed?: number): void {
    if (typeof speed === 'number') {
      this.motor.forward(speed);
      return;
    }

    this.motor.forward(255);
  }

  reverse(speed?: number): void {
    if (typeof speed === 'number') {
      this.motor.reverse(speed);
      return;
    }

    this.motor.reverse(255);
  }

  start(speed?: number): void {
    this.motor.start(speed);
  }

  stop(): void {
    this.motor.stop();
  }

  brake(): void {
    this.motor.brake();
  }

  release(): void {
    this.motor.release();
  }
}
