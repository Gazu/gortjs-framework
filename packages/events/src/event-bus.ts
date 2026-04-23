import { EventEmitter } from 'node:events';
import { createTimestamp, type EventBusContract, type EventHistoryEntry } from '@gortjs/contracts';

function normalizeEventEntry(eventName: string, payload: unknown): EventHistoryEntry {
  const metadata = payload && typeof payload === 'object'
    ? payload as {
      timestamp?: string;
      originNodeId?: string;
      requestId?: string;
      correlationId?: string;
    }
    : {};

  return {
    eventName,
    payload,
    timestamp: metadata.timestamp ?? createTimestamp(),
    originNodeId: metadata.originNodeId,
    requestId: metadata.requestId,
    correlationId: metadata.correlationId,
  };
}

export class EventBus implements EventBusContract {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  on(eventName: string, handler: (payload: unknown) => void): () => void {
    this.emitter.on(eventName, handler);
    return () => this.off(eventName, handler);
  }

  once(eventName: string, handler: (payload: unknown) => void): () => void {
    this.emitter.once(eventName, handler);
    return () => this.off(eventName, handler);
  }

  off(eventName: string, handler: (payload: unknown) => void): void {
    this.emitter.off(eventName, handler);
  }

  emit(eventName: string, payload: unknown = {}): void {
    this.emitter.emit(eventName, payload);
    this.emitter.emit('*', normalizeEventEntry(eventName, payload));
  }
}
