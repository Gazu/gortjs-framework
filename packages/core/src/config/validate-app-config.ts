import type {
  AutomationRule,
  ConfigValidationIssue,
  DeviceConfig,
  DeviceConstructor,
  IoTAppConfig,
} from '@gortjs/contracts';
import { ConfigValidationError } from './config-validation-error';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

      if (typeof action.deviceId !== 'string' || action.deviceId.trim() === '') {
        issues.push({ path: `${actionPath}.deviceId`, message: 'must be a non-empty string' });
      } else if (!deviceIds.has(action.deviceId)) {
        issues.push({ path: `${actionPath}.deviceId`, message: `references unknown device '${action.deviceId}'` });
      }

      if (typeof action.command !== 'string' && !isPlainObject(action.command)) {
        issues.push({ path: `${actionPath}.command`, message: 'must be a string or command object' });
      }

      if (typeof action.payload !== 'undefined' && !isPlainObject(action.payload)) {
        issues.push({ path: `${actionPath}.payload`, message: 'must be an object when provided' });
      }
    });
  }

  if (typeof rule.condition !== 'undefined') {
    if (!isPlainObject(rule.condition)) {
      issues.push({ path: `${path}.condition`, message: 'must be an object' });
    } else {
      if (typeof rule.condition.path !== 'string' || rule.condition.path.trim() === '') {
        issues.push({ path: `${path}.condition.path`, message: 'must be a non-empty string' });
      }

      if (
        typeof rule.condition.operator !== 'string'
        || !['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes'].includes(rule.condition.operator)
      ) {
        issues.push({
          path: `${path}.condition.operator`,
          message: "must be one of 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes'",
        });
      }

      if (!('value' in rule.condition)) {
        issues.push({ path: `${path}.condition.value`, message: 'is required' });
      }
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

  if (!isPlainObject(config)) {
    throw new ConfigValidationError([{ path: 'config', message: 'must be an object' }]);
  }

  if (typeof config.devices !== 'undefined' && !Array.isArray(config.devices)) {
    issues.push({ path: 'devices', message: 'must be an array when provided' });
  }

  if (typeof config.rules !== 'undefined' && !Array.isArray(config.rules)) {
    issues.push({ path: 'rules', message: 'must be an array when provided' });
  }

  if (typeof config.rest !== 'undefined') {
    if (!isPlainObject(config.rest)) {
      issues.push({ path: 'rest', message: 'must be an object when provided' });
    } else {
      if (
        typeof config.rest.port !== 'undefined'
        && (typeof config.rest.port !== 'number' || !Number.isInteger(config.rest.port) || config.rest.port <= 0)
      ) {
        issues.push({ path: 'rest.port', message: 'must be a positive integer' });
      }

      if (typeof config.rest.websocketPath !== 'undefined' && typeof config.rest.websocketPath !== 'string') {
        issues.push({ path: 'rest.websocketPath', message: 'must be a string' });
      }
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

  const validatedRules = rules.filter((rule: unknown, index: number) =>
    validateRule(rule, index, deviceIds, issues),
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
