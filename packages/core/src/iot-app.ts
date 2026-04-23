import {
  AutomationRule,
  BaseDeviceContract,
  DeviceCommand,
  DeviceConfig,
  DeviceConstructor,
  DriverContract,
  EventBusContract,
  EventHistoryEntry,
  EventHistoryPage,
  EventHistoryQuery,
  IoTAppHealth,
  IoTAppConfig,
  IoTAppImportSnapshot,
  IoTAppMetrics,
  IoTAppSnapshot,
  IoTAppStatus,
  SupportedDriverName,
  WorkflowJobStatus,
  WorkflowDefinition,
  PersistenceProvider,
  PersistenceConfig,
  configureTimeZone,
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
import { WorkflowEngine } from './automation/workflow-engine';
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
import { AppMetricsService } from './metrics/app-metrics';
import { createPersistenceProvider } from './persistence/persistence-factory';

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
  driver?: SupportedDriverName;
  driverInstance?: DriverContract;
  eventBus?: EventBusContract;
  board?: Record<string, unknown>;
  deviceTypes?: Record<string, DeviceConstructor>;
  persistence?: PersistenceConfig;
  persistenceProvider?: PersistenceProvider;
  rules?: AutomationRule[];
  workflows?: WorkflowDefinition[];
  timeZone?: string;
  nodeId?: string;
};

export class IoTApp {
  private status: IoTAppStatus = 'created';
  private readonly eventBus: EventBusContract;
  private readonly driver: DriverContract;
  private readonly boardManager: BoardManager;
  private readonly registry: DeviceRegistry;
  private readonly commandDispatcher: CommandDispatcher;
  private readonly deviceTypeRegistry: DeviceTypeRegistry;
  private readonly ruleEngine: RuleEngine;
  private readonly workflowEngine: WorkflowEngine;
  private readonly healthService: HealthService;
  private readonly metrics: AppMetricsService;
  private persistence?: PersistenceProvider;
  private readonly timeZone?: string;
  private readonly nodeId?: string;

  constructor(
    private readonly options: IoTAppOptions = {}) {
    this.timeZone = options.timeZone;
    this.nodeId = options.nodeId;
    configureTimeZone(this.timeZone);
    this.driver = options.driverInstance ?? this.createDriver(options);
    this.eventBus = options.eventBus ?? new EventBus();
    this.boardManager = new BoardManager({ driver: this.driver, eventBus: this.eventBus });
    this.registry = new DeviceRegistry({ driver: this.driver, eventBus: this.eventBus });
    this.commandDispatcher = new CommandDispatcher({ registry: this.registry, eventBus: this.eventBus });
    this.metrics = new AppMetricsService();
    this.ruleEngine = new RuleEngine({
      eventBus: this.eventBus,
      executeCommand: (deviceId, command, payload) => this.command(deviceId, command, payload),
      executeWorkflow: (workflowId, input) => this.executeWorkflow(workflowId, input),
      onRuleExecuted: () => this.metrics.increment('rulesExecuted'),
    });
    this.workflowEngine = new WorkflowEngine({
      eventBus: this.eventBus,
      executeCommand: (deviceId, command, payload) => this.command(deviceId, command, payload),
      executeWorkflowById: (workflowId, input) => this.executeWorkflow(workflowId, input),
      emitEvent: (eventName, payload) => this.eventBus.emit(eventName, payload),
      canRun: () => this.status === 'running',
      onWorkflowExecuted: (_workflowId, source) => {
        this.metrics.increment('workflowsExecuted');
        if (source === 'schedule') {
          this.metrics.increment('scheduledExecutions');
        }
      },
    });
    this.deviceTypeRegistry = new DeviceTypeRegistry({
      ...DEFAULT_DEVICE_TYPES,
      ...(options.deviceTypes ?? {}),
    });

    this.eventBus.on('*', () => {
      this.metrics.increment('eventsObserved');
    });

    this.enablePersistence(options.persistence, options.persistenceProvider);

    if (options.rules?.length) {
      this.ruleEngine.registerMany(options.rules);
    }
    if (options.workflows?.length) {
      this.workflowEngine.registerMany(options.workflows);
    }

    this.healthService = new HealthService({
      boardManager: this.boardManager,
      eventBus: this.eventBus,
      registry: this.registry,
      deviceTypeRegistry: this.deviceTypeRegistry,
      ruleEngine: this.ruleEngine,
      workflowEngine: this.workflowEngine,
      getPersistence: () => this.persistence,
      getAppStatus: () => this.status,
      getMetrics: () => this.getMetrics(),
      getTimeZone: () => this.timeZone,
    });
  }

