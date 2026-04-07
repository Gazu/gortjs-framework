import type { DeviceState, DeviceType } from '../devices/device-types';

export interface TransportEventMessage {
  eventName: string;
  payload: unknown;
}

export interface EventHistoryEntry {
  eventName: string;
  payload: unknown;
  timestamp: string;
}

export interface DeviceEventEnvelope<TPayload = Record<string, unknown>> {
  deviceId: string;
  deviceType: DeviceType;
  payload: TPayload;
  timestamp: string;
}

export interface EventBusHealth {
  implementation: string;
}

export interface KnownEventPayloads {
  '*': EventHistoryEntry;
  'app:starting': Record<string, never>;
  'app:ready': {
    devices: DeviceState[];
    deviceTypes: string[];
  };
  'board:ready': Record<string, never>;
  'board:stopped': Record<string, never>;
}
