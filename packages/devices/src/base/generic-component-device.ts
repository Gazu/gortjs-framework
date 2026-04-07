import type {
  ComponentDriver,
  ComponentEventConfig,
  DeviceCommand,
  GenericComponentConfig,
  GenericComponentKind,
} from '@gortjs/contracts';
import { deviceEventNames } from '@gortjs/contracts';
import { BaseDevice } from './base-device';

function getValueAtPath(source: unknown, path?: string): unknown {
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

export class GenericComponentDevice extends BaseDevice {
  readonly componentClass: string;
  readonly componentKind: GenericComponentKind;
  readonly commandMethods: string[];
  readonly events: ComponentEventConfig[];
  readonly primaryValuePath?: string;
  readonly initialState?: Record<string, unknown>;

  constructor(config: GenericComponentConfig) {
    super(config);
    this.componentClass = config.componentClass;
    this.componentKind = config.componentKind ?? 'hybrid';
    this.commandMethods = config.commandMethods ?? [];
    this.events = config.events ?? [];
    this.primaryValuePath = config.primaryValuePath;
    this.initialState = config.initialState;
  }

  protected get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  async start(): Promise<void> {
    if (!this.driver?.createComponent) {
      throw new Error(`Driver does not support generic components for device ${this.id}`);
    }

    this.instance = this.driver.createComponent({
      componentClass: this.componentClass,
      pin: this.pin,
      pins: this.pins,
      options: this.options,
      emitterOptions: {
        deviceId: this.id,
        interval: Number((this.options.freq as number | undefined) ?? 1000),
        eventBus: this.eventBus,
      },
    });

    this.status = 'ready';
    this.bindComponentEvents();

    if (this.initialState) {
      this.lastState = {
        ...this.initialState,
        updatedAt: new Date().toISOString(),
      };
    }

    this.emit(deviceEventNames.ready(this.id), { state: this.getState() });
  }

  async execute(command: DeviceCommand | string): Promise<void> {
    const normalized = typeof command === 'string' ? { name: command } : command;
    const args = 'payload' in normalized && normalized.payload
      ? Object.values(normalized.payload)
      : [];

    if (this.commandMethods.length > 0 && !this.commandMethods.includes(normalized.name)) {
      throw new Error(`Unsupported command '${normalized.name}' for ${this.componentClass} ${this.id}`);
    }

    const result = this.component.invoke(normalized.name, args);
    this.lastState = {
      command: normalized.name,
      args,
      result,
      updatedAt: new Date().toISOString(),
    };
    this.emit(deviceEventNames.stateChanged(this.id), { state: this.lastState });
  }

  async stop(): Promise<void> {
    this.component.destroy?.();
    await super.stop();
  }

  private bindComponentEvents(): void {
    for (const eventConfig of this.events) {
      this.addCleanup(this.component.on(eventConfig.sourceEvent, (payload) => {
        const value = getValueAtPath(payload, eventConfig.valuePath)
          ?? getValueAtPath(this.component.get(), eventConfig.valuePath ?? this.primaryValuePath);
        const state = getValueAtPath(payload, eventConfig.statePath) ?? this.component.get();

        this.lastState = {
          value,
          state,
          updatedAt: new Date().toISOString(),
        };

        const targetEvent = eventConfig.targetEvent
          ?? (this.componentKind === 'sensor'
            ? deviceEventNames.sensorReading(this.id)
            : deviceEventNames.stateChanged(this.id));

        this.emit(targetEvent, {
          value,
          state: this.lastState,
          sourceEvent: eventConfig.sourceEvent,
        });
      }));
    }
  }
}
