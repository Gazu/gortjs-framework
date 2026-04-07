import type { Cleanup, ComponentDriver } from '@gortjs/contracts';

function getPathValue(source: unknown, path?: string): unknown {
  if (!path) {
    return source;
  }

  return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

export class GenericJohnnyFiveComponentDriver implements ComponentDriver {
  constructor(private readonly instance: Record<string, unknown>) {}

  on(eventName: string, handler: (payload: unknown) => void): Cleanup {
    const on = this.instance.on;
    const off = this.instance.off ?? this.instance.removeListener;

    if (typeof on !== 'function') {
      throw new Error(`Component does not support event '${eventName}'`);
    }

    on.call(this.instance, eventName, handler);
    return () => {
      if (typeof off === 'function') {
        off.call(this.instance, eventName, handler);
      }
    };
  }

  invoke(methodName: string, args: unknown[] = []): unknown {
    const method = this.instance[methodName];
    if (typeof method !== 'function') {
      throw new Error(`Component does not implement method '${methodName}'`);
    }

    return method.apply(this.instance, args);
  }

  get(path?: string): unknown {
    return getPathValue(this.instance, path) ?? this.instance;
  }

  destroy(): void {
    const stop = this.instance.stop;
    const off = this.instance.off;
    if (typeof stop === 'function') {
      stop.call(this.instance);
    }
    if (typeof off === 'function') {
      off.call(this.instance);
    }
  }
}
