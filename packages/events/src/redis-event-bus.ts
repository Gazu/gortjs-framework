import { EventSerializer, type Cleanup, type EventBusContract, type TransportEventMessage } from '@gortjs/contracts';
import type { RedisClientType } from 'redis';

type EventHandler = (payload: unknown) => void;

export class RedisEventBus implements EventBusContract {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly inboundHandler: (message: string) => void;

  constructor(
    private readonly params: {
      channel: string;
      publisher: RedisClientType;
      subscriber: RedisClientType;
      serialize?: (message: TransportEventMessage) => string;
      deserialize?: (raw: string) => TransportEventMessage;
    },
  ) {
    this.inboundHandler = (message: string) => {
      const parsed = (this.params.deserialize ?? EventSerializer.deserializeTransportMessage)(message) as TransportEventMessage;
      this.emitLocal(parsed.eventName, parsed.payload);
    };

    void this.params.subscriber.subscribe(this.params.channel, this.inboundHandler);
  }

  on(eventName: string, handler: EventHandler): Cleanup {
    const handlers = this.handlers.get(eventName) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);
    return () => this.off(eventName, handler);
  }

  once(eventName: string, handler: EventHandler): Cleanup {
    const cleanup = this.on(eventName, (payload) => {
      cleanup();
      handler(payload);
    });

    return cleanup;
  }

  off(eventName: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler);
    if (handlers.size === 0) {
      this.handlers.delete(eventName);
    }
  }

  emit(eventName: string, payload: unknown = {}): void {
    this.emitLocal(eventName, payload);
    const message = (this.params.serialize ?? EventSerializer.serializeTransportMessage)({ eventName, payload });
    void this.params.publisher.publish(this.params.channel, message);
  }

  async dispose(): Promise<void> {
    await this.params.subscriber.unsubscribe(this.params.channel, this.inboundHandler);
    this.handlers.clear();
  }

  private emitLocal(eventName: string, payload: unknown): void {
    const wildcardPayload = {
      eventName,
      payload,
      timestamp: new Date().toISOString(),
    };

    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(payload);
    }

    for (const handler of this.handlers.get('*') ?? []) {
      handler(wildcardPayload);
    }
  }
}
