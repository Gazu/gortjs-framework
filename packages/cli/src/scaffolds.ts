import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  GORTJS_FRAMEWORK_VERSION,
  GORTJS_PLUGIN_API_VERSION,
  GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
} from '@gortjs/contracts';

export type AppTemplateName = 'minimal' | 'auth' | 'workflows' | 'mock-drivers' | 'production';
export type ScaffoldKind = 'plugin' | 'driver' | 'device';

export type GeneratedFile = {
  path: string;
  contents: string;
};

type TemplateDefinition = {
  name: AppTemplateName;
  description: string;
  files: (targetName: string) => GeneratedFile[];
};

type ScaffoldDefinition = {
  kind: ScaffoldKind;
  description: string;
  files: (name: string) => GeneratedFile[];
};

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('');
}

function toConstCase(value: string): string {
  return toKebabCase(value).replace(/-/g, '_').toUpperCase();
}

function createPackageJson(name: string, extraScripts?: Record<string, string>): string {
  return JSON.stringify({
    name,
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'tsx src/main.ts',
      start: 'tsx src/main.ts',
      validate: 'gortjs validate config/iot.config.json',
      ...extraScripts,
    },
    dependencies: {
      '@gortjs/core': GORTJS_FRAMEWORK_VERSION,
      '@gortjs/rest': GORTJS_FRAMEWORK_VERSION,
      '@gortjs/devices': GORTJS_FRAMEWORK_VERSION,
    },
    devDependencies: {
      '@types/node': '^22.10.1',
      tsx: '^4.19.1',
      typescript: '^5.6.3',
    },
  }, null, 2);
}

function createTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
    },
    include: ['src/**/*.ts'],
  }, null, 2);
}

function createBaseReadme(title: string, sections: string[]): string {
  return `# ${title}

${sections.join('\n\n')}
`;
}

function createMinimalTemplate(targetName: string): GeneratedFile[] {
  return [
    {
      path: 'README.md',
      contents: createBaseReadme(targetName, [
        'Minimal GortJS app scaffolded for release `0.8.0`.',
        '## Run\n\n```bash\nnpm install\nnpm run validate\nnpm run dev\n```',
      ]),
    },
    {
      path: 'package.json',
      contents: `${createPackageJson(toKebabCase(targetName))}\n`,
    },
    {
      path: 'tsconfig.json',
      contents: `${createTsConfig()}\n`,
    },
    {
      path: 'config/iot.config.json',
      contents: `${JSON.stringify({
        runtime: {
          driver: 'mock',
          timezone: 'America/Santiago',
        },
        rest: {
          host: '127.0.0.1',
          port: 3000,
          websocket: {
            path: '/ws',
            replayLimit: 20,
          },
        },
        devices: [
          { id: 'led1', type: 'led', pin: 13 },
          { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 1000 } },
        ],
      }, null, 2)}\n`,
    },
    {
      path: 'src/main.ts',
      contents: `import { fileURLToPath } from 'node:url';
import { AppRuntime } from '@gortjs/rest';

const configPath = fileURLToPath(new URL('../config/iot.config.json', import.meta.url));
const runtime = await AppRuntime.fromFile(configPath);
await runtime.start();

const server = runtime.getRestServer();
console.log(JSON.stringify({
  app: '${toKebabCase(targetName)}',
  status: runtime.getApp().getStatus(),
  url: server?.getUrl(),
  websocketUrl: server?.getWebSocketUrl(),
  inspector: server?.getInspectorUrl?.(),
}, null, 2));

const shutdown = async () => {
  await runtime.dispose();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
`,
    },
  ];
}

function createAuthTemplate(targetName: string): GeneratedFile[] {
  return [
    ...createMinimalTemplate(targetName).map((file) => {
      if (file.path === 'config/iot.config.json') {
        return {
          ...file,
          contents: `${JSON.stringify({
            runtime: {
              driver: 'mock',
              timezone: 'America/Santiago',
            },
            rest: {
              host: '127.0.0.1',
              port: 3000,
              auth: {
                mode: 'static',
                tokenEnv: 'GORT_API_TOKEN',
                tokenScopes: ['gortjs:read', 'gortjs:write', 'gortjs:metrics', 'gortjs:stream'],
              },
            },
            devices: [
              { id: 'gate1', type: 'relay', pin: 7 },
              { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 5000 } },
            ],
          }, null, 2)}\n`,
        };
      }

      return file;
    }),
    {
      path: '.env.example',
      contents: 'GORT_API_TOKEN=change-me-for-local-development\n',
    },
  ];
}

