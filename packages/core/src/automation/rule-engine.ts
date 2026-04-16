import type {
  AutomationRule,
  AutomationRuleCondition,
  Cleanup,
  DeviceCommand,
  EventBusContract,
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

function matchesRuleConditions(rule: AutomationRule, payload: unknown): boolean {
  const conditions = rule.conditions ?? (rule.condition ? [rule.condition] : []);
  if (conditions.length === 0) {
    return true;
  }

  const results = conditions.map((condition) => evaluateCondition(condition, payload));
  return (rule.conditionMatch ?? 'all') === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);
}

export class RuleEngine {
  private readonly rules = new Map<string, AutomationRule>();
  private readonly cleanups = new Map<string, Cleanup>();
  private readonly lastExecutionAt = new Map<string, number>();

  constructor(
    private readonly params: {
      eventBus: EventBusContract;
      executeCommand: (
        deviceId: string,
        command: DeviceCommand | string,
        payload?: Record<string, unknown>,
      ) => Promise<unknown>;
      executeWorkflow?: (workflowId: string, input?: Record<string, unknown>) => Promise<void>;
      onRuleExecuted?: (ruleId: string) => void;
    },
  ) {}

  register(rule: AutomationRule): void {
    this.unregister(rule.id);
    this.rules.set(rule.id, rule);

    if (rule.enabled === false) {
      return;
    }

    const cleanup = this.params.eventBus.on(rule.eventName, async (payload) => {
      if (!this.canExecute(rule)) {
        return;
      }

      if (!matchesRuleConditions(rule, payload)) {
        return;
      }

      this.lastExecutionAt.set(rule.id, Date.now());

      for (const action of rule.actions) {
        if (action.type === 'workflow') {
          await this.params.executeWorkflow?.(action.workflowId, action.input ?? {});
          continue;
        }

        await this.params.executeCommand(action.deviceId, action.command, action.payload ?? {});
      }

      this.params.onRuleExecuted?.(rule.id);
    });

    this.cleanups.set(rule.id, cleanup);
  }

  registerMany(rules: AutomationRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  unregister(ruleId: string): void {
    this.cleanups.get(ruleId)?.();
    this.cleanups.delete(ruleId);
    this.rules.delete(ruleId);
    this.lastExecutionAt.delete(ruleId);
  }

  clear(): void {
    for (const ruleId of Array.from(this.rules.keys())) {
      this.unregister(ruleId);
    }
  }

  list(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  private canExecute(rule: AutomationRule): boolean {
    if (!rule.cooldownMs) {
      return true;
    }

    const lastExecution = this.lastExecutionAt.get(rule.id);
    if (!lastExecution) {
      return true;
    }

    return Date.now() - lastExecution >= rule.cooldownMs;
  }
}
