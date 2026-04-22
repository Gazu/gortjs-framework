import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type {
  DeviceConstructor,
  IoTAppConfig,
  RuntimeAdminProvider,
  RuntimeProfileConfig,
  RuntimeNodeSummary,
} from '@gortjs/contracts';
import {
  GORTJS_FRAMEWORK_VERSION as FRAMEWORK_VERSION,
  GORTJS_PACKAGE_VERSIONS as PACKAGE_VERSIONS,
  GORTJS_PLUGIN_API_VERSION as PLUGIN_API_VERSION,
  GORTJS_SUPPORTED_PLUGIN_API_VERSIONS as SUPPORTED_PLUGIN_API_VERSIONS,
} from '@gortjs/contracts';
import { IoTApp, PluginRegistry, JohnnyFiveDriver, MockDriver } from '@gortjs/core';
import type { GortPlugin } from '@gortjs/core';
import { RestServer } from './rest-server';
import { ClusterManager } from './cluster-manager';
import { RuntimeEventBridge } from './runtime-event-bridge';

function mergeProfile(base: IoTAppConfig, profile?: RuntimeProfileConfig): IoTAppConfig {
  if (!profile) {
    return base;
  }

  return {
    ...base,
    runtime: {
      ...(base.runtime ?? {}),
      ...(profile.runtime ?? {}),
    },
    rest: {
      ...(base.rest ?? {}),
      ...(profile.rest ?? {}),
    },
    persistence: profile.persistence ?? base.persistence,
    plugins: [
      ...(base.plugins ?? []),
      ...(profile.plugins ?? []),
    ],
  };
}

function resolveRuntimePaths(config: IoTAppConfig, filePath: string): IoTAppConfig {
  const configDir = dirname(filePath);
  const resolveMaybe = (target?: string): string | undefined => {
    if (!target || isAbsolute(target)) {
      return target;
    }

    return resolve(configDir, target);
  };

  if (config.persistence?.adapter !== 'memory' && config.persistence && 'directory' in config.persistence && config.persistence.directory) {
    config.persistence.directory = resolveMaybe(config.persistence.directory)!;
  }

  if (config.rest?.auth?.publicKeyFile) {
    config.rest.auth.publicKeyFile = resolveMaybe(config.rest.auth.publicKeyFile)!;
  }
  if (config.rest?.auth?.publicKeyFiles) {
    config.rest.auth.publicKeyFiles = config.rest.auth.publicKeyFiles.map((file) => resolveMaybe(file)!);
  }

  for (const pluginRef of config.plugins ?? []) {
    if (pluginRef.path) {
      pluginRef.path = resolveMaybe(pluginRef.path)!;
    }
  }

  for (const profile of Object.values(config.profiles ?? {})) {
    if (profile.persistence?.adapter !== 'memory' && profile.persistence && 'directory' in profile.persistence && profile.persistence.directory) {
      profile.persistence.directory = resolveMaybe(profile.persistence.directory)!;
    }

    if (profile.rest?.auth?.publicKeyFile) {
      profile.rest.auth.publicKeyFile = resolveMaybe(profile.rest.auth.publicKeyFile)!;
    }
    if (profile.rest?.auth?.publicKeyFiles) {
      profile.rest.auth.publicKeyFiles = profile.rest.auth.publicKeyFiles.map((file) => resolveMaybe(file)!);
    }

    for (const pluginRef of profile.plugins ?? []) {
      if (pluginRef.path) {
        pluginRef.path = resolveMaybe(pluginRef.path)!;
      }
    }
  }

  return config;
}

function resolveSecretValue(value?: string, envName?: string): string | undefined {
  if (value) {
    return value;
  }

  if (envName) {
    return process.env[envName];
  }

  return undefined;
}

