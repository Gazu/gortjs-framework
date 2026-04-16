import type { DeviceCommand } from '../devices/device-types';

export type RuleOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes';
export type ConditionMatchMode = 'all' | 'any';

export interface AutomationRuleCondition {
  path: string;
  operator: RuleOperator;
  value: unknown;
}

export interface CommandRuleAction {
  type?: 'command';
  deviceId: string;
  command: DeviceCommand | string;
  payload?: Record<string, unknown>;
}

export interface WorkflowRuleAction {
  type: 'workflow';
  workflowId: string;
  input?: Record<string, unknown>;
}

export type AutomationRuleAction = CommandRuleAction | WorkflowRuleAction;

export interface AutomationRule {
  id: string;
  eventName: string;
  enabled?: boolean;
  cooldownMs?: number;
  condition?: AutomationRuleCondition;
  conditions?: AutomationRuleCondition[];
  conditionMatch?: ConditionMatchMode;
  actions: AutomationRuleAction[];
}

export interface WorkflowScheduleTrigger {
  everyMs: number;
  runAtStartup?: boolean;
}

export interface WorkflowTrigger {
  eventName?: string;
  schedule?: WorkflowScheduleTrigger;
  cooldownMs?: number;
  condition?: AutomationRuleCondition;
  conditions?: AutomationRuleCondition[];
  conditionMatch?: ConditionMatchMode;
}

export interface WorkflowCommandStep {
  type: 'command';
  deviceId: string;
  command: DeviceCommand | string;
  payload?: Record<string, unknown>;
}

export interface WorkflowDelayStep {
  type: 'delay';
  ms: number;
}

export interface WorkflowEmitStep {
  type: 'emit';
  eventName: string;
  payload?: Record<string, unknown>;
}

export interface WorkflowRunStep {
  type: 'workflow';
  workflowId: string;
  input?: Record<string, unknown>;
}

export type WorkflowStep =
  | WorkflowCommandStep
  | WorkflowDelayStep
  | WorkflowEmitStep
  | WorkflowRunStep;

export interface WorkflowDefinition {
  id: string;
  enabled?: boolean;
  trigger?: WorkflowTrigger;
  steps: WorkflowStep[];
}
