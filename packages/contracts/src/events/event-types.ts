import type { DeviceState, DeviceType } from '../devices/device-types';

export interface TransportEventMessage {
  eventName: string;
  payload: unknown;
  originNodeId?: string;
  timestamp?: string;
  requestId?: string;
  correlationId?: string;
}

export interface EventHistoryEntry {
  eventName: string;
  payload: unknown;
  timestamp: string;
  originNodeId?: string;
  requestId?: string;
  correlationId?: string;
}

export interface EventHistoryQuery {
  eventName?: string;
  deviceId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface EventHistoryPage {
  events: EventHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface EventStreamFilter {
  eventName?: string;
  deviceId?: string;
}

export interface RuntimeEventAdapterStatus {
  type: string;
  direction: 'inbound' | 'outbound' | 'both';
  enabled: boolean;
  healthy: boolean;
  target?: string;
  lastError?: string;
  lastEventAt?: string;
  note?: string;
}

export interface DeviceEventEnvelope<TPayload = Record<string, unknown>> {
  deviceId: string;
  deviceType: DeviceType;
  payload: TPayload;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
}

export interface EventBusHealth {
  implementation: string;
}

export interface SystemEventEnvelope<TPayload = Record<string, unknown>> {
  source: 'app' | 'board' | 'device';
  payload: TPayload;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
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
