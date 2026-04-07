export interface EventBusContract {
  on(eventName: string, handler: (payload: unknown) => void): () => void;
  once(eventName: string, handler: (payload: unknown) => void): () => void;
  off(eventName: string, handler: (payload: unknown) => void): void;
  emit(eventName: string, payload?: unknown): void;
}
