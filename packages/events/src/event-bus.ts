import { EventEmitter } from 'node:events';
import type { EventBusContract } from '@gortjs/contracts';

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
    this.emitter.emit('*', {
      eventName,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}