function createWorkflowsTemplate(targetName: string): GeneratedFile[] {
  return [
    ...createMinimalTemplate(targetName).map((file) => {
      if (file.path === 'config/iot.config.json') {
        return {
          ...file,
          contents: `${JSON.stringify({
            runtime: {
              driver: 'mock',
              timezone: 'America/Santiago',
            },
            rest: {
              host: '127.0.0.1',
              port: 3000,
            },
            devices: [
              { id: 'led1', type: 'led', pin: 13 },
              { id: 'relay1', type: 'relay', pin: 7 },
              { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 1000 } },
            ],
            rules: [
              {
                id: 'flash-led-on-hot-reading',
                eventName: 'device:temp1:reading',
                condition: { path: 'payload.value', operator: 'gt', value: 50 },
                actions: [{ deviceId: 'led1', command: 'on' }],
              },
            ],
            workflows: [
              {
                id: 'pulse-relay',
                trigger: {
                  schedule: {
                    everyMs: 30000,
                  },
                },
                steps: [
                  { type: 'command', deviceId: 'relay1', command: 'open' },
                  { type: 'delay', ms: 500 },
                  { type: 'command', deviceId: 'relay1', command: 'close' },
                ],
              },
            ],
          }, null, 2)}\n`,
        };
      }

      return file;
    }),
  ];
}

function createMockDriversTemplate(targetName: string): GeneratedFile[] {
  const pluginName = `${toKebabCase(targetName)}-plugin`;
  const pluginClass = `${toPascalCase(targetName)}LoopbackDriver`;
  return [
    ...createMinimalTemplate(targetName).map((file) => {
      if (file.path === 'config/iot.config.json') {
        return {
          ...file,
          contents: `${JSON.stringify({
            runtime: {
              driver: 'loopback',
              timezone: 'America/Santiago',
            },
            rest: {
              host: '127.0.0.1',
              port: 3000,
            },
            plugins: [
              {
                name: pluginName,
                path: '../src/plugins/loopback-plugin.ts',
              },
            ],
            devices: [
              { id: 'virtual-led', type: 'led', pin: 13 },
            ],
          }, null, 2)}\n`,
        };
      }

      return file;
    }),
    {
      path: 'src/plugins/loopback-plugin.ts',
      contents: `import { MockDriver, createPluginManifest, defineDriverFactory, definePlugin } from '@gortjs/core';

class ${pluginClass} extends MockDriver {
  override get name(): string {
    return 'loopback';
  }
}

export default definePlugin({
  manifest: createPluginManifest({
    name: '${pluginName}',
    version: '0.1.0',
    apiVersion: '${GORTJS_PLUGIN_API_VERSION}',
    description: 'Registers a mock-backed loopback driver for local integration tests and demos.',
    capabilities: {
      drivers: [{ id: 'loopback', driverName: 'loopback', description: 'Mock-backed loopback driver' }],
    },
  }),
  register(api) {
    api.registerDriver('loopback', defineDriverFactory(() => new ${pluginClass}()));
  },
});
`,
    },
  ];
}

