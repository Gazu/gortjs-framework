import { EventSerializer, createTimestamp, type Cleanup, type EventBusContract, type TransportEventMessage } from '@gortjs/contracts';
import WebSocket, { WebSocketServer } from 'ws';

type EventHandler = (payload: unknown) => void;

function normalizeMessageData(data: WebSocket.RawData): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString('utf8');
  }

  return data.toString('utf8');
}

export class WebSocketEventBus implements EventBusContract {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly socketListeners = new Map<WebSocket, (data: WebSocket.RawData) => void>();
  private readonly connectionListener?: (socket: WebSocket) => void;

  constructor(
    private readonly params: {
      server?: WebSocketServer;
      client?: WebSocket;
      serialize?: (message: TransportEventMessage) => string;
      deserialize?: (raw: string) => TransportEventMessage;
    },
  ) {
    if (!params.server && !params.client) {
      throw new Error('WebSocketEventBus requires a WebSocket client, server, or both');
    }

    if (params.server) {
      this.connectionListener = (socket: WebSocket) => {
        this.attachSocket(socket);
      };

      params.server.on('connection', this.connectionListener);
      for (const socket of params.server.clients) {
        this.attachSocket(socket);
      }
    }

    if (params.client) {
      this.attachSocket(params.client);
    }
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

    if (this.params.client && this.params.client.readyState === WebSocket.OPEN) {
      this.params.client.send(message);
    }

    if (this.params.server) {
      for (const socket of this.params.server.clients) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    }
  }

  dispose(): void {
    if (this.params.server && this.connectionListener) {
      this.params.server.off('connection', this.connectionListener);
    }

    for (const [socket, listener] of this.socketListeners) {
      socket.off('message', listener);
    }

    this.socketListeners.clear();
    this.handlers.clear();
  }

  private attachSocket(socket: WebSocket): void {
    if (this.socketListeners.has(socket)) {
      return;
    }

    const listener = (data: WebSocket.RawData) => {
      const raw = normalizeMessageData(data);
      const parsed = (this.params.deserialize ?? EventSerializer.deserializeTransportMessage)(raw) as TransportEventMessage;
      this.emitLocal(parsed.eventName, parsed.payload);
    };

    socket.on('message', listener);
    socket.once('close', () => {
      socket.off('message', listener);
      this.socketListeners.delete(socket);
    });
    this.socketListeners.set(socket, listener);
  }

  private emitLocal(eventName: string, payload: unknown): void {
    const wildcardPayload = {
      eventName,
      payload,
      timestamp: createTimestamp(),
    };

    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(payload);
    }

    for (const handler of this.handlers.get('*') ?? []) {
      handler(wildcardPayload);
    }
  }
}
