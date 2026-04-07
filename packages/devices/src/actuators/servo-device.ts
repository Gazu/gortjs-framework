import type { ComponentDriver, DeviceCommand } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { ActuatorDevice } from '../base/actuator-device';

export class ServoDevice extends ActuatorDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: 'Servo',
      pin: this.pin,
      options: this.options,
    });

    this.status = 'ready';
    this.setActuatorState({
      position: Number(this.options.startAt ?? 0),
      sweeping: false,
    });
    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand): Promise<void> {
    switch (command.name) {
      case 'to': {
        const position = Number(command.payload?.degrees ?? command.payload?.position ?? 0);
        this.component.invoke('to', [position]);
        this.setActuatorState({ position, sweeping: false });
        return;
      }
      case 'step': {
        const step = Number(command.payload?.degrees ?? command.payload?.step ?? 1);
        this.component.invoke('step', [step]);
        this.setActuatorState({
          position: Number(this.lastState?.position ?? 0) + step,
          sweeping: false,
        });
        return;
      }
      case 'min':
      case 'max':
      case 'center':
      case 'sweep':
      case 'stop':
        this.component.invoke(command.name);
        this.setActuatorState({
          position: command.name === 'center' ? 90 : this.lastState?.position ?? 0,
          sweeping: command.name === 'sweep',
        });
        return;
      default:
        throw new Error(`Unsupported command '${command.name}' for Servo ${this.id}`);
    }
  }
}