function createProductionTemplate(targetName: string): GeneratedFile[] {
  return [
    {
      path: 'README.md',
      contents: createBaseReadme(targetName, [
        'Production-oriented GortJS topology scaffold for `0.8.0`.',
        'This example starts with env-backed auth, Redis persistence, a control plane, and one edge node.',
      ]),
    },
    {
      path: 'package.json',
      contents: `${createPackageJson(toKebabCase(targetName), {
        'start:control-plane': 'GORT_CONFIG_PATH=config/control-plane.json tsx src/main.ts',
        'start:edge': 'GORT_CONFIG_PATH=config/edge.json tsx src/main.ts',
      })}\n`,
    },
    {
      path: 'tsconfig.json',
      contents: `${createTsConfig()}\n`,
    },
    {
      path: '.env.example',
      contents: 'GORT_CLUSTER_TOKEN=replace-me\nGORT_API_TOKEN=replace-me\n',
    },
    {
      path: 'config/control-plane.json',
      contents: `${JSON.stringify({
        runtime: {
          driver: 'mock',
          timezone: 'America/Santiago',
          cluster: {
            role: 'control-plane',
            nodeId: 'control-plane',
            advertisedUrl: 'http://127.0.0.1:4000',
            sharedTokenEnv: 'GORT_CLUSTER_TOKEN',
          },
          events: {
            adapters: [
              {
                type: 'redis',
                direction: 'outbound',
                target: 'redis://127.0.0.1:6379',
                channel: 'gortjs:events',
              },
            ],
          },
        },
        rest: {
          host: '127.0.0.1',
          port: 4000,
          auth: {
            mode: 'static',
            tokenEnv: 'GORT_API_TOKEN',
            tokenScopes: ['gortjs:read', 'gortjs:write', 'gortjs:metrics', 'gortjs:stream'],
          },
        },
        persistence: {
          adapter: 'memory',
          maxEvents: 200,
        },
      }, null, 2)}\n`,
    },
    {
      path: 'config/edge.json',
      contents: `${JSON.stringify({
        runtime: {
          driver: 'mock',
          timezone: 'America/Santiago',
          cluster: {
            role: 'node',
            nodeId: 'edge-1',
            advertisedUrl: 'http://127.0.0.1:3000',
            controlPlaneUrl: 'http://127.0.0.1:4000',
            sharedTokenEnv: 'GORT_CLUSTER_TOKEN',
            remoteCommandRouting: true,
            syncEvents: true,
          },
          events: {
            adapters: [
              {
                type: 'redis',
                direction: 'both',
                target: 'redis://127.0.0.1:6379',
                channel: 'gortjs:events',
              },
              {
                type: 'webhook',
                direction: 'outbound',
                target: 'https://example.com/hooks/gort',
                headers: {
                  'x-gort-environment': 'dev',
                },
              },
            ],
          },
        },
        rest: {
          host: '127.0.0.1',
          port: 3000,
          auth: {
            mode: 'static',
            tokenEnv: 'GORT_API_TOKEN',
            tokenScopes: ['gortjs:read', 'gortjs:write', 'gortjs:metrics', 'gortjs:stream'],
          },
          websocket: {
            path: '/ws',
            replayLimit: 100,
            maxBufferedBytes: 65536,
            slowClientPolicy: 'terminate',
          },
        },
        persistence: {
          adapter: 'redis',
          url: 'redis://127.0.0.1:6379',
          keyPrefix: 'gortjs:edge-1',
          maxEvents: 500,
        },
        devices: [
          { id: 'led1', type: 'led', pin: 13 },
          { id: 'relay1', type: 'relay', pin: 7 },
          { id: 'temp1', type: 'temperature', pin: 'A0', options: { freq: 2500 } },
        ],
      }, null, 2)}\n`,
    },
    {
      path: 'src/main.ts',
      contents: `import { AppRuntime } from '@gortjs/rest';

const configPath = process.env.GORT_CONFIG_PATH ?? new URL('../config/edge.json', import.meta.url).pathname;
const runtime = await AppRuntime.fromFile(configPath);
await runtime.start();

const server = runtime.getRestServer();
console.log(JSON.stringify({
  status: runtime.getApp().getStatus(),
  url: server?.getUrl(),
  inspector: server?.getInspectorUrl?.(),
  clusterRole: runtime.getAdmin().getClusterState?.()?.role,
}, null, 2));

const shutdown = async () => {
  await runtime.dispose();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
`,
    },
  ];
}

const templates: Record<AppTemplateName, TemplateDefinition> = {
  minimal: {
    name: 'minimal',
    description: 'Smallest runnable app with mock devices, REST, and WebSocket streaming.',
    files: createMinimalTemplate,
  },
  auth: {
    name: 'auth',
    description: 'App scaffold with env-backed static auth and a secure REST surface.',
    files: createAuthTemplate,
  },
  workflows: {
    name: 'workflows',
    description: 'App scaffold with rules, scheduled workflows, and automation examples.',
    files: createWorkflowsTemplate,
  },
  'mock-drivers': {
    name: 'mock-drivers',
    description: 'App scaffold that includes a plugin-provided mock-backed custom driver.',
    files: createMockDriversTemplate,
  },
  production: {
    name: 'production',
    description: 'Production-oriented cluster scaffold with auth, Redis persistence, and control-plane config.',
    files: createProductionTemplate,
  },
};