function resolveRuntimeSecrets(config: IoTAppConfig): IoTAppConfig {
  const auth = config.rest?.auth;
  if (auth) {
    auth.token = resolveSecretValue(auth.token, auth.tokenEnv);
    auth.publicKey = resolveSecretValue(auth.publicKey, auth.publicKeyEnv);
    auth.publicKeyFile = resolveSecretValue(auth.publicKeyFile, auth.publicKeyFileEnv);
  }

  const cluster = config.runtime?.cluster;
  if (cluster) {
    cluster.sharedToken = resolveSecretValue(cluster.sharedToken, cluster.sharedTokenEnv);
  }

  for (const adapter of config.runtime?.events?.adapters ?? []) {
    adapter.token = resolveSecretValue(adapter.token, adapter.tokenEnv);
  }

  return config;
}

async function loadPluginFromReference(pluginRef: { name: string; path?: string }): Promise<GortPlugin | undefined> {
  if (!pluginRef.path) {
    return undefined;
  }

  const module = await import(pathToFileURL(pluginRef.path).href);
  const plugin = (module.default ?? module.plugin ?? module) as GortPlugin;
  if (!plugin?.manifest || typeof plugin.register !== 'function') {
    throw new Error(`Plugin module '${pluginRef.path}' must export a GortPlugin`);
  }

  return plugin;
}

export type AppRuntimeOptions = {
  plugins?: GortPlugin[];
  deviceTypes?: Record<string, DeviceConstructor>;
};

export class AppRuntime {
  constructor(
    private readonly params: {
      app: IoTApp;
      config: IoTAppConfig;
      restServer?: RestServer;
      admin: RuntimeAdminProvider;
      clusterManager?: ClusterManager;
      eventBridge?: RuntimeEventBridge;
    },
  ) {}

