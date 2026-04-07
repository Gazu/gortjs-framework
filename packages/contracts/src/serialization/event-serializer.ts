import type { EventHistoryEntry, TransportEventMessage } from '../events/event-types';

function isIsoDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(t|\s)\d{2}:\d{2}:\d{2}/i.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .replace(/__+/g, '_')
    .toLowerCase();
}

function normalizeLogValue(
  value: unknown,
  context: {
    parentKey?: string;
    insidePayload?: boolean;
  } = {},
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogValue(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        toSnakeCase(key),
        normalizeLogValue(nestedValue, {
          parentKey: key,
          insidePayload: context.insidePayload || key === 'payload',
        }),
      ]),
    );
  }

  if (typeof value === 'string') {
    if (context.parentKey === 'eventName') {
      return value;
    }

    if (context.parentKey && /(date|time|timestamp|at)$/i.test(context.parentKey)) {
      return value;
    }

    if (isIsoDateLike(value)) {
      return value;
    }

    if (context.insidePayload) {
      return toSnakeCase(value);
    }
  }

  return value;
}

export class EventSerializer {
  static serializeTransportMessage(message: TransportEventMessage): string {
    return JSON.stringify(message);
  }

  static deserializeTransportMessage(raw: string): TransportEventMessage {
    return JSON.parse(raw) as TransportEventMessage;
  }

  static stringifyEvent(entry: EventHistoryEntry | unknown, pretty = false): string {
    return JSON.stringify(entry, null, pretty ? 2 : undefined);
  }

  static normalizeForLog(entry: EventHistoryEntry | unknown): unknown {
    return normalizeLogValue(entry);
  }

  static stringifyLog(entry: EventHistoryEntry | unknown): string {
    return JSON.stringify(this.normalizeForLog(entry), null, 2);
  }
}
