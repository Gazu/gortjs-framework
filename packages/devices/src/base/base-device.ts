import type {
  DeviceAttachContext,
  DeviceConfig,
  DeviceState,
  BaseDeviceContract,
  Cleanup,
  DeviceEventEnvelope,
  DeviceStatus,
} from '@gortjs/contracts';

export abstract class BaseDevice implements BaseDeviceContract {
  public readonly id: string;
  public readonly type: string;
  public readonly pin?: string | number;
  public readonly pins?: (string | number)[] | Record<string, string | number>;
  public readonly options: Record<string, unknown>;

  protected eventBus!: DeviceAttachContext['eventBus'];
  protected driver!: DeviceAttachContext['driver'];
  protected instance?: unknown;
  protected status: DeviceStatus = 'created';
  protected lastState: Record<string, unknown> | null = null;
  private readonly cleanups = new Set<Cleanup>();

  constructor(config: DeviceConfig) {
    if (!config.id) {
      throw new Error('Device config requires an id');
    }
    if (!config.type) {
      throw new Error(`Device ${config.id} requires a type`);
    }

    this.id = config.id;
    this.type = config.type;
    this.pin = config.pin;
    this.pins = config.pins;
    this.options = config.options ?? {};
  }

  attach(context: DeviceAttachContext): void {
    this.eventBus = context.eventBus;
    this.driver = context.driver;
    this.status = 'attached';
  }

  protected emit<TPayload extends Record<string, unknown>>(
    eventName: string,
    payload: TPayload,
  ): void {
    const event: DeviceEventEnvelope<TPayload> = {
      deviceId: this.id,
      deviceType: this.type,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.eventBus?.emit(eventName, event);
  }

  protected addCleanup(cleanup?: Cleanup): void {
    if (cleanup) {
      this.cleanups.add(cleanup);
    }
  }

  protected async cleanup(): Promise<void> {
    for (const dispose of this.cleanups) {
      dispose();
    }
    this.cleanups.clear();
  }

  abstract start(): Promise<void>;

  async stop(): Promise<void> {
    await this.cleanup();
    this.status = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.instance = undefined;
  }

  getState(): DeviceState {
    return {
      id: this.id,
      type: this.type,
      pin: this.pin,
      pins: this.pins,
      status: this.status,
      state: this.lastState,
    };
  }
}
