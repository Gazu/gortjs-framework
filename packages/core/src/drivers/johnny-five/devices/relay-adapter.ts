import type { RelayDriver } from '@gortjs/contracts';
import five = require('johnny-five');

export class RelayAdapter implements RelayDriver {
  constructor(private readonly relay: InstanceType<typeof five.Relay>) {}

  open(): void {
    this.relay.open();
  }
  close(): void {
    this.relay.close();
  }
  toggle(): void {
    this.relay.toggle();
  }
}