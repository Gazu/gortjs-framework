import type { ActuatorDeviceContract, DeviceCommand, EventBusContract } from '@gortjs/contracts';
import { createTimestamp, deviceEventNames } from '@gortjs/contracts';
import { DeviceRegistry } from '../devices/device-registry';

function normalizeCommand(
  commandOrName: DeviceCommand | string,
  payload: Record<string, unknown> = {},
): DeviceCommand {
  if (typeof commandOrName === 'string') {
    return Object.keys(payload).length > 0
      ? ({ name: commandOrName, payload } as DeviceCommand)
      : ({ name: commandOrName } as DeviceCommand);
  }

  return commandOrName;
}

export class CommandDispatcher {
  constructor(
    private readonly params: {
      registry: DeviceRegistry;
      eventBus: EventBusContract;
    }
  ) {}

  async dispatch(
    deviceId: string,
    commandOrName: DeviceCommand | string,
    payload: Record<string, unknown> = {},
    context?: {
      requestId?: string;
      correlationId?: string;
    },
  ) {
    const command = normalizeCommand(commandOrName, payload);
    let deviceType = 'unknown';

    try {
      const device = this.params.registry.get(deviceId) as ActuatorDeviceContract;
      deviceType = device.type;

      this.params.eventBus.emit(deviceEventNames.commandReceived(deviceId), {
        deviceId,
        deviceType,
        payload: { command },
        timestamp: createTimestamp(),
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      });

      if (typeof device.execute !== 'function') {
        throw new Error(`Device '${deviceId}' does not support commands`);
      }

      await device.execute(command);
      const state = device.getState();

      this.params.eventBus.emit(deviceEventNames.commandExecuted(deviceId), {
        deviceId,
        deviceType,
        payload: {
          command,
          state,
        },
        timestamp: createTimestamp(),
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      });

      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown command error';
      this.params.eventBus.emit(deviceEventNames.commandFailed(deviceId), {
        deviceId,
        deviceType,
        payload: {
          command,
          error: message,
        },
        timestamp: createTimestamp(),
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      });
      throw error;
    }
  }
}
