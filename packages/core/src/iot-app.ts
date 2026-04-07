import type {
  AutomationRule,
  BaseDeviceContract,
  DeviceCommand,
  DeviceConfig,
  DeviceConstructor,
  DriverContract,
  EventBusContract,
  EventHistoryEntry,
  IoTAppHealth,
  IoTAppConfig,
  PersistenceProvider,
  PersistenceConfig,
} from '@gortjs/contracts';
import { appEventNames } from '@gortjs/contracts';
import { EventBus } from '@gortjs/events';
import {
  ButtonDevice,
  LedDevice,
  MotorDevice,
  PiezoDevice,
  ProximityDevice,
  RelayDevice,
  ServoDevice,
  TemperatureSensorDevice,
  ThermometerDevice,
} from '@gortjs/devices';
import { RuleEngine } from './automation/rule-engine';
import { BoardManager } from './board/board-manager';
import { CommandDispatcher } from './commands/command-dispatcher';
import { loadAppConfig } from './config/load-app-config';
import { validateAppConfig } from './config/validate-app-config';
import { DeviceRegistry } from './devices/device-registry';
import { DeviceTypeRegistry } from './devices/device-type-registry';
import { JohnnyFiveDriver } from './drivers/johnny-five/johnny-five-driver';
import { johnnyFiveComponentConstructors } from './drivers/johnny-five/johnny-five-component-registry';
import { MockDriver } from './drivers/mock/mock-driver';
import { HealthService } from './health/health-service';
import { FilePersistence } from './persistence/file-persistence';

const DEFAULT_DEVICE_TYPES: Record<string, DeviceConstructor> = {
  ...johnnyFiveComponentConstructors,
  led: LedDevice,
  relay: RelayDevice,
  motor: MotorDevice,
  temperature: TemperatureSensorDevice,
  servo: ServoDevice,
  piezo: PiezoDevice,
  button: ButtonDevice,
  thermometer: ThermometerDevice,
  proximity: ProximityDevice,
};

type IoTAppOptions = {
  driver?: 'johnny-five' | 'mock';
  driverInstance?: DriverContract;
  eventBus?: EventBusContract;
  board?: Record<string, unknown>;
  deviceTypes?: Record<string, DeviceConstructor>;
  persistence?: PersistenceConfig;
  persistenceProvider?: PersistenceProvider;
  rules?: AutomationRule[];
};

export class IoTApp {
  private readonly eventBus: EventBusContract;
  private readonly driver: DriverContract;
  private readonly boardManager: BoardManager;
  private readonly registry: DeviceRegistry;
  private readonly commandDispatcher: CommandDispatcher;
  private readonly deviceTypeRegistry: DeviceTypeRegistry;
  private readonly ruleEngine: RuleEngine;
  private readonly healthService: HealthService;
  private persistence?: PersistenceProvider;

  constructor(
    private readonly options: IoTAppOptions = {}) {
    this.driver = options.driverInstance ?? this.createDriver(options);
    this.eventBus = options.eventBus ?? new EventBus();
    this.boardManager = new BoardManager({ driver: this.driver, eventBus: this.eventBus });
    this.registry = new DeviceRegistry({ driver: this.driver, eventBus: this.eventBus });
    this.commandDispatcher = new CommandDispatcher({ registry: this.registry, eventBus: this.eventBus });
    this.ruleEngine = new RuleEngine({
      eventBus: this.eventBus,
      executeCommand: (deviceId, command, payload) => this.command(deviceId, command, payload),
    });
    this.deviceTypeRegistry = new DeviceTypeRegistry({
      ...DEFAULT_DEVICE_TYPES,
      ...(options.deviceTypes ?? {}),
    });

    this.enablePersistence(options.persistence, options.persistenceProvider);

    if (options.rules?.length) {
      this.ruleEngine.registerMany(options.rules);
    }

    this.healthService = new HealthService({
      boardManager: this.boardManager,
      eventBus: this.eventBus,
      registry: this.registry,
      deviceTypeRegistry: this.deviceTypeRegistry,
      ruleEngine: this.ruleEngine,
      getPersistence: () => this.persistence,
    });
  }

  on(eventName: string, handler: (payload: unknown) => void): () => void {
    return this.eventBus.on(eventName, handler);
  }

  once(eventName: string, handler: (payload: unknown) => void): () => void {
    return this.eventBus.once(eventName, handler);
  }

  registerDevice(config: DeviceConfig): BaseDeviceContract {
    const DeviceClass = this.deviceTypeRegistry.get(config.type);
    if (!DeviceClass) {
      throw new Error(`Unknown device type '${config.type}'`);
    }

    const device = new DeviceClass(config);
    return this.registry.register(device);
  }

  registerRule(rule: AutomationRule): void {
    this.ruleEngine.register(rule);
  }

  registerRules(rules: AutomationRule[]): void {
    this.ruleEngine.registerMany(rules);
  }

  getRules(): AutomationRule[] {
    return this.ruleEngine.list();
  }

  getDevice(deviceId: string): BaseDeviceContract {
    return this.registry.get(deviceId);
  }

  getDevices() {
    return this.registry.serializeAll();
  }

  getDeviceTypes(): string[] {
    return this.deviceTypeRegistry.list();
  }

  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void {
    this.deviceTypeRegistry.register(type, deviceConstructor);
  }

  async configure(config: IoTAppConfig): Promise<void> {
    validateAppConfig(
      config,
      Object.fromEntries(
        this.getDeviceTypes().map((type) => [type, this.deviceTypeRegistry.get(type)!]),
      ),
    );

    this.enablePersistence(config.persistence);

    for (const device of config.devices ?? []) {
      this.registerDevice(device);
    }

    if (config.rules?.length) {
      this.registerRules(config.rules);
    }
  }

  async configureFromFile(filePath: string): Promise<IoTAppConfig> {
    const config = await loadAppConfig(
      filePath,
      Object.fromEntries(
        this.getDeviceTypes().map((type) => [type, this.deviceTypeRegistry.get(type)!]),
      ),
    );
    await this.configure(config);
    return config;
  }

  async command(
    deviceId: string,
    command: DeviceCommand | string,
    payload: Record<string, unknown> = {},
  ) {
    return this.commandDispatcher.dispatch(deviceId, command, payload);
  }

  async start(): Promise<void> {
    await this.persistence?.initialize();
    await this.boardManager.start();
    await this.registry.startAll();
    this.eventBus.emit(appEventNames.ready, {
      devices: this.getDevices(),
      deviceTypes: this.getDeviceTypes(),
    });
  }

  async stop(): Promise<void> {
    await this.registry.disposeAll();
    await this.boardManager.stop();
    await this.persistence?.dispose();
  }

  getEventHistory(limit?: number): EventHistoryEntry[] {
    return this.persistence?.getEventHistory(limit) ?? [];
  }

  getPersistedDeviceStates() {
    return this.persistence?.getPersistedStates() ?? [];
  }

  async getHealth(): Promise<IoTAppHealth> {
    return this.healthService.getHealth();
  }

  private enablePersistence(config?: PersistenceConfig, provider?: PersistenceProvider): void {
    if (provider) {
      this.persistence = provider;
      return;
    }

    if (!config || this.persistence) {
      return;
    }

    this.persistence = new FilePersistence({
      eventBus: this.eventBus,
      config,
    });
  }

  private createDriver(options: IoTAppOptions): DriverContract {
    if (options.driver === 'mock') {
      return new MockDriver();
    }

    return new JohnnyFiveDriver({
      board: options.board,
    });
  }
}
