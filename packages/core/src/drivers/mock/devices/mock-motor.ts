import type { MotorDriver } from '@gortjs/contracts';

export class MockMotor implements MotorDriver {
  forward(_speed?: number): void {}
  reverse(_speed?: number): void {}
  start(_speed?: number): void {}
  stop(): void {}
  brake(): void {}
  release(): void {}
}
