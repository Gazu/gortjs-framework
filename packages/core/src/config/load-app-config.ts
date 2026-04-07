import { readFile } from 'node:fs/promises';
import type { IoTAppConfig } from '@gortjs/contracts';
import type { DeviceConstructor } from '@gortjs/contracts';
import { validateAppConfig } from './validate-app-config';

export async function loadAppConfig(
  filePath: string,
  deviceTypes: Record<string, DeviceConstructor> = {},
): Promise<IoTAppConfig> {
  const raw = await readFile(filePath, 'utf8');
  const config = JSON.parse(raw) as IoTAppConfig;
  validateAppConfig(config, deviceTypes);
  return config;
}
