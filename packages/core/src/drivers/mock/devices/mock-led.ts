import type { LedDriver } from '@gortjs/contracts';

export class MockLed implements LedDriver {
  on(): void {}
  off(): void {}
  toggle(): void {}
  blink(): void {}
  stop(): void {}
}
