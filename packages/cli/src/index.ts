#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  GORTJS_FRAMEWORK_VERSION,
  GORTJS_PACKAGE_VERSIONS,
  GORTJS_PLUGIN_API_VERSION,
  GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
} from '@gortjs/contracts';
import { AppRuntime } from '@gortjs/rest';
import {
  createScaffold,
  createTemplateProject,
  describeCompatibility,
  listScaffolds,
  listTemplates,
  type AppTemplateName,
  type ScaffoldKind,
} from './scaffolds';

function printUsage(): void {
  console.log([
    'Usage:',
    '  gortjs validate <configPath>',
    '  gortjs start <configPath>',
    '  gortjs inspect <url> [--token=TOKEN] [--path=/status]',
    '  gortjs dashboard <url> [--token=TOKEN]',
    '  gortjs plugins <configPath>',
    '  gortjs cluster <url> [--token=TOKEN]',
    '  gortjs templates',
    '  gortjs create <targetDir> [--template=minimal|auth|workflows|mock-drivers|production] [--name=my-app]',
    '  gortjs scaffold <plugin|driver|device> <targetDir> --name=name',
    '  gortjs compat',
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
    case 'dashboard': {
      if (!target) {
        throw new Error('dashboard requires a base url');
      }
      const token = getOption('token', rest);
      const url = new URL('/inspector', target);
      if (token) {
        url.searchParams.set('token', token);
      }
      console.log(JSON.stringify({
        ok: true,
        frameworkVersion: GORTJS_FRAMEWORK_VERSION,
        inspectorUrl: url.toString(),
        note: 'Open the inspector URL in a browser to visualize devices, events, workflows, plugins, and metrics.',
      }, null, 2));
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
    case 'templates': {
      console.log(JSON.stringify({
        frameworkVersion: GORTJS_FRAMEWORK_VERSION,
        templates: listTemplates(),
        scaffolds: listScaffolds(),
      }, null, 2));
      return;
    }
    case 'create': {
      if (!target) {
        throw new Error('create requires a targetDir');
      }
      const template = (getOption('template', rest) ?? 'minimal') as AppTemplateName;
      const name = getOption('name', rest) ?? target.split('/').filter(Boolean).at(-1) ?? 'gortjs-app';
      await mkdir(resolve(process.cwd(), target), { recursive: true });
      const files = await createTemplateProject(target, name, template);
      console.log(JSON.stringify({
        ok: true,
        template,
        name,
        createdFiles: files,
      }, null, 2));
      return;
    }
    case 'scaffold': {
      const kind = target as ScaffoldKind | undefined;
      const outputDir = rest[0];
      const name = getOption('name', rest.slice(1));
      if (!kind || !outputDir || !name) {
        throw new Error('scaffold requires <plugin|driver|device> <targetDir> --name=name');
      }
      const files = await createScaffold(outputDir, kind, name);
      console.log(JSON.stringify({
        ok: true,
        kind,
        name,
        createdFiles: files,
      }, null, 2));
      return;
    }
    case 'compat': {
      console.log(JSON.stringify({
        ...describeCompatibility(),
        packageVersions: GORTJS_PACKAGE_VERSIONS,
        expectedPluginApiVersion: GORTJS_PLUGIN_API_VERSION,
        supportedPluginApiVersions: GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
      }, null, 2));
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
