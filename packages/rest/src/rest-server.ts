import express, { type Request, type Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AutomationRule, DeviceConfig, IoTAppStatus, RestAuthConfig } from '@gortjs/contracts';
import { EventSerializer, createTimestamp } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import { WebSocketServer } from 'ws';
import { AuthService } from './auth-service';

export class RestServer {
  private readonly expressApp = express();
  private server?: HttpServer;
  private websocketServer?: WebSocketServer;
  private eventBusCleanup?: () => void;
  private readonly authService: AuthService;
  private readonly metrics = {
    requests: 0,
    authFailures: 0,
    websocketConnections: 0,
    websocketRejected: 0,
  };

  constructor(
    private readonly params: {
      app: IoTApp;
      host?: string;
      port?: number;
      websocketPath?: string;
      auth?: RestAuthConfig;
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

    this.expressApp.get('/snapshot', this.requireAuth('snapshot:read'), (_req: Request, res: Response) => {
      res.json(this.params.app.getSnapshot());
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
          res.status(400).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
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
      path: this.params.websocketPath ?? '/ws',
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
      void this.params.app.getHealth().then((health) => {
        socket.send(JSON.stringify({
          eventName: 'ws:connected',
          payload: {
            devices: this.params.app.getDevices(),
            rules: this.params.app.getRules(),
            workflows: this.params.app.getWorkflows(),
            health,
          },
          timestamp: createTimestamp(),
        }));
      });
    });

    this.eventBusCleanup = this.params.app.on('*', (entry) => {
      const message = EventSerializer.stringifyEvent(entry);
      for (const client of this.websocketServer?.clients ?? []) {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
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

    return `ws://${this.params.host ?? '127.0.0.1'}:${port}${this.params.websocketPath ?? '/ws'}`;
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
}
