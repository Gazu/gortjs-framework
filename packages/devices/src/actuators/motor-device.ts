import type { DeviceCommand, MotorDriver } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { ActuatorDevice } from '../base/actuator-device';

export class MotorDevice extends ActuatorDevice {
  private get motor(): MotorDriver {
    return this.instance as MotorDriver;
  }

  async start(): Promise<void> {
    if (!this.driver) {
      throw new Error(`Driver not attached for device ${this.id}`);
    }

    if (!this.pin && !this.pins) {
      throw new Error(`Motor device ${this.id} requires 'pin' or 'pins'`);
    }

    this.instance = this.driver.createMotor({
      pin: this.pin,
      pins: this.pins,
      options: this.options,
    });

    this.status = 'ready';

    this.setActuatorState({
      on: false,
      direction: 'stopped',
      speed: 0,
      braking: false,
    });

    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand): Promise<void> {
    switch (command.name) {
      case 'forward': {
        const speed = Number(command.payload?.speed ?? 255);
        this.motor.forward(speed);
        this.setActuatorState({
          on: true,
          direction: 'forward',
          speed,
          braking: false,
        });
        return;
      }

      case 'reverse': {
        const speed = Number(command.payload?.speed ?? 255);
        this.motor.reverse(speed);
        this.setActuatorState({
          on: true,
          direction: 'reverse',
          speed,
          braking: false,
        });
        return;
      }

      case 'start': {
        const speed = Number(command.payload?.speed ?? this.lastState?.speed ?? 255);
        this.motor.start(speed);
        this.setActuatorState({
          on: true,
          direction: this.lastState?.direction ?? 'forward',
          speed,
          braking: false,
        });
        return;
      }

      case 'stop': {
        this.motor.stop();
        this.setActuatorState({
          on: false,
          direction: 'stopped',
          speed: 0,
          braking: false,
        });
        return;
      }

      case 'brake': {
        this.motor.brake();
        this.setActuatorState({
          on: true,
          direction: this.lastState?.direction ?? 'stopped',
          speed: Number(this.lastState?.speed ?? 0),
          braking: true,
        });
        return;
      }

      case 'release': {
        this.motor.release();
        this.setActuatorState({
          on: Number(this.lastState?.speed ?? 0) > 0,
          direction: this.lastState?.direction ?? 'stopped',
          speed: Number(this.lastState?.speed ?? 0),
          braking: false,
        });
        return;
      }

      default:
        throw new Error(`Unsupported command '${command.name}' for Motor ${this.id}`);
    }
  }

  async stop(): Promise<void> {
    if (this.instance) {
      this.motor.stop();
      this.setActuatorState({
        on: false,
        direction: 'stopped',
        speed: 0,
        braking: false,
      });
    }

    await super.stop();
  }
}
