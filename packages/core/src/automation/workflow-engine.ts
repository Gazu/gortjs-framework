import type {
  AutomationRuleCondition,
  Cleanup,
  DeviceCommand,
  EventBusContract,
  WorkflowDefinition,
  WorkflowStep,
} from '@gortjs/contracts';

function getValueAtPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, source);
}

function evaluateCondition(condition: AutomationRuleCondition, payload: unknown): boolean {
  const actualValue = getValueAtPath(payload, condition.path);
  const expectedValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actualValue === expectedValue;
    case 'neq':
      return actualValue !== expectedValue;
    case 'gt':
      return Number(actualValue) > Number(expectedValue);
    case 'gte':
      return Number(actualValue) >= Number(expectedValue);
    case 'lt':
      return Number(actualValue) < Number(expectedValue);
    case 'lte':
      return Number(actualValue) <= Number(expectedValue);
    case 'includes':
      return Array.isArray(actualValue)
        ? actualValue.includes(expectedValue)
        : String(actualValue ?? '').includes(String(expectedValue));
    default:
      return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly cleanups = new Map<string, Cleanup>();
  private readonly schedules = new Map<string, NodeJS.Timeout>();
  private readonly lastExecutionAt = new Map<string, number>();

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      executeCommand: (
        deviceId: string,
        command: DeviceCommand | string,
        payload?: Record<string, unknown>,
      ) => Promise<unknown>;
      executeWorkflowById: (workflowId: string, input?: Record<string, unknown>) => Promise<void>;
      onWorkflowExecuted?: (workflowId: string, source: 'event' | 'schedule' | 'workflow') => void;
      emitEvent?: (eventName: string, payload?: Record<string, unknown>) => void;
      canRun?: () => boolean;
    },
  ) {}

  register(workflow: WorkflowDefinition): void {
    this.unregister(workflow.id);
    this.workflows.set(workflow.id, workflow);

    if (workflow.enabled === false) {
      return;
    }

    if (workflow.trigger?.eventName) {
      const cleanup = this.params.eventBus.on(workflow.trigger.eventName, async (payload) => {
        await this.maybeExecute(workflow, payload, 'event');
      });
      this.cleanups.set(workflow.id, cleanup);
    }

    if (workflow.trigger?.schedule) {
      const run = () => {
        void this.maybeExecute(workflow, { trigger: 'schedule' }, 'schedule');
      };

      if (workflow.trigger.schedule.runAtStartup) {
        run();
      }

      this.schedules.set(workflow.id, setInterval(run, workflow.trigger.schedule.everyMs));
    }
  }

  registerMany(workflows: WorkflowDefinition[]): void {
    for (const workflow of workflows) {
      this.register(workflow);
    }
  }

  unregister(workflowId: string): void {
    this.cleanups.get(workflowId)?.();
    this.cleanups.delete(workflowId);

    const schedule = this.schedules.get(workflowId);
    if (schedule) {
      clearInterval(schedule);
      this.schedules.delete(workflowId);
    }

    this.lastExecutionAt.delete(workflowId);
    this.workflows.delete(workflowId);
  }

  clear(): void {
    for (const workflowId of Array.from(this.workflows.keys())) {
      this.unregister(workflowId);
    }
  }

  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  async execute(workflowId: string, input?: Record<string, unknown>): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow '${workflowId}'`);
    }

    await this.executeSteps(workflow.steps, input ?? {}, 'workflow', workflowId);
  }

  private async maybeExecute(
    workflow: WorkflowDefinition,
    payload: unknown,
    source: 'event' | 'schedule',
  ): Promise<void> {
    if (this.params.canRun && !this.params.canRun()) {
      return;
    }

    if (!this.canExecute(workflow)) {
      return;
    }

    if (!this.matchesConditions(workflow, payload)) {
      return;
    }

    this.lastExecutionAt.set(workflow.id, Date.now());
    await this.executeSteps(workflow.steps, payload, source, workflow.id);
  }

  private matchesConditions(workflow: WorkflowDefinition, payload: unknown): boolean {
    const conditions = workflow.trigger?.conditions
      ?? (workflow.trigger?.condition ? [workflow.trigger.condition] : []);

    if (conditions.length === 0) {
      return true;
    }

    const mode = workflow.trigger?.conditionMatch ?? 'all';
    const results = conditions.map((condition) => evaluateCondition(condition, payload));
    return mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  private canExecute(workflow: WorkflowDefinition): boolean {
    if (!workflow.trigger?.cooldownMs) {
      return true;
    }

    const lastExecution = this.lastExecutionAt.get(workflow.id);
    if (!lastExecution) {
      return true;
    }

    return Date.now() - lastExecution >= workflow.trigger.cooldownMs;
  }

  private async executeSteps(
    steps: WorkflowStep[],
    payload: unknown,
    source: 'event' | 'schedule' | 'workflow',
    workflowId: string,
  ): Promise<void> {
    for (const step of steps) {
      switch (step.type) {
        case 'command':
          await this.params.executeCommand(step.deviceId, step.command, {
            ...(step.payload ?? {}),
          });
          break;
        case 'delay':
          await sleep(step.ms);
          break;
        case 'emit':
          this.params.emitEvent?.(step.eventName, {
            ...(step.payload ?? {}),
            workflowId,
            source,
            triggerPayload: payload,
          });
          break;
        case 'workflow':
          await this.params.executeWorkflowById(step.workflowId, {
            ...(step.input ?? {}),
            parentWorkflowId: workflowId,
          });
          break;
      }
    }

    this.params.onWorkflowExecuted?.(workflowId, source);
  }
}
