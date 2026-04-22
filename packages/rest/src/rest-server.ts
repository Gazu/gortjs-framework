import express, { type Request, type Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AutomationRule, DeviceConfig, IoTAppImportSnapshot, IoTAppStatus, RestAuthConfig, RuntimeAdminProvider, RuntimeClusterConfig, WebSocketSlowClientPolicy, WorkflowDefinition } from '@gortjs/contracts';
import { EventSerializer, createTimestamp } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import WebSocket, { WebSocketServer } from 'ws';
import { AuthService } from './auth-service';
import { renderInspectorPage } from './inspector-page';

type WebSocketClientFilter = {
  eventName?: string;
  deviceId?: string;
};

export class RestServer {
  private readonly expressApp = express();
  private server?: HttpServer;
  private websocketServer?: WebSocketServer;
  private eventBusCleanup?: () => void;
  private readonly authService: AuthService;
  private readonly websocketClientFilters = new WeakMap<WebSocket, WebSocketClientFilter>();
  private readonly metrics = {
    requests: 0,
    authFailures: 0,
    websocketConnections: 0,
    websocketRejected: 0,
  };

  constructor(
    private readonly params: {
      app: IoTApp;
      admin?: RuntimeAdminProvider;
      host?: string;
      port?: number;
      websocketPath?: string;
      websocket?: {
        path?: string;
        replayLimit?: number;
        maxBufferedBytes?: number;
        slowClientPolicy?: WebSocketSlowClientPolicy;
      };
      auth?: RestAuthConfig;
      cluster?: RuntimeClusterConfig;
    }
  ) {
    this.authService = new AuthService(params.auth);
    this.expressApp.use(express.json());
    this.expressApp.use((_, __, next) => {
      this.metrics.requests += 1;
      next();
    });
    this.configureRoutes();
  }

  private requireAuth(scopeKey: string) {
    return async (req: Request, res: Response, next: () => void) => {
      const result = await this.authService.authorizeHttp(
        Array.isArray(req.headers.authorization)
          ? req.headers.authorization[0]
          : req.headers.authorization,
        scopeKey,
      );

      if (!result.ok) {
        this.metrics.authFailures += 1;
        res.status(result.statusCode ?? 401).json({
          ok: false,
          error: result.error,
        });
        return;
      }

      next();
    };
  }

  private requireClusterToken(req: Request, res: Response, next: () => void): void {
    const expectedToken = this.params.cluster?.sharedToken;
    if (!expectedToken) {
      next();
      return;
    }

    const received = Array.isArray(req.headers['x-gort-cluster-token'])
      ? req.headers['x-gort-cluster-token'][0]
      : req.headers['x-gort-cluster-token'];

    if (received !== expectedToken) {
      res.status(401).json({ ok: false, error: 'Invalid cluster token' });
      return;
    }

    next();
  }

