import type { DeviceCommand, RelayDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { ActuatorDevice } from '../base/actuator-device';

export class RelayDevice extends ActuatorDevice {
  private get relay(): RelayDriver {
    return this.instance as RelayDriver;
  }

  async start(): Promise<void> {
    if (!this.driver) {
      throw new Error(`Driver not attached for device ${this.id}`);
    }

    this.instance = this.driver.createRelay({ pin: this.pin, options: this.options });
    this.status = 'ready';
    this.setActuatorState({ on: false });
    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand): Promise<void> {
    switch (command.name) {
      case 'open':
        this.relay.open();
        this.setActuatorState({ on: true });
        return;
      case 'close':
        this.relay.close();
        this.setActuatorState({ on: false });
        return;
      case 'toggle': {
        const nextState = !(this.lastState?.on as boolean ?? false);
        this.relay.toggle();
        this.setActuatorState({ on: nextState });
        return;
      }
      default:
        throw new Error(`Unsupported command '${command.name}' for Relay ${this.id}`);
    }
  }

  async stop(): Promise<void> {
    if (this.instance) {
      this.relay.close();
      this.setActuatorState({ on: false });
    }

    await super.stop();
  }
}
