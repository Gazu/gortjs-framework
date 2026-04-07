import type { RelayDriver } from '@gortjs/contracts';

export class MockRelay implements RelayDriver {
  open(): void {}
  close(): void {}
  toggle(): void {}
}
