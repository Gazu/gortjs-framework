import type { EventBusContract } from '@gortjs/contracts';

export class NoopEventBus implements EventBusContract {
  on(_eventName: string, _handler: (payload: unknown) => void): () => void {
    return () => {};
  }

  once(_eventName: string, _handler: (payload: unknown) => void): () => void {
    return () => {};
  }

  off(_eventName: string, _handler: (payload: unknown) => void): void {
    // noop
  }

  emit(_eventName: string, _payload: unknown = {}): void {
    // noop
  }
}