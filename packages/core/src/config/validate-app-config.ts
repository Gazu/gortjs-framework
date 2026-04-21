import {
  AutomationRule,
  AutomationRuleCondition,
  ConfigValidationIssue,
  DeviceConfig,
  DeviceConstructor,
  IoTAppConfig,
  WorkflowDefinition,
  isValidTimeZone,
} from '@gortjs/contracts';
import { ConfigValidationError } from './config-validation-error';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushIssue(
  issues: ConfigValidationIssue[],
  path: string,
  message: string,
  received?: unknown,
): void {
  issues.push({
    path,
    message,
    section: path.split(/[.[\]]/, 1)[0] ?? 'config',
    receivedType: typeof received !== 'undefined' ? typeof received : undefined,
  });
}

function validateDeviceConfig(
  device: unknown,
  index: number,
  knownDeviceTypes: Set<string>,
  issues: ConfigValidationIssue[],
): device is DeviceConfig {
  const path = `devices[${index}]`;
  if (!isPlainObject(device)) {
    issues.push({ path, message: 'must be an object' });
    return false;
  }

  if (typeof device.id !== 'string' || device.id.trim() === '') {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }

  if (typeof device.type !== 'string' || device.type.trim() === '') {
    issues.push({ path: `${path}.type`, message: 'must be a non-empty string' });
  } else if (!knownDeviceTypes.has(device.type)) {
    issues.push({ path: `${path}.type`, message: `unknown device type '${device.type}'` });
  }

  if (typeof device.pin === 'undefined' && typeof device.pins === 'undefined') {
    issues.push({ path, message: 'must define either pin or pins' });
  }

  if (typeof device.pin !== 'undefined' && !['string', 'number'].includes(typeof device.pin)) {
    issues.push({ path: `${path}.pin`, message: 'must be a string or number' });
  }

  if (typeof device.pins !== 'undefined' && !Array.isArray(device.pins) && !isPlainObject(device.pins)) {
    issues.push({ path: `${path}.pins`, message: 'must be an array or object' });
  }

  if (device.type === 'motor' && typeof device.pins === 'undefined') {
    issues.push({ path, message: "motor devices require 'pins'" });
  }

  if ((device.type === 'led' || device.type === 'relay' || device.type === 'temperature') && typeof device.pin === 'undefined') {
    issues.push({ path, message: `${device.type} devices require 'pin'` });
  }

  if (typeof device.options !== 'undefined' && !isPlainObject(device.options)) {
    issues.push({ path: `${path}.options`, message: 'must be an object when provided' });
  }

  return true;
}

function validateRule(
  rule: unknown,
  index: number,
  deviceIds: Set<string>,
  workflowIds: Set<string>,
  issues: ConfigValidationIssue[],
): rule is AutomationRule {
  const path = `rules[${index}]`;
  if (!isPlainObject(rule)) {
    issues.push({ path, message: 'must be an object' });
    return false;
  }

  if (typeof rule.id !== 'string' || rule.id.trim() === '') {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }

  if (typeof rule.eventName !== 'string' || rule.eventName.trim() === '') {
    issues.push({ path: `${path}.eventName`, message: 'must be a non-empty string' });
  }

  if (typeof rule.cooldownMs !== 'undefined' && (!Number.isFinite(rule.cooldownMs) || Number(rule.cooldownMs) < 0)) {
    issues.push({ path: `${path}.cooldownMs`, message: 'must be a non-negative number' });
  }

  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    issues.push({ path: `${path}.actions`, message: 'must be a non-empty array' });
  } else {
    rule.actions.forEach((action, actionIndex) => {
      const actionPath = `${path}.actions[${actionIndex}]`;
      if (!isPlainObject(action)) {
        issues.push({ path: actionPath, message: 'must be an object' });
        return;
      }

      if (action.type === 'workflow') {
        if (typeof action.workflowId !== 'string' || action.workflowId.trim() === '') {
          issues.push({ path: `${actionPath}.workflowId`, message: 'must be a non-empty string' });
        } else if (!workflowIds.has(action.workflowId)) {
          issues.push({ path: `${actionPath}.workflowId`, message: `references unknown workflow '${action.workflowId}'` });
        }
      } else {
        if (typeof action.deviceId !== 'string' || action.deviceId.trim() === '') {
          issues.push({ path: `${actionPath}.deviceId`, message: 'must be a non-empty string' });
        } else if (!deviceIds.has(action.deviceId)) {
          issues.push({ path: `${actionPath}.deviceId`, message: `references unknown device '${action.deviceId}'` });
        }

        if (typeof action.command !== 'string' && !isPlainObject(action.command)) {
          issues.push({ path: `${actionPath}.command`, message: 'must be a string or command object' });
        }
      }

      if (typeof action.payload !== 'undefined' && !isPlainObject(action.payload)) {
        issues.push({ path: `${actionPath}.payload`, message: 'must be an object when provided' });
      }
    });
  }

  validateConditionSet(rule.condition, rule.conditions, path, issues);

  return true;
}

