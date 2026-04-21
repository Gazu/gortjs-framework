import type {
  AutomationRuleCondition,
  Cleanup,
  DeviceCommand,
  EventBusContract,
  WorkflowConcurrencyPolicy,
  WorkflowDefinition,
  WorkflowJobStatus,
  WorkflowStep,
} from '@gortjs/contracts';
import { createTimestamp, getZonedTimeParts } from '@gortjs/contracts';

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

type CronField = {
  any: boolean;
  values: Set<number>;
};

type ParsedCronExpression = {
  expression: string;
  hasSeconds: boolean;
  second: CronField;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

type WorkflowExecutionState = {
  running: boolean;
  pendingRuns: number;
  runCount: number;
  skippedRuns: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastError?: string;
};

type RegisteredSchedule = {
  cleanup: () => void;
  kind: 'interval' | 'cron';
  expression: string;
  timeZone?: string;
  window?: {
    start?: string;
    end?: string;
  };
  concurrencyPolicy: WorkflowConcurrencyPolicy;
};

function parseCronField(field: string, min: number, max: number): CronField {
  if (field === '*') {
    return { any: true, values: new Set<number>() };
  }

  const values = new Set<number>();
  for (const segment of field.split(',')) {
    const [rangePart, stepPart] = segment.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid cron step '${segment}'`);
    }

    if (rangePart === '*') {
      for (let value = min; value <= max; value += step) {
        values.add(value);
      }
      continue;
    }

    const [startRaw, endRaw] = rangePart.split('-');
    const start = Number(startRaw);
    const end = typeof endRaw === 'undefined' ? start : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid cron range '${segment}'`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return { any: false, values };
}

function parseCronExpression(expression: string): ParsedCronExpression {
  const fields = expression.trim().split(/\s+/);
  if (![5, 6].includes(fields.length)) {
    throw new Error(`Invalid cron expression '${expression}'`);
  }

  const hasSeconds = fields.length === 6;
  const [secondField, minuteField, hourField, dayField, monthField, weekField] = hasSeconds
    ? fields
    : ['0', ...fields];

  return {
    expression,
    hasSeconds,
    second: parseCronField(secondField, 0, 59),
    minute: parseCronField(minuteField, 0, 59),
    hour: parseCronField(hourField, 0, 23),
    dayOfMonth: parseCronField(dayField, 1, 31),
    month: parseCronField(monthField, 1, 12),
    dayOfWeek: parseCronField(weekField, 0, 6),
  };
}

function cronFieldMatches(field: CronField, value: number): boolean {
  return field.any || field.values.has(value);
}

function matchesCron(date: Date, parsed: ParsedCronExpression, timeZone?: string): boolean {
  const parts = timeZone ? getZonedTimeParts(date, timeZone) : {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
  const dayOfWeek = timeZone
    ? new Date(createTimestamp(date, timeZone)).getDay()
    : date.getDay();

  return [
    cronFieldMatches(parsed.second, parts.second),
    cronFieldMatches(parsed.minute, parts.minute),
    cronFieldMatches(parsed.hour, parts.hour),
    cronFieldMatches(parsed.dayOfMonth, parts.day),
    cronFieldMatches(parsed.month, parts.month),
    cronFieldMatches(parsed.dayOfWeek, dayOfWeek),
  ].every(Boolean);
}

function parseClockTime(value?: string): { hour: number; minute: number } | undefined {
  if (!value) {
    return undefined;
  }

  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid clock time '${value}'`);
  }

  return { hour, minute };
}

function isWithinWindow(date: Date, window?: { start?: string; end?: string }, timeZone?: string): boolean {
  if (!window?.start && !window?.end) {
    return true;
  }

  const parts = timeZone ? getZonedTimeParts(date, timeZone) : {
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
  const current = parts.hour * 60 + parts.minute;
  const start = parseClockTime(window.start);
  const end = parseClockTime(window.end);
  const startMinutes = start ? start.hour * 60 + start.minute : undefined;
  const endMinutes = end ? end.hour * 60 + end.minute : undefined;

  if (typeof startMinutes !== 'undefined' && typeof endMinutes !== 'undefined') {
    if (startMinutes <= endMinutes) {
      return current >= startMinutes && current <= endMinutes;
    }

    return current >= startMinutes || current <= endMinutes;
  }

  if (typeof startMinutes !== 'undefined') {
    return current >= startMinutes;
  }

  if (typeof endMinutes !== 'undefined') {
    return current <= endMinutes;
  }

  return true;
}

function findNextCronRun(parsed: ParsedCronExpression, from: Date, timeZone?: string): Date | undefined {
  const stepMs = parsed.hasSeconds ? 1000 : 60_000;
  const candidate = new Date(from.getTime() + stepMs);
  const limit = from.getTime() + 366 * 24 * 60 * 60 * 1000;

  while (candidate.getTime() <= limit) {
    if (matchesCron(candidate, parsed, timeZone)) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + stepMs);
  }

  return undefined;
}

async function runWithRetries(
  runner: () => Promise<void>,
  retries = 0,
  retryDelayMs = 0,
): Promise<void> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      await runner();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
      attempt += 1;
    }
  }

  throw lastError;
}

export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly cleanups = new Map<string, Cleanup>();
  private readonly schedules = new Map<string, RegisteredSchedule>();
  private readonly executionStates = new Map<string, WorkflowExecutionState>();
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
      getTimeZone?: () => string | undefined;
    },
  ) {}

  register(workflow: WorkflowDefinition): void {
    this.unregister(workflow.id);
    this.workflows.set(workflow.id, workflow);
    this.executionStates.set(workflow.id, {
      running: false,
      pendingRuns: 0,
      runCount: 0,
      skippedRuns: 0,
    });

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
      this.registerSchedule(workflow);
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
      schedule.cleanup();
      this.schedules.delete(workflowId);
    }

    this.lastExecutionAt.delete(workflowId);
    this.executionStates.delete(workflowId);
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

  listJobs(): WorkflowJobStatus[] {
    return Array.from(this.schedules.entries()).map(([workflowId, schedule]) => {
      const state = this.executionStates.get(workflowId) ?? {
        running: false,
        pendingRuns: 0,
        runCount: 0,
        skippedRuns: 0,
      };

      return {
        workflowId,
        kind: schedule.kind,
        expression: schedule.expression,
        timeZone: schedule.timeZone,
        window: schedule.window,
        concurrencyPolicy: schedule.concurrencyPolicy,
        running: state.running,
        pendingRuns: state.pendingRuns,
        runCount: state.runCount,
        skippedRuns: state.skippedRuns,
        lastRunAt: state.lastRunAt ? createTimestamp(state.lastRunAt, schedule.timeZone) : undefined,
        nextRunAt: state.nextRunAt ? createTimestamp(state.nextRunAt, schedule.timeZone) : undefined,
        lastError: state.lastError,
      };
    });
  }

  async execute(workflowId: string, input?: Record<string, unknown>): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow '${workflowId}'`);
    }

    await this.runWorkflow(workflow, input ?? {}, 'workflow');
  }

  private registerSchedule(workflow: WorkflowDefinition): void {
    const schedule = workflow.trigger?.schedule;
    if (!schedule) {
      return;
    }

    const timeZone = schedule.timeZone ?? this.params.getTimeZone?.();
    const concurrencyPolicy = schedule.concurrency ?? 'allow';
    const state = this.executionStates.get(workflow.id)!;
    const run = () => {
      void this.maybeExecute(workflow, { trigger: 'schedule' }, 'schedule');
    };

    if (schedule.runAtStartup) {
      run();
    }

    if (schedule.everyMs) {
      state.nextRunAt = new Date(Date.now() + schedule.everyMs);
      const handle = setInterval(() => {
        state.nextRunAt = new Date(Date.now() + schedule.everyMs!);
        run();
      }, schedule.everyMs);
      this.schedules.set(workflow.id, {
        cleanup: () => clearInterval(handle),
        kind: 'interval',
        expression: `${schedule.everyMs}ms`,
        timeZone,
        window: schedule.window,
        concurrencyPolicy,
      });
      return;
    }

    const parsed = parseCronExpression(schedule.cron!);
    state.nextRunAt = findNextCronRun(parsed, new Date(), timeZone);
    const handle = setInterval(() => {
      const now = new Date();
      if (matchesCron(now, parsed, timeZone)) {
        run();
      }
      state.nextRunAt = findNextCronRun(parsed, now, timeZone);
    }, parsed.hasSeconds ? 1000 : 60_000);
    this.schedules.set(workflow.id, {
      cleanup: () => clearInterval(handle),
      kind: 'cron',
      expression: parsed.expression,
      timeZone,
      window: schedule.window,
      concurrencyPolicy,
    });
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

    const scheduleState = this.schedules.get(workflow.id);
    const executionState = this.executionStates.get(workflow.id)!;
    if (source === 'schedule' && scheduleState) {
      const timeZone = scheduleState.timeZone ?? this.params.getTimeZone?.();
      if (!isWithinWindow(new Date(), scheduleState.window, timeZone)) {
        executionState.skippedRuns += 1;
        return;
      }

      if (executionState.running) {
        switch (scheduleState.concurrencyPolicy) {
          case 'forbid':
            executionState.skippedRuns += 1;
            return;
          case 'queue':
            executionState.pendingRuns += 1;
            return;
          default:
            break;
        }
      }
    }

    await this.runWorkflow(workflow, payload, source);
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

  private async runWorkflow(
    workflow: WorkflowDefinition,
    payload: unknown,
    source: 'event' | 'schedule' | 'workflow',
  ): Promise<void> {
    const executionState = this.executionStates.get(workflow.id)!;
    executionState.running = true;
    executionState.lastError = undefined;
    this.lastExecutionAt.set(workflow.id, Date.now());

    try {
      await this.executeSteps(workflow.steps, payload, source, workflow.id);
      executionState.lastRunAt = new Date();
      executionState.runCount += 1;
      this.params.onWorkflowExecuted?.(workflow.id, source);
    } catch (error) {
      executionState.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      executionState.running = false;
      if (executionState.pendingRuns > 0) {
        executionState.pendingRuns -= 1;
        await this.runWorkflow(workflow, { trigger: 'queued' }, source);
      }
    }
  }

  private async executeSteps(
    steps: WorkflowStep[],
    payload: unknown,
    source: 'event' | 'schedule' | 'workflow',
    workflowId: string,
  ): Promise<void> {
    for (const step of steps) {
      if ('if' in step && step.if && !evaluateCondition(step.if, payload)) {
        continue;
      }

      try {
        switch (step.type) {
          case 'command':
            await runWithRetries(
              () => this.params.executeCommand(step.deviceId, step.command, { ...(step.payload ?? {}) }).then(() => undefined),
              step.retries,
              step.retryDelayMs,
            );
            break;
          case 'delay':
            await sleep(step.ms);
            break;
          case 'emit':
            await runWithRetries(
              async () => {
                this.params.emitEvent?.(step.eventName, {
                  ...(step.payload ?? {}),
                  workflowId,
                  source,
                  triggerPayload: payload,
                });
              },
              step.retries,
              step.retryDelayMs,
            );
            break;
          case 'workflow':
            await runWithRetries(
              () => this.params.executeWorkflowById(step.workflowId, {
                ...(step.input ?? {}),
                parentWorkflowId: workflowId,
              }),
              step.retries,
              step.retryDelayMs,
            );
            break;
          case 'branch':
            await this.executeSteps(
              evaluateCondition(step.condition, payload) ? step.then : (step.elseSteps ?? []),
              payload,
              source,
              workflowId,
            );
            break;
        }
      } catch (error) {
        if (step.onError === 'continue') {
          continue;
        }
        throw error;
      }
    }
  }
}
