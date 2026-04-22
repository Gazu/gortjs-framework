#!/usr/bin/env node
import { resolve } from 'node:path';
import { AppRuntime } from '@gortjs/rest';

function printUsage(): void {
  console.log([
    'Usage:',
    '  gortjs validate <configPath>',
    '  gortjs start <configPath>',
    '  gortjs inspect <url> [--token=TOKEN] [--path=/status]',
    '  gortjs plugins <configPath>',
    '  gortjs cluster <url> [--token=TOKEN]',
  ].join('\n'));
}

function getOption(name: string, args: string[]): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);
  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'validate': {
      if (!target) {
        throw new Error('validate requires a configPath');
      }
      const configPath = resolve(process.cwd(), target);
      const runtime = await AppRuntime.fromFile(configPath);
      console.log(`Config is valid: ${configPath}`);
      await runtime.dispose();
      return;
    }
    case 'start': {
      if (!target) {
        throw new Error('start requires a configPath');
      }
      const configPath = resolve(process.cwd(), target);
      const runtime = await AppRuntime.fromFile(configPath);
      await runtime.start();
      console.log(JSON.stringify({
        ok: true,
        configPath,
        status: runtime.getApp().getStatus(),
        url: runtime.getRestServer()?.getUrl(),
        websocketUrl: runtime.getRestServer()?.getWebSocketUrl(),
      }, null, 2));
      const shutdown = async () => {
        await runtime.dispose();
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown());
      process.on('SIGTERM', () => void shutdown());
      return;
    }
    case 'inspect': {
      if (!target) {
        throw new Error('inspect requires a base url');
      }
      const path = getOption('path', rest) ?? '/status';
      const token = getOption('token', rest);
      const response = await fetch(`${target.replace(/\/$/, '')}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await response.json();
      console.log(JSON.stringify({ status: response.status, body }, null, 2));
      return;
    }
    case 'plugins': {
      if (!target) {
        throw new Error('plugins requires a configPath');
      }
      const configPath = resolve(process.cwd(), target);
      const runtime = await AppRuntime.fromFile(configPath);
      console.log(JSON.stringify(runtime.getAdmin().getPluginCatalog(), null, 2));
      await runtime.dispose();
      return;
    }
    case 'cluster': {
      if (!target) {
        throw new Error('cluster requires a base url');
      }
      const token = getOption('token', rest);
      const response = await fetch(`${target.replace(/\/$/, '')}/cluster`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await response.json();
      console.log(JSON.stringify({ status: response.status, body }, null, 2));
      return;
    }
    default:
      printUsage();
      process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