  private configureRoutes(): void {
    this.expressApp.get('/status', this.requireAuth('status:read'), (_req: Request, res: Response) => {
      res.json({
        status: this.params.app.getStatus(),
        timeZone: this.params.app.getTimeZone(),
        rest: {
          running: this.isRunning(),
          port: this.getPort(),
          url: this.getUrl(),
          websocketUrl: this.getWebSocketUrl(),
        },
      });
    });

    this.expressApp.get('/inspector', (req: Request<unknown, unknown, unknown, { token?: string }>, res: Response) => {
      res.type('html').send(renderInspectorPage(this.getUrl() ?? 'http://127.0.0.1', req.query.token));
    });

    this.expressApp.get('/snapshot', this.requireAuth('snapshot:read'), (_req: Request, res: Response) => {
      res.json(this.params.app.getSnapshot());
    });

    this.expressApp.post('/snapshot/import', this.requireAuth('snapshot:write'), async (
      req: Request<unknown, unknown, IoTAppImportSnapshot>,
      res: Response,
    ) => {
      try {
        await this.params.app.applySnapshot(req.body ?? {});
        res.json({ ok: true, snapshot: this.params.app.getSnapshot() });
      } catch (error) {
        res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.get('/health', this.requireAuth('health:read'), async (_req: Request, res: Response) => {
      const health = await this.params.app.getHealth();
      res.json({
        ok: health.ok,
        service: 'rest',
        boardReady: health.board.ready,
        eventBus: health.eventBus.implementation,
        persistenceEnabled: health.persistence.enabled,
        auth: this.authService.getHealth(),
      });
    });

    this.expressApp.get('/health/deep', this.requireAuth('health:deep:read'), async (_req: Request, res: Response) => {
      const health = await this.params.app.getHealth();
      res.status(health.ok ? 200 : 503).json(health);
    });

    this.expressApp.get('/diagnostics', this.requireAuth('health:deep:read'), async (_req: Request, res: Response) => {
      const health = await this.params.app.getHealth();
      const auth = this.authService.getHealth();
      const warnings = [
        ...(health.persistence.corruptedEntries ? [`Persistence skipped ${health.persistence.corruptedEntries} corrupted event entries`] : []),
        ...(health.persistence.stateRecovered ? ['Persistence recovered with empty in-memory state after a load failure'] : []),
        ...(auth.lastReloadError ? [`Auth key reload warning: ${auth.lastReloadError}`] : []),
      ];

      res.status(health.ok ? 200 : 503).json({
        ok: health.ok,
        service: 'rest',
        rest: {
          running: this.isRunning(),
          port: this.getPort(),
          url: this.getUrl(),
          websocketUrl: this.getWebSocketUrl(),
          metrics: this.metrics,
        },
        auth,
        health,
        snapshot: this.params.app.getSnapshot(),
        warnings,
      });
    });

    this.expressApp.get('/metrics', this.requireAuth('metrics:read'), (_req: Request, res: Response) => {
      res.json({
        rest: this.metrics,
        app: this.params.app.getMetrics(),
      });
    });

    this.expressApp.get('/devices', this.requireAuth('devices:read'), (_req: Request, res: Response) => {
      res.json({ devices: this.params.app.getDevices() });
    });

    this.expressApp.get('/device-types', this.requireAuth('device-types:read'), (_req: Request, res: Response) => {
      res.json({ deviceTypes: this.params.app.getDeviceTypes() });
    });

    this.expressApp.get('/rules', this.requireAuth('rules:read'), (_req: Request, res: Response) => {
      res.json({
        rules: this.params.app.getRules(),
        workflows: this.params.app.getWorkflows(),
      });
    });

    this.expressApp.get(
      '/events',
      this.requireAuth('events:read'),
      (
        req: Request<unknown, unknown, unknown, {
          eventName?: string;
          deviceId?: string;
          from?: string;
          to?: string;
          page?: string;
          pageSize?: string;
        }>,
        res: Response,
      ) => {
        const page = this.params.app.queryEventHistory({
          eventName: req.query.eventName,
          deviceId: req.query.deviceId,
          from: req.query.from,
          to: req.query.to,
          page: req.query.page ? Number(req.query.page) : undefined,
          pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
        });
        res.json(page);
      },
    );

    this.expressApp.get('/workflows', this.requireAuth('workflows:read'), (_req: Request, res: Response) => {
      res.json({ workflows: this.params.app.getWorkflows() });
    });

    this.expressApp.get('/jobs', this.requireAuth('jobs:read'), (_req: Request, res: Response) => {
      res.json({ jobs: this.params.app.getWorkflowJobs() });
    });

    this.expressApp.get('/plugins', this.requireAuth('plugins:read'), (_req: Request, res: Response) => {
      res.json({
        plugins: this.params.admin?.getPluginCatalog() ?? [],
      });
    });

    this.expressApp.get('/runtime', this.requireAuth('runtime:read'), (_req: Request, res: Response) => {
      res.json(this.params.admin?.getRuntimeSummary() ?? {
        config: {},
        plugins: [],
        availableDrivers: [],
        availableDeviceTypes: [],
        jobs: this.params.app.getWorkflowJobs(),
      });
    });

    this.expressApp.get('/cluster', this.requireAuth('runtime:read'), (_req: Request, res: Response) => {
      res.json(this.params.admin?.getClusterState?.() ?? {
        enabled: false,
        nodeId: 'local-node',
        role: 'standalone',
        remoteCommandRouting: false,
        nodes: [],
        recentEvents: [],
      });
    });

    this.expressApp.get('/cluster/nodes', this.requireAuth('runtime:read'), (_req: Request, res: Response) => {
      res.json({
        nodes: this.params.admin?.listClusterNodes?.() ?? [],
      });
    });

    this.expressApp.post('/cluster/nodes/register', this.requireClusterToken.bind(this), (
      req: Request<unknown, unknown, Record<string, unknown>>,
      res: Response,
    ) => {
      this.params.admin?.registerClusterNode?.(req.body as never);
      res.json({
        ok: true,
        nodes: this.params.admin?.listClusterNodes?.() ?? [],
      });
    });

    this.expressApp.post('/cluster/events', this.requireClusterToken.bind(this), (
      req: Request<unknown, unknown, { nodeId?: string; entry?: { eventName?: string; timestamp?: string; payload?: unknown } }>,
      res: Response,
    ) => {
      const nodeId = req.body?.nodeId;
      const entry = req.body?.entry;
      if (!nodeId || !entry?.eventName || !entry.timestamp) {
        res.status(400).json({ ok: false, error: 'nodeId and entry are required' });
        return;
      }

      this.params.admin?.recordClusterEvent?.({
        nodeId,
        eventName: entry.eventName,
        timestamp: entry.timestamp,
        payload: entry.payload,
      });
      res.json({ ok: true });
    });

    this.expressApp.post('/events/ingest', this.requireAuth('events:write'), (
      req: Request<unknown, unknown, { eventName?: string; payload?: unknown; sourceNodeId?: string }>,
      res: Response,
    ) => {
      if (!req.body?.eventName) {
        res.status(400).json({ ok: false, error: 'eventName is required' });
        return;
      }

      this.params.admin?.ingestEvent?.(req.body.eventName, req.body.payload, req.body.sourceNodeId);
      res.json({ ok: true });
    });

    this.expressApp.get('/persisted-state', this.requireAuth('persisted-state:read'), (_req: Request, res: Response) => {
      res.json({ devices: this.params.app.getPersistedDeviceStates() });
    });

    this.expressApp.get('/devices/:id', this.requireAuth('devices:read'), (req: Request<{ id: string }>, res: Response) => {
      try {
        const device = this.params.app.getDevice(req.params.id);
        res.json(device.getState());
      } catch (error) {
        res.status(404).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.get('/devices/:id/state', this.requireAuth('devices:read'), (req: Request<{ id: string }>, res: Response) => {
      try {
        const device = this.params.app.getDevice(req.params.id);
        res.json({ state: device.getState() });
      } catch (error) {
        res.status(404).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.post(
      '/devices',
      this.requireAuth('devices:write'),
      (
        req: Request<unknown, unknown, DeviceConfig>,
        res: Response,
      ) => {
        try {
          const device = this.params.app.registerDevice(req.body);
          res.status(201).json({ ok: true, device: device.getState() });
        } catch (error) {
          res.status(400).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );

    this.expressApp.post(
      '/devices/:id/commands',
      this.requireAuth('commands:write'),
      async (
        req: Request<{ id: string }, unknown, { command?: string; payload?: Record<string, unknown> }>,
        res: Response
      ) => {
        const { command, payload = {} } = req.body ?? {};
        if (!command) {
          res.status(400).json({ error: 'command is required' });
          return;
        }

        try {
          const state = await this.params.app.command(req.params.id, command, payload);
          res.json({ ok: true, state });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          if ((message.includes('Unknown device') || message.includes('not found')) && this.params.admin?.routeCommand) {
            const routed = await this.params.admin.routeCommand(req.params.id, command, payload);
            if (routed.ok) {
              res.json({
                ok: true,
                state: routed.state,
                routedTo: routed.routedTo,
              });
              return;
            }
          }

          res.status(400).json({
            ok: false,
            error: message,
          });
        }
      }
    );

    this.expressApp.post(
      '/rules',
      this.requireAuth('rules:write'),
      (
        req: Request<unknown, unknown, AutomationRule>,
        res: Response,
      ) => {
        try {
          this.params.app.registerRule(req.body);
          res.status(201).json({ ok: true, rules: this.params.app.getRules() });
        } catch (error) {
          res.status(400).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );

    this.expressApp.post(
      '/workflows',
      this.requireAuth('workflows:write'),
      (
        req: Request<unknown, unknown, WorkflowDefinition>,
        res: Response,
      ) => {
        try {
          this.params.app.registerWorkflow(req.body);
          res.status(201).json({ ok: true, workflows: this.params.app.getWorkflows() });
        } catch (error) {
          res.status(400).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );

    this.expressApp.delete('/workflows/:id', this.requireAuth('workflows:write'), (req: Request<{ id: string }>, res: Response) => {
      try {
        this.params.app.unregisterWorkflow(req.params.id);
        res.json({ ok: true, workflows: this.params.app.getWorkflows() });
      } catch (error) {
        res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.post('/workflows/:id/run', this.requireAuth('workflows:execute'), async (req: Request<{ id: string }>, res: Response) => {
      try {
        await this.params.app.executeWorkflow(req.params.id, req.body as Record<string, unknown> | undefined);
        res.json({ ok: true });
      } catch (error) {
        res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.delete('/rules/:id', this.requireAuth('rules:write'), (req: Request<{ id: string }>, res: Response) => {
      try {
        this.params.app.unregisterRule(req.params.id);
        res.json({ ok: true, rules: this.params.app.getRules() });
      } catch (error) {
        res.status(400).json({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.expressApp.post('/lifecycle/:action', this.requireAuth('lifecycle:write'), async (req: Request<{ action: string }>, res: Response) => {
      try {
        const status = await this.performLifecycleAction(req.params.action);
        res.json({
          ok: true,
          status,
          snapshot: this.params.app.getSnapshot(),
        });
      } catch (error) {
        res.status(400).json({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  async start(): Promise<void> {
    await this.authService.initialize();
    await new Promise<void>((resolve) => {
      this.server = this.expressApp.listen(
        this.params.port ?? 3000,
        this.params.host ?? '127.0.0.1',
        () => resolve(),
      );
    });

    this.websocketServer = new WebSocketServer({
      server: this.server,
      path: this.params.websocket?.path ?? this.params.websocketPath ?? '/ws',
    });

    this.websocketServer.on('connection', async (socket, request) => {
      const authResult = await this.authService.authorizeWebSocket(request, 'ws:connect');
      if (!authResult.ok) {
        this.metrics.authFailures += 1;
        this.metrics.websocketRejected += 1;
        socket.close(1008, authResult.error);
        return;
      }

      this.metrics.websocketConnections += 1;
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filter = {
        eventName: url.searchParams.get('eventName') ?? undefined,
        deviceId: url.searchParams.get('deviceId') ?? undefined,
      };
      this.websocketClientFilters.set(socket, filter);

      const replayLimit = Math.min(
        Number(url.searchParams.get('replay') ?? this.params.websocket?.replayLimit ?? 0),
        this.params.websocket?.replayLimit ?? 50,
      );
      if (replayLimit > 0) {
        const replayPage = this.params.app.queryEventHistory({
          eventName: filter.eventName,
          deviceId: filter.deviceId,
          pageSize: Math.max(replayLimit, this.params.websocket?.replayLimit ?? replayLimit),
        });
        for (const entry of replayPage.events.slice(-replayLimit)) {
          this.sendToWebSocketClient(socket, EventSerializer.stringifyEvent(entry));
        }
      }

      void this.params.app.getHealth().then((health) => {
        this.sendToWebSocketClient(socket, JSON.stringify({
          eventName: 'ws:connected',
          payload: {
            devices: this.params.app.getDevices(),
            rules: this.params.app.getRules(),
            workflows: this.params.app.getWorkflows(),
            health,
            filter,
            replayed: replayLimit,
          },
          timestamp: createTimestamp(),
        }));
      });
    });

    this.eventBusCleanup = this.params.app.on('*', (entry) => {
      const message = EventSerializer.stringifyEvent(entry);
      for (const client of this.websocketServer?.clients ?? []) {
        if (client.readyState !== client.OPEN) {
          continue;
        }

        const clientFilter = this.websocketClientFilters.get(client);
        if (clientFilter && !this.matchesEventFilter(entry as Record<string, unknown>, clientFilter)) {
          continue;
        }

        this.sendToWebSocketClient(client, message);
      }
    });
  }

  async stop(): Promise<void> {
    this.eventBusCleanup?.();
    this.eventBusCleanup = undefined;

    if (this.websocketServer) {
      for (const client of this.websocketServer.clients) {
        client.terminate();
      }

      await new Promise<void>((resolve) => {
        this.websocketServer?.close(() => resolve());
      });
      this.websocketServer = undefined;
    }

    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = undefined;
  }

  isRunning(): boolean {
    return Boolean(this.server?.listening);
  }

  getPort(): number | undefined {
    const address = this.server?.address();
    if (!address || typeof address === 'string') {
      return undefined;
    }

    return (address as AddressInfo).port;
  }

  getUrl(): string | undefined {
    const port = this.getPort();
    if (!port) {
      return undefined;
    }

    return `http://${this.params.host ?? '127.0.0.1'}:${port}`;
  }

  getWebSocketUrl(): string | undefined {
    const port = this.getPort();
    if (!port) {
      return undefined;
    }

    return `ws://${this.params.host ?? '127.0.0.1'}:${port}${this.params.websocket?.path ?? this.params.websocketPath ?? '/ws'}`;
  }

  getInspectorUrl(): string | undefined {
    const url = this.getUrl();
    if (!url) {
      return undefined;
    }

    return `${url}/inspector`;
  }

  private async performLifecycleAction(action: string): Promise<IoTAppStatus> {
    switch (action) {
      case 'attach':
        await this.params.app.attach();
        break;
      case 'start':
        await this.params.app.start();
        break;
      case 'stop':
        await this.params.app.stop();
        break;
      case 'dispose':
        await this.params.app.dispose();
        break;
      default:
        throw new Error(`Unsupported lifecycle action '${action}'`);
    }

    return this.params.app.getStatus();
  }

  private matchesEventFilter(entry: Record<string, unknown>, filter: WebSocketClientFilter): boolean {
    if (filter.eventName && entry.eventName !== filter.eventName) {
      return false;
    }

    const payload = entry.payload as Record<string, unknown> | undefined;
    if (filter.deviceId && payload?.deviceId !== filter.deviceId) {
      return false;
    }

    return true;
  }

  private sendToWebSocketClient(client: WebSocket, message: string): void {
    const maxBufferedBytes = this.params.websocket?.maxBufferedBytes ?? 256 * 1024;
    const slowClientPolicy = this.params.websocket?.slowClientPolicy ?? 'terminate';
    if (client.bufferedAmount > maxBufferedBytes) {
      if (slowClientPolicy === 'terminate') {
        client.close(1013, 'Client is too slow');
      }
      return;
    }

    client.send(message);
  }
}