const scaffolds: Record<ScaffoldKind, ScaffoldDefinition> = {
  plugin: {
    kind: 'plugin',
    description: 'Generate a typed plugin module with the 0.8 plugin SDK helpers.',
    files: (name) => {
      const fileName = `${toKebabCase(name)}.ts`;
      const pluginName = toKebabCase(name);
      const className = `${toPascalCase(name)}Driver`;
      return [{
        path: fileName,
        contents: `import { MockDriver, createPluginManifest, defineDriverFactory, definePlugin } from '@gortjs/core';

class ${className} extends MockDriver {
  override get name(): string {
    return '${pluginName}';
  }
}

export default definePlugin({
  manifest: createPluginManifest({
    name: '${pluginName}',
    version: '0.1.0',
    apiVersion: '${GORTJS_PLUGIN_API_VERSION}',
    description: 'Plugin scaffold generated by the official GortJS CLI.',
    keywords: ['gortjs', 'plugin', '${pluginName}'],
    capabilities: {
      drivers: [{ id: '${pluginName}', driverName: '${pluginName}', description: 'Custom driver scaffold' }],
    },
  }),
  register(api) {
    api.registerDriver('${pluginName}', defineDriverFactory(() => new ${className}()));
  },
});
`,
      }];
    },
  },
  driver: {
    kind: 'driver',
    description: 'Generate a mock-backed driver class ready for customization.',
    files: (name) => {
      const className = `${toPascalCase(name)}Driver`;
      return [{
        path: `${toKebabCase(name)}-driver.ts`,
        contents: `import type { CreateComponentParams, CreateDeviceParams, DriverContract, LedDriver, MotorDriver, RelayDriver, SensorDriver } from '@gortjs/contracts';
import { MockDriver } from '@gortjs/core';

export class ${className} extends MockDriver implements DriverContract {
  override get name(): string {
    return '${toKebabCase(name)}';
  }

  override createLed(params: CreateDeviceParams): LedDriver {
    return super.createLed(params);
  }

  override createRelay(params: CreateDeviceParams): RelayDriver {
    return super.createRelay(params);
  }

  override createSensor(params: CreateDeviceParams): SensorDriver {
    return super.createSensor(params);
  }

  override createMotor(params: CreateDeviceParams): MotorDriver {
    return super.createMotor(params);
  }

  override createComponent(params: CreateComponentParams) {
    return super.createComponent(params);
  }
}
`,
      }];
    },
  },
  device: {
    kind: 'device',
    description: 'Generate a typed custom device class that wraps generic component commands.',
    files: (name) => {
      const className = `${toPascalCase(name)}Device`;
      const eventPrefix = toKebabCase(name);
      return [{
        path: `${eventPrefix}-device.ts`,
        contents: `import type { ComponentDriver, DeviceCommand } from '@gortjs/contracts';
import { GenericComponentDevice } from '@gortjs/devices';

export class ${className} extends GenericComponentDevice {
  private get component(): ComponentDriver {
    return this.instance as ComponentDriver;
  }

  override attachDriver(): void {
    if (!this.driver?.createComponent) {
      throw new Error(\`Driver does not support custom components for device \${this.id}\`);
    }

    this.instance = this.driver.createComponent({
      pin: this.pin,
      options: this.options,
      type: '${eventPrefix}',
    });
  }

  override async execute(command: DeviceCommand | string, payload: Record<string, unknown> = {}) {
    return super.execute(command, payload);
  }
}
`,
      }];
    },
  },
};

export function listTemplates(): Array<{ name: AppTemplateName; description: string }> {
  return Object.values(templates).map((template) => ({
    name: template.name,
    description: template.description,
  }));
}

export function listScaffolds(): Array<{ kind: ScaffoldKind; description: string }> {
  return Object.values(scaffolds).map((scaffold) => ({
    kind: scaffold.kind,
    description: scaffold.description,
  }));
}

export async function createTemplateProject(targetDir: string, targetName: string, templateName: AppTemplateName): Promise<string[]> {
  const template = templates[templateName];
  if (!template) {
    throw new Error(`Unknown template '${templateName}'. Run 'gortjs templates' to list available templates.`);
  }
  const root = resolve(process.cwd(), targetDir);
  const files = template.files(targetName);
  for (const file of files) {
    const absolutePath = join(root, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.contents, 'utf8');
  }
  return files.map((file) => join(root, file.path));
}

export async function createScaffold(targetDir: string, kind: ScaffoldKind, name: string): Promise<string[]> {
  const scaffold = scaffolds[kind];
  if (!scaffold) {
    throw new Error(`Unknown scaffold kind '${kind}'. Supported: ${Object.keys(scaffolds).join(', ')}`);
  }
  const root = resolve(process.cwd(), targetDir);
  const files = scaffold.files(name);
  for (const file of files) {
    const absolutePath = join(root, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.contents, 'utf8');
  }
  return files.map((file) => join(root, file.path));
}

export function describeCompatibility(): Record<string, unknown> {
  return {
    framework: GORTJS_FRAMEWORK_VERSION,
    pluginApiVersion: GORTJS_PLUGIN_API_VERSION,
    supportedPluginApiVersions: GORTJS_SUPPORTED_PLUGIN_API_VERSIONS,
  };
}