  static fromConfig(config: IoTAppConfig): IoTApp {
    return new IoTApp({
      driver: config.runtime?.driver ?? 'johnny-five',
      board: config.runtime?.board,
      persistence: config.persistence,
      workflows: config.workflows,
      timeZone: config.runtime?.timezone,
      nodeId: config.runtime?.cluster?.nodeId,
    });
  }

  on(eventName: string, handler: (payload: unknown) => void): () => void {
    return this.eventBus.on(eventName, handler);
  }

  once(eventName: string, handler: (payload: unknown) => void): () => void {
    return this.eventBus.once(eventName, handler);
  }

  registerDevice(config: DeviceConfig): BaseDeviceContract {
    this.assertMutable('register devices');
    const DeviceClass = this.deviceTypeRegistry.get(config.type);
    if (!DeviceClass) {
      throw new Error(`Unknown device type '${config.type}'`);
    }

    const device = new DeviceClass(config);
    return this.registry.register(device);
  }

  registerRule(rule: AutomationRule): void {
    this.assertMutable('register rules');
    this.ruleEngine.register(rule);
  }

  registerRules(rules: AutomationRule[]): void {
    this.ruleEngine.registerMany(rules);
  }

  registerWorkflow(workflow: WorkflowDefinition): void {
    this.assertMutable('register workflows');
    this.workflowEngine.register(workflow);
  }

  registerWorkflows(workflows: WorkflowDefinition[]): void {
    this.assertMutable('register workflows');
    this.workflowEngine.registerMany(workflows);
  }

  unregisterWorkflow(workflowId: string): void {
    this.assertMutable('unregister workflows');
    this.workflowEngine.unregister(workflowId);
  }

  clearWorkflows(): void {
    this.assertMutable('clear workflows');
    this.workflowEngine.clear();
  }

  unregisterRule(ruleId: string): void {
    this.assertMutable('unregister rules');
    this.ruleEngine.unregister(ruleId);
  }

  clearRules(): void {
    this.assertMutable('clear rules');
    this.ruleEngine.clear();
  }

  getRules(): AutomationRule[] {
    return this.ruleEngine.list();
  }

  getWorkflows(): WorkflowDefinition[] {
    return this.workflowEngine.list();
  }

  getWorkflowJobs(): WorkflowJobStatus[] {
    return this.workflowEngine.listJobs();
  }

  getDevice(deviceId: string): BaseDeviceContract {
    return this.registry.get(deviceId);
  }

  hasDevice(deviceId: string): boolean {
    try {
      this.getDevice(deviceId);
      return true;
    } catch {
      return false;
    }
  }

  getDevices() {
    return this.registry.serializeAll();
  }

  getDeviceTypes(): string[] {
    return this.deviceTypeRegistry.list();
  }

  registerDeviceType(type: string, deviceConstructor: DeviceConstructor): void {
    this.assertMutable('register device types');
    this.deviceTypeRegistry.register(type, deviceConstructor);
  }