  static async fromConfig(config: IoTAppConfig, options: AppRuntimeOptions = {}): Promise<AppRuntime> {
    const effectiveConfig = resolveRuntimeSecrets(this.resolveConfig(config));
    const plugins = new PluginRegistry({
      plugins: options.plugins,
      deviceTypes: options.deviceTypes,
      driverFactories: {
        mock: () => new MockDriver(),
        'johnny-five': () => new JohnnyFiveDriver({
          board: effectiveConfig.runtime?.board,
        }),
      },
    });

    for (const pluginRef of effectiveConfig.plugins ?? []) {
      const dynamicPlugin = await loadPluginFromReference(pluginRef);
      if (dynamicPlugin) {
        plugins.loadPlugin(dynamicPlugin, 'module', pluginRef.path);
      }
      await plugins.applyPlugin(pluginRef.name, pluginRef.options, pluginRef.path);
    }

    const app = new IoTApp({
      driverInstance: plugins.createDriver(effectiveConfig.runtime?.driver ?? 'johnny-five'),
      deviceTypes: plugins.getDeviceTypes(),
      persistence: effectiveConfig.persistence,
      timeZone: effectiveConfig.runtime?.timezone,
      nodeId: effectiveConfig.runtime?.cluster?.nodeId,
    });
    await app.configure(effectiveConfig);

    let restServer: RestServer | undefined;
    const clusterManager = new ClusterManager({
      app,
      config: effectiveConfig,
      getLocalUrl: () => restServer?.getUrl(),
    });
    const eventBridge = new RuntimeEventBridge({
      app,
      config: effectiveConfig,
      nodeId: clusterManager.getNodeId(),
      ingestEvent: (eventName, payload) => app.ingestEvent(eventName, payload),
    });

    restServer = effectiveConfig.rest?.enabled === false
      ? undefined
      : new RestServer({
          app,
          admin: {
            getPluginCatalog: () => plugins.listPlugins(),
            getJobs: () => app.getWorkflowJobs(),
            getRuntimeSummary: () => ({
              config: effectiveConfig,
              plugins: plugins.listPlugins(),
              availableDrivers: plugins.listDrivers(),
              availableDeviceTypes: plugins.listDeviceTypes(),
              jobs: app.getWorkflowJobs(),
              versions: {
                framework: FRAMEWORK_VERSION,
                pluginApiVersion: PLUGIN_API_VERSION,
                supportedPluginApiVersions: [...SUPPORTED_PLUGIN_API_VERSIONS],
                packages: { ...PACKAGE_VERSIONS },
              },
              cluster: clusterManager.getClusterState(),
              eventAdapters: eventBridge.getStatuses(),
              storage: {
                adapter: effectiveConfig.persistence?.adapter ?? 'file',
              },
            }),
            getClusterState: () => clusterManager.getClusterState(),
            listClusterNodes: () => clusterManager.listNodes(),
            registerClusterNode: (node) => {
              clusterManager.registerNode(node as RuntimeNodeSummary & { devices?: never[] });
            },
            recordClusterEvent: ({ nodeId, eventName, timestamp }) => {
              clusterManager.recordRemoteEvent({ nodeId, eventName, timestamp });
            },
            routeCommand: (deviceId, command, payload) => clusterManager.routeCommand(deviceId, command, payload),
            ingestEvent: (eventName, payload) => {
              app.ingestEvent(eventName, payload);
            },
          },
          host: effectiveConfig.rest?.host,
          port: effectiveConfig.rest?.port,
          websocketPath: effectiveConfig.rest?.websocket?.path ?? effectiveConfig.rest?.websocketPath,
          websocket: effectiveConfig.rest?.websocket,
          auth: effectiveConfig.rest?.auth,
          cluster: effectiveConfig.runtime?.cluster,
        });

    return new AppRuntime({
      app,
      config: effectiveConfig,
      restServer,
      admin: {
        getPluginCatalog: () => plugins.listPlugins(),
        getJobs: () => app.getWorkflowJobs(),
        getRuntimeSummary: () => ({
          config: effectiveConfig,
          plugins: plugins.listPlugins(),
          availableDrivers: plugins.listDrivers(),
          availableDeviceTypes: plugins.listDeviceTypes(),
          jobs: app.getWorkflowJobs(),
          versions: {
            framework: FRAMEWORK_VERSION,
            pluginApiVersion: PLUGIN_API_VERSION,
            supportedPluginApiVersions: [...SUPPORTED_PLUGIN_API_VERSIONS],
            packages: { ...PACKAGE_VERSIONS },
          },
          cluster: clusterManager.getClusterState(),
          eventAdapters: eventBridge.getStatuses(),
          storage: {
            adapter: effectiveConfig.persistence?.adapter ?? 'file',
          },
        }),
        getClusterState: () => clusterManager.getClusterState(),
        listClusterNodes: () => clusterManager.listNodes(),
        registerClusterNode: (node) => {
          clusterManager.registerNode(node as RuntimeNodeSummary & { devices?: never[] });
        },
        recordClusterEvent: ({ nodeId, eventName, timestamp }) => {
          clusterManager.recordRemoteEvent({ nodeId, eventName, timestamp });
        },
        routeCommand: (deviceId, command, payload) => clusterManager.routeCommand(deviceId, command, payload),
        ingestEvent: (eventName, payload) => {
          app.ingestEvent(eventName, payload);
        },
      },
      clusterManager,
      eventBridge,
    });
  }

  static async fromFile(filePath: string): Promise<AppRuntime> {
    const raw = await readFile(filePath, 'utf8');
    const config = resolveRuntimePaths(JSON.parse(raw) as IoTAppConfig, filePath);
    return this.fromConfig(config);
  }

  getApp(): IoTApp {
    return this.params.app;
  }

  getConfig(): IoTAppConfig {
    return this.params.config;
  }

  getRestServer(): RestServer | undefined {
    return this.params.restServer;
  }

  getAdmin(): RuntimeAdminProvider {
    return this.params.admin;
  }

  async start(): Promise<void> {
    await this.params.app.start();
    await this.params.eventBridge?.start();
    await this.params.restServer?.start();
    await this.params.clusterManager?.start();
  }

  async stop(): Promise<void> {
    await this.params.clusterManager?.stop();
    await this.params.restServer?.stop();
    await this.params.eventBridge?.stop();
    await this.params.app.stop();
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.params.app.dispose();
  }

  private static resolveConfig(config: IoTAppConfig): IoTAppConfig {
    const profileName = config.runtime?.profile;
    if (!profileName) {
      return config;
    }

    const profile = config.profiles?.[profileName];
    if (!profile) {
      throw new Error(`Unknown runtime profile '${profileName}'`);
    }

    return mergeProfile(config, profile);
  }
}
