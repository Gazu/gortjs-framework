import type { DeviceCommand, LedDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { ActuatorDevice } from '../base/actuator-device';

export class LedDevice extends ActuatorDevice {
  private get led(): LedDriver {
    return this.instance as LedDriver;
  }

  async start(): Promise<void> {
    if (!this.driver) {
      throw new Error(`Driver not attached for device ${this.id}`);
    }

    this.instance = this.driver.createLed({ pin: this.pin, options: this.options });
    this.status = 'ready';
    this.setActuatorState({ on: false, blinking: false });
    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand): Promise<void> {
    switch (command.name) {
      case 'on':
        this.led.on();
        this.setActuatorState({ on: true, blinking: false });
        return;
      case 'off':
        this.led.off();
        this.setActuatorState({ on: false, blinking: false });
        return;
      case 'toggle':
        this.led.toggle();
        this.setActuatorState({ on: !(this.lastState?.on as boolean ?? false), blinking: false });
        return;
      case 'blink': {
        const interval = Number(command.payload?.interval ?? 500);
        this.led.blink(interval);
        this.setActuatorState({ on: true, blinking: true, interval });
        return;
      }
      case 'stop':
        this.led.stop();
        this.led.off();
        this.setActuatorState({ on: false, blinking: false });
        return;
      default:
        throw new Error(`Unsupported command '${command.name}' for LED ${this.id}`);
    }
  }

  async stop(): Promise<void> {
    if (this.instance) {
      this.led.stop();
      this.led.off();
      this.setActuatorState({ on: false, blinking: false });
    }

    await super.stop();
  }
}
