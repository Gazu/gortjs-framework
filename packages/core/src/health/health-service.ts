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
      getTimeZone: () => string | undefined;
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
    const appStatus = this.params.getAppStatus();
    const readinessReasons = [
      ...(board.ready ? [] : ['Board is not ready']),
      ...(!persistenceHealth.enabled || persistenceHealth.writable ? [] : ['Persistence is not writable']),
      ...(appStatus === 'running' || appStatus === 'attached' ? [] : [`App status is '${appStatus}'`]),
    ];

    return {
      ok: board.ready && (!persistenceHealth.enabled || persistenceHealth.writable),
      liveness: {
        ok: appStatus !== 'disposed' && appStatus !== 'error',
        status: appStatus,
      },
      readiness: {
        ok: readinessReasons.length === 0,
        status: appStatus,
        reasons: readinessReasons,
      },
      app: {
        status: appStatus,
        timeZone: this.params.getTimeZone(),
        deviceCount: this.params.registry.count(),
        deviceTypeCount: this.params.deviceTypeRegistry.list().length,
        ruleCount: this.params.ruleEngine.list().length,
        workflowCount: this.params.workflowEngine.list().length,
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
