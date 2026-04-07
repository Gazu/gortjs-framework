import type { ActuatorDeviceContract } from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { BaseDevice } from './base-device';

export abstract class ActuatorDevice extends BaseDevice implements ActuatorDeviceContract {
  abstract execute(command: Parameters<ActuatorDeviceContract['execute']>[0]): Promise<void>;

  protected setActuatorState(state: Record<string, unknown>): void {
    this.lastState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };

    this.emit(deviceEventNames.stateChanged(this.id), { state: this.lastState });
  }
}
