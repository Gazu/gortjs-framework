import type { ComponentDriver, DeviceCommand } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { ActuatorDevice } from '../base/actuator-device';

export class PiezoDevice extends ActuatorDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: 'Piezo',
      pin: this.pin,
      options: this.options,
    });

    this.status = 'ready';
    this.setActuatorState({ playing: false, frequency: null });
    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand): Promise<void> {
    switch (command.name) {
      case 'frequency': {
        const frequency = Number(command.payload?.frequency ?? 0);
        const duration = Number(command.payload?.duration ?? 0);
        this.component.invoke('frequency', duration > 0 ? [frequency, duration] : [frequency]);
        this.setActuatorState({ playing: true, frequency, duration: duration || null });
        return;
      }
      case 'play': {
        const song = command.payload?.song ?? command.payload?.notes;
        this.component.invoke('play', typeof song === 'undefined' ? [] : [song]);
        this.setActuatorState({ playing: true, sequence: song ?? null });
        return;
      }
      case 'noTone':
      case 'off':
      case 'stop':
        this.component.invoke(command.name === 'off' ? 'noTone' : command.name);
        this.setActuatorState({ playing: false, frequency: null });
        return;
      default:
        throw new Error(`Unsupported command '${command.name}' for Piezo ${this.id}`);
    }
  }
}
