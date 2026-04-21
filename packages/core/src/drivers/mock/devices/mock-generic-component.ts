import type { Cleanup, ComponentDriver, EventEmitterOptions } from '@gortjs/contracts';
import { createTimestamp } from '@gortjs/contracts';

type Handler = (payload: unknown) => void;

export class MockGenericComponent implements ComponentDriver {
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly timer?: NodeJS.Timeout;
  private readonly state: Record<string, unknown>;

  constructor(
    private readonly params: {
      componentClass: string;
      options?: Record<string, unknown>;
      emitterOptions?: EventEmitterOptions;
    },
  ) {
    this.state = { ...(params.options ?? {}) };

    if (params.componentClass === 'Servo') {
      this.state.position = Number(this.state.startAt ?? 0);
    }

    if (params.emitterOptions) {
      this.timer = setInterval(() => {
        const payload = this.createSensorPayload();
        this.emitLocal('data', payload);
        this.emitLocal('change', payload);
        this.emitComponentSpecificEvents(payload);
      }, params.emitterOptions.interval);
    }
  }

  on(eventName: string, handler: Handler): Cleanup {
    const handlers = this.handlers.get(eventName) ?? new Set<Handler>();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);
    return () => this.handlers.get(eventName)?.delete(handler);
  }

  invoke(methodName: string, args: unknown[] = []): unknown {
    this.state.lastMethod = methodName;
    this.state.lastArgs = args;
    this.state.updatedAt = createTimestamp();
    this.applyMethodState(methodName, args);
    this.emitLocal('change', {
      method: methodName,
      args,
      state: { ...this.state },
    });
    return undefined;
  }

  get(path?: string): unknown {
    if (!path) {
      return { ...this.state };
    }

    return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, this.state);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.handlers.clear();
  }

  private emitLocal(eventName: string, payload: unknown): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(payload);
    }
  }

  private createSensorPayload(): Record<string, unknown> {
    const baseValue = Math.floor(Math.random() * 1024);

    switch (this.params.componentClass) {
      case 'Thermometer': {
        const celsius = Math.round((baseValue / 10) * 10) / 10;
        return {
          celsius,
          fahrenheit: Math.round((celsius * 1.8 + 32) * 10) / 10,
          kelvin: Math.round((celsius + 273.15) * 10) / 10,
          updatedAt: createTimestamp(),
        };
      }
      case 'Proximity': {
        const cm = Math.round((baseValue / 20) * 10) / 10;
        return {
          cm,
          inches: Math.round((cm / 2.54) * 10) / 10,
          updatedAt: createTimestamp(),
        };
      }
      default:
        return {
          value: baseValue,
          componentClass: this.params.componentClass,
          updatedAt: createTimestamp(),
        };
    }
  }

  private emitComponentSpecificEvents(payload: Record<string, unknown>): void {
    switch (this.params.componentClass) {
      case 'Button': {
        const cycle = Math.floor(Math.random() * 3);
        const eventName = cycle === 0 ? 'press' : cycle === 1 ? 'release' : 'hold';
        this.state.pressed = eventName !== 'release';
        this.emitLocal(eventName, {
          pressed: this.state.pressed,
          updatedAt: createTimestamp(),
        });
        break;
      }
      case 'Motion': {
        const eventName = Math.random() > 0.5 ? 'motionstart' : 'motionend';
        this.emitLocal(eventName, payload);
        break;
      }
      case 'Switch': {
        const eventName = Math.random() > 0.5 ? 'open' : 'close';
        this.emitLocal(eventName, payload);
        break;
      }
      default:
        break;
    }
  }

  private applyMethodState(methodName: string, args: unknown[]): void {
    if (this.params.componentClass === 'Servo') {
      if (methodName === 'to' || methodName === 'step') {
        this.state.position = Number(args[0] ?? this.state.position ?? 0);
      }
      if (methodName === 'center') {
        this.state.position = 90;
      }
      this.state.sweeping = methodName === 'sweep';
    }

    if (this.params.componentClass === 'Piezo') {
      this.state.playing = !['noTone', 'off', 'stop'].includes(methodName);
      this.state.frequency = methodName === 'frequency' ? Number(args[0] ?? 0) : this.state.frequency;
    }
  }
}