  async configure(config: IoTAppConfig): Promise<void> {
    this.assertMutable('configure the app');
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
    if (config.workflows?.length) {
      this.registerWorkflows(config.workflows);
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

  async attach(): Promise<void> {
    if (this.status === 'disposed') {
      throw new Error('Cannot attach a disposed IoTApp');
    }

    if (this.status === 'created' || this.status === 'stopped') {
      this.status = 'attached';
    }
  }

  async command(
    deviceId: string,
    command: DeviceCommand | string,
    payload: Record<string, unknown> = {},
    context?: {
      requestId?: string;
      correlationId?: string;
    },
  ) {
    this.metrics.increment('commandsDispatched');
    return this.commandDispatcher.dispatch(deviceId, command, payload, context);
  }

  async executeWorkflow(workflowId: string, input?: Record<string, unknown>): Promise<void> {
    return this.workflowEngine.execute(workflowId, input);
  }

  ingestEvent(eventName: string, payload: unknown = {}): void {
    this.eventBus.emit(eventName, payload);
  }

  async start(): Promise<void> {
    if (this.status === 'disposed') {
      throw new Error('Cannot start a disposed IoTApp');
    }

    if (this.status === 'running') {
      return;
    }

    if (this.status === 'created') {
      await this.attach();
    }

    await this.persistence?.initialize();
    await this.boardManager.start();
    await this.registry.startAll();
    this.metrics.increment('appStarts');
    this.status = 'running';
    this.eventBus.emit(appEventNames.ready, {
      devices: this.getDevices(),
      deviceTypes: this.getDeviceTypes(),
      nodeId: this.nodeId,
    });
  }

  async stop(): Promise<void> {
    if (this.status === 'disposed' || this.status === 'stopped' || this.status === 'created') {
      this.status = this.status === 'created' ? 'stopped' : this.status;
      return;
    }

    await this.registry.stopAll();
    await this.boardManager.stop();
    await this.persistence?.dispose();
    this.metrics.increment('appStops');
    this.status = 'stopped';
  }

  async dispose(): Promise<void> {
    if (this.status === 'disposed') {
      return;
    }

    await this.stop();
    this.ruleEngine.clear();
    this.workflowEngine.clear();
    await this.registry.disposeAll();
    this.status = 'disposed';
  }

  getEventHistory(limit?: number): EventHistoryEntry[] {
    return this.persistence?.getEventHistory(limit) ?? [];
  }

  queryEventHistory(query?: EventHistoryQuery): EventHistoryPage {
    return this.persistence?.queryEventHistory?.(query) ?? {
      events: this.getEventHistory(query?.pageSize),
      total: this.getEventHistory().length,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? this.getEventHistory().length,
      hasNextPage: false,
    };
  }

  getPersistedDeviceStates() {
    return this.persistence?.getPersistedStates() ?? [];
  }

  async getHealth(): Promise<IoTAppHealth> {
    return this.healthService.getHealth();
  }

  getMetrics(): IoTAppMetrics {
    return this.metrics.snapshot();
  }

  getStatus(): IoTAppStatus {
    return this.status;
  }

  getTimeZone(): string | undefined {
    return this.timeZone;
  }

  getSnapshot(): IoTAppSnapshot {
    return {
      status: this.status,
      devices: this.getDevices(),
      deviceTypes: this.getDeviceTypes(),
      rules: this.getRules(),
      workflows: this.getWorkflows(),
    };
  }

  async applySnapshot(snapshot: IoTAppImportSnapshot): Promise<void> {
    this.assertMutable('apply snapshot');
    await this.registry.disposeAll();
    this.registry.clear();
    this.clearRules();
    this.clearWorkflows();

    for (const device of snapshot.devices ?? []) {
      this.registerDevice(device);
    }
    if (snapshot.rules?.length) {
      this.registerRules(snapshot.rules);
    }
    if (snapshot.workflows?.length) {
      this.registerWorkflows(snapshot.workflows);
    }
  }

  private assertMutable(action: string): void {
    if (this.status === 'running') {
      throw new Error(`Cannot ${action} while the IoTApp is running`);
    }

    if (this.status === 'disposed') {
      throw new Error(`Cannot ${action} after the IoTApp has been disposed`);
    }
  }

  private enablePersistence(config?: PersistenceConfig, provider?: PersistenceProvider): void {
    if (provider) {
      this.persistence = provider;
      return;
    }

    if (!config || this.persistence) {
      return;
    }

    this.persistence = createPersistenceProvider(this.eventBus, config);
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
