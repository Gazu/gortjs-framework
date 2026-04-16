import type {
  EventBusContract,
  IoTAppHealth,
  IoTAppMetrics,
  IoTAppStatus,
  PersistenceProvider,
} from '@gortjs/contracts';
import { BoardManager } from '../board/board-manager';
import { DeviceRegistry } from '../devices/device-registry';
import { DeviceTypeRegistry } from '../devices/device-type-registry';
import { RuleEngine } from '../automation/rule-engine';
import { WorkflowEngine } from '../automation/workflow-engine';

export class HealthService {
  constructor(
    private readonly params: {
      boardManager: BoardManager;
      eventBus: EventBusContract;
      registry: DeviceRegistry;
      deviceTypeRegistry: DeviceTypeRegistry;
      ruleEngine: RuleEngine;
      workflowEngine: WorkflowEngine;
      getPersistence: () => PersistenceProvider | undefined;
      getAppStatus: () => IoTAppStatus;
      getMetrics: () => IoTAppMetrics;
    },
  ) {}

  async getHealth(): Promise<IoTAppHealth> {
    const persistenceProvider = this.params.getPersistence();
    const persistenceHealth = persistenceProvider
      ? await persistenceProvider.getHealth()
      : {
          enabled: false,
          initialized: false,
          eventCount: 0,
          maxEvents: 0,
          backups: [],
          writable: false,
      };

    const board = this.params.boardManager.getHealth();

    return {
      ok: board.ready && (!persistenceHealth.enabled || persistenceHealth.writable),
      app: {
        status: this.params.getAppStatus(),
        deviceCount: this.params.registry.count(),
        deviceTypeCount: this.params.deviceTypeRegistry.list().length,
        ruleCount: this.params.ruleEngine.list().length,
      },
      board,
      eventBus: {
        implementation: this.params.eventBus.constructor.name,
      },
      persistence: persistenceHealth,
      metrics: this.params.getMetrics(),
    };
  }
}