function validateCondition(condition: unknown, path: string, issues: ConfigValidationIssue[]): condition is AutomationRuleCondition {
  if (!isPlainObject(condition)) {
    issues.push({ path, message: 'must be an object' });
    return false;
  }

  if (typeof condition.path !== 'string' || condition.path.trim() === '') {
    issues.push({ path: `${path}.path`, message: 'must be a non-empty string' });
  }

  if (
    typeof condition.operator !== 'string'
    || !['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes'].includes(condition.operator)
  ) {
    issues.push({
      path: `${path}.operator`,
      message: "must be one of 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes'",
    });
  }

  if (!('value' in condition)) {
    issues.push({ path: `${path}.value`, message: 'is required' });
  }

  return true;
}

function validateConditionSet(
  condition: unknown,
  conditions: unknown,
  path: string,
  issues: ConfigValidationIssue[],
): void {
  if (typeof condition !== 'undefined') {
    validateCondition(condition, `${path}.condition`, issues);
  }

  if (typeof conditions !== 'undefined') {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      issues.push({ path: `${path}.conditions`, message: 'must be a non-empty array when provided' });
    } else {
      conditions.forEach((entry, index) => {
        validateCondition(entry, `${path}.conditions[${index}]`, issues);
      });
    }
  }
}

function validateWorkflow(
  workflow: unknown,
  index: number,
  deviceIds: Set<string>,
  workflowIds: Set<string>,
  issues: ConfigValidationIssue[],
): workflow is WorkflowDefinition {
  const path = `workflows[${index}]`;
  if (!isPlainObject(workflow)) {
    issues.push({ path, message: 'must be an object' });
    return false;
  }

  if (typeof workflow.id !== 'string' || workflow.id.trim() === '') {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }

  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    issues.push({ path: `${path}.steps`, message: 'must be a non-empty array' });
  } else {
    workflow.steps.forEach((step, stepIndex) => {
      const stepPath = `${path}.steps[${stepIndex}]`;
      if (!isPlainObject(step)) {
        issues.push({ path: stepPath, message: 'must be an object' });
        return;
      }

      switch (step.type) {
        case 'command':
          if (typeof step.deviceId !== 'string' || !deviceIds.has(step.deviceId)) {
            issues.push({ path: `${stepPath}.deviceId`, message: 'must reference a known device' });
          }
          if (typeof step.command !== 'string' && !isPlainObject(step.command)) {
            issues.push({ path: `${stepPath}.command`, message: 'must be a string or command object' });
          }
          break;
        case 'delay':
          if (typeof step.ms !== 'number' || step.ms < 0) {
            issues.push({ path: `${stepPath}.ms`, message: 'must be a non-negative number' });
          }
          break;
        case 'emit':
          if (typeof step.eventName !== 'string' || step.eventName.trim() === '') {
            issues.push({ path: `${stepPath}.eventName`, message: 'must be a non-empty string' });
          }
          break;
        case 'workflow':
          if (typeof step.workflowId !== 'string' || !workflowIds.has(step.workflowId)) {
            issues.push({ path: `${stepPath}.workflowId`, message: 'must reference a known workflow' });
          }
          break;
        default:
          issues.push({ path: `${stepPath}.type`, message: "must be one of 'command', 'delay', 'emit', or 'workflow'" });
      }
    });
  }

  if (typeof workflow.trigger !== 'undefined') {
    if (!isPlainObject(workflow.trigger)) {
      issues.push({ path: `${path}.trigger`, message: 'must be an object' });
    } else {
      if (
        typeof workflow.trigger.eventName === 'undefined'
        && typeof workflow.trigger.schedule === 'undefined'
      ) {
        issues.push({ path: `${path}.trigger`, message: 'must define eventName or schedule' });
      }

      if (
        typeof workflow.trigger.eventName !== 'undefined'
        && (typeof workflow.trigger.eventName !== 'string' || workflow.trigger.eventName.trim() === '')
      ) {
        issues.push({ path: `${path}.trigger.eventName`, message: 'must be a non-empty string' });
      }

      if (typeof workflow.trigger.schedule !== 'undefined') {
        if (!isPlainObject(workflow.trigger.schedule)) {
          issues.push({ path: `${path}.trigger.schedule`, message: 'must be an object' });
        } else if (typeof workflow.trigger.schedule.everyMs !== 'number' || workflow.trigger.schedule.everyMs <= 0) {
          issues.push({ path: `${path}.trigger.schedule.everyMs`, message: 'must be a positive number' });
        }
      }

      validateConditionSet(workflow.trigger.condition, workflow.trigger.conditions, `${path}.trigger`, issues);
    }
  }

  return true;
}

