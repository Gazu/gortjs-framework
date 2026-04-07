import type { DeviceCommand } from '../devices/device-types';

export type RuleOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes';

export interface AutomationRuleCondition {
  path: string;
  operator: RuleOperator;
  value: unknown;
}

export interface AutomationRuleAction {
  deviceId: string;
  command: DeviceCommand | string;
  payload?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  eventName: string;
  enabled?: boolean;
  cooldownMs?: number;
  condition?: AutomationRuleCondition;
  actions: AutomationRuleAction[];
}
