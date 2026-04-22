import type { PluginApiVersion } from '../plugins/plugin-types';

export const GORTJS_FRAMEWORK_VERSION = '0.8.0';
export const GORTJS_PLUGIN_API_VERSION: PluginApiVersion = '0.8';
export const GORTJS_SUPPORTED_PLUGIN_API_VERSIONS: PluginApiVersion[] = ['0.6', '0.8'];

export const GORTJS_PACKAGE_VERSIONS = {
  contracts: GORTJS_FRAMEWORK_VERSION,
  core: GORTJS_FRAMEWORK_VERSION,
  devices: GORTJS_FRAMEWORK_VERSION,
  events: GORTJS_FRAMEWORK_VERSION,
  rest: GORTJS_FRAMEWORK_VERSION,
  cli: GORTJS_FRAMEWORK_VERSION,
  basicApp: GORTJS_FRAMEWORK_VERSION,
} as const;