export function validateAppConfig(
  config: IoTAppConfig,
  deviceTypes: Record<string, DeviceConstructor> = {},
): void {
  const issues: ConfigValidationIssue[] = [];
  const knownDeviceTypes = new Set(Object.keys(deviceTypes));
  const devices = Array.isArray(config.devices) ? config.devices : [];
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const workflows = Array.isArray(config.workflows) ? config.workflows : [];

  if (!isPlainObject(config)) {
    throw new ConfigValidationError([{
      path: 'config',
      message: 'must be an object',
      section: 'config',
      receivedType: typeof config,
    }]);
  }

  if (typeof config.devices !== 'undefined' && !Array.isArray(config.devices)) {
    pushIssue(issues, 'devices', 'must be an array when provided', config.devices);
  }

  if (typeof config.rules !== 'undefined' && !Array.isArray(config.rules)) {
    pushIssue(issues, 'rules', 'must be an array when provided', config.rules);
  }

  if (typeof config.workflows !== 'undefined' && !Array.isArray(config.workflows)) {
    pushIssue(issues, 'workflows', 'must be an array when provided', config.workflows);
  }

  if (typeof config.rest !== 'undefined') {
    if (!isPlainObject(config.rest)) {
      issues.push({ path: 'rest', message: 'must be an object when provided' });
    } else {
      if (
        typeof config.rest.enabled !== 'undefined'
        && typeof config.rest.enabled !== 'boolean'
      ) {
        issues.push({ path: 'rest.enabled', message: 'must be a boolean' });
      }

      if (typeof config.rest.host !== 'undefined' && typeof config.rest.host !== 'string') {
        issues.push({ path: 'rest.host', message: 'must be a string' });
      }

      if (
        typeof config.rest.port !== 'undefined'
        && (typeof config.rest.port !== 'number' || !Number.isInteger(config.rest.port) || config.rest.port < 0)
      ) {
        issues.push({ path: 'rest.port', message: 'must be a non-negative integer' });
      }

      if (typeof config.rest.websocketPath !== 'undefined' && typeof config.rest.websocketPath !== 'string') {
        issues.push({ path: 'rest.websocketPath', message: 'must be a string' });
      }

      if (typeof config.rest.auth !== 'undefined') {
        if (!isPlainObject(config.rest.auth)) {
          issues.push({ path: 'rest.auth', message: 'must be an object when provided' });
        } else {
          if (!['static', 'jwt'].includes(String(config.rest.auth.mode))) {
            issues.push({ path: 'rest.auth.mode', message: "must be 'static' or 'jwt'" });
          }

          if (config.rest.auth.mode === 'static' && typeof config.rest.auth.token !== 'string') {
            issues.push({ path: 'rest.auth.token', message: 'is required for static auth' });
          }

          if (
            config.rest.auth.mode === 'jwt'
            && typeof config.rest.auth.publicKey !== 'string'
            && typeof config.rest.auth.publicKeyFile !== 'string'
          ) {
            issues.push({ path: 'rest.auth.publicKey', message: 'publicKey or publicKeyFile is required for jwt auth' });
          }

          if (
            typeof config.rest.auth.scopes !== 'undefined'
            && !isPlainObject(config.rest.auth.scopes)
          ) {
            issues.push({ path: 'rest.auth.scopes', message: 'must be an object when provided' });
          }
        }
      }
    }
  }

  if (typeof config.runtime !== 'undefined') {
    if (!isPlainObject(config.runtime)) {
      issues.push({ path: 'runtime', message: 'must be an object when provided' });
    } else {
      if (
        typeof config.runtime.driver !== 'undefined'
        && (typeof config.runtime.driver !== 'string' || config.runtime.driver.trim() === '')
      ) {
        issues.push({
          path: 'runtime.driver',
          message: 'must be a non-empty string',
        });
      }

      if (
        typeof config.runtime.board !== 'undefined'
        && !isPlainObject(config.runtime.board)
      ) {
        issues.push({ path: 'runtime.board', message: 'must be an object when provided' });
      }

      if (typeof config.runtime.profile !== 'undefined' && typeof config.runtime.profile !== 'string') {
        issues.push({ path: 'runtime.profile', message: 'must be a string' });
      }

      if (typeof config.runtime.timezone !== 'undefined') {
        if (typeof config.runtime.timezone !== 'string' || config.runtime.timezone.trim() === '') {
          issues.push({ path: 'runtime.timezone', message: 'must be a non-empty string' });
        } else if (!isValidTimeZone(config.runtime.timezone)) {
          issues.push({ path: 'runtime.timezone', message: `invalid IANA time zone '${config.runtime.timezone}'` });
        }
      }
    }
  }

  if (typeof config.profiles !== 'undefined' && !isPlainObject(config.profiles)) {
    issues.push({ path: 'profiles', message: 'must be an object when provided' });
  }

  if (typeof config.plugins !== 'undefined') {
    if (!Array.isArray(config.plugins)) {
      issues.push({ path: 'plugins', message: 'must be an array when provided' });
    } else {
      config.plugins.forEach((plugin, index) => {
        if (!isPlainObject(plugin) || typeof plugin.name !== 'string' || plugin.name.trim() === '') {
          issues.push({ path: `plugins[${index}].name`, message: 'must be a non-empty string' });
        }
      });
    }
  }

  if (typeof config.persistence !== 'undefined') {
    if (!isPlainObject(config.persistence)) {
      issues.push({ path: 'persistence', message: 'must be an object when provided' });
    } else {
      if (typeof config.persistence.directory !== 'string' || config.persistence.directory.trim() === '') {
        issues.push({ path: 'persistence.directory', message: 'must be a non-empty string' });
      }

      if (
        typeof config.persistence.maxEvents !== 'undefined'
        && (typeof config.persistence.maxEvents !== 'number' || !Number.isInteger(config.persistence.maxEvents) || config.persistence.maxEvents <= 0)
      ) {
        issues.push({ path: 'persistence.maxEvents', message: 'must be a positive integer' });
      }

      if (
        typeof config.persistence.rotateAfterBytes !== 'undefined'
        && (typeof config.persistence.rotateAfterBytes !== 'number' || !Number.isInteger(config.persistence.rotateAfterBytes) || config.persistence.rotateAfterBytes <= 0)
      ) {
        issues.push({ path: 'persistence.rotateAfterBytes', message: 'must be a positive integer' });
      }

      if (
        typeof config.persistence.maxBackups !== 'undefined'
        && (typeof config.persistence.maxBackups !== 'number' || !Number.isInteger(config.persistence.maxBackups) || config.persistence.maxBackups <= 0)
      ) {
        issues.push({ path: 'persistence.maxBackups', message: 'must be a positive integer' });
      }
    }
  }

  const validatedDevices = devices.filter((device: unknown, index: number) =>
    validateDeviceConfig(device, index, knownDeviceTypes, issues),
  );

  const deviceIds = new Set<string>();
  for (const [index, device] of validatedDevices.entries()) {
    if (deviceIds.has(device.id)) {
      issues.push({ path: `devices[${index}].id`, message: `duplicate device id '${device.id}'` });
    }
    deviceIds.add(device.id);
  }

  const validatedWorkflows = workflows.filter((workflow: unknown, index: number) =>
    validateWorkflow(workflow, index, deviceIds, new Set(workflows.map((entry) => String((entry as { id?: unknown })?.id ?? ''))), issues),
  );

  const workflowIds = new Set<string>();
  for (const [index, workflow] of validatedWorkflows.entries()) {
    if (workflowIds.has(workflow.id)) {
      issues.push({ path: `workflows[${index}].id`, message: `duplicate workflow id '${workflow.id}'` });
    }
    workflowIds.add(workflow.id);
  }

  const validatedRules = rules.filter((rule: unknown, index: number) =>
    validateRule(rule, index, deviceIds, workflowIds, issues),
  );

  const ruleIds = new Set<string>();
  for (const [index, rule] of validatedRules.entries()) {
    if (ruleIds.has(rule.id)) {
      issues.push({ path: `rules[${index}].id`, message: `duplicate rule id '${rule.id}'` });
    }
    ruleIds.add(rule.id);
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}
