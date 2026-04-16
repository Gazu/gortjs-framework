import express, { type Request, type Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AutomationRule, DeviceConfig, IoTAppStatus } from '@gortjs/contracts';
import { EventSerializer } from '@gortjs/contracts';
import { IoTApp } from '@gortjs/core';
import { WebSocketServer } from 'ws';

export class RestServer {
  private readonly expressApp = express();
  private server?: HttpServer;
  private websocketServer?: WebSocketServer;
  private eventBusCleanup?: () => void;

  constructor(
    private readonly params: {
      app: IoTApp;
      host?: string;
      port?: number;
      websocketPath?: string;
    }
  ) {
    this.expressApp.use(express.json());
    this.configureRoutes();
  }

  private configureRoutes(): void {
    this.expressApp.get('/status', (_req: Request, res: Response) => {
      res.json({
        status: this.params.app.getStatus(),
        rest: {
          running: this.isRunning(),
          port: this.getPort(),
          url: this.getUrl(),
          websocketUrl: this.getWebSocketUrl(),
        },
      });
    });

    this.expressApp.get('/snapshot', (_req: Request, res: Response) => {
      res.json(this.params.app.getSnapshot());
    });

    this.expressApp.get('/health', async (_req: Request, res: Response) => {
      const health = await this.params.app.getHealth();
      res.json({
        ok: health.ok,
        service: 'rest',
        boardReady: health.board.ready,
        eventBus: health.eventBus.implementation,
        persistenceEnabled: health.persistence.enabled,
      });
    });

    this.expressApp.get('/health/deep', async (_req: Request, res: Response) => {
      const health = await this.params.app.getHealth();
      res.status(health.ok ? 200 : 503).json(health);
    });

    this.expressApp.get('/devices', (_req: Request, res: Response) => {
      res.json({ devices: this.params.app.getDevices() });
    });

    this.expressApp.get('/device-types', (_req: Request, res: Response) => {
      res.json({ deviceTypes: this.params.app.getDeviceTypes() });
    });

    this.expressApp.get('/rules', (_req: Request, res: Response) => {
      res.json({ rules: this.params.app.getRules() });
    });

    this.expressApp.get('/events', (req: Request<unknown, unknown, unknown, { limit?: string }>, res: Response) => {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json({ events: this.params.app.getEventHistory(limit) });
    });

    this.expressApp.get('/persisted-state', (_req: Request, res: Response) => {
      res.json({ devices: this.params.app.getPersistedDeviceStates() });
    });

    this.expressApp.get('/devices/:id', (req: Request<{ id: string }>, res: Response) => {
      try {
        const device = this.params.app.getDevice(req.params.id);
        res.json(device.getState());
      } catch (error) {
        res.status(404).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.get('/devices/:id/state', (req: Request<{ id: string }>, res: Response) => {
      try {
        const device = this.params.app.getDevice(req.params.id);
        res.json({ state: device.getState() });
      } catch (error) {
        res.status(404).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.expressApp.post(
      '/devices',
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

    this.expressApp.delete('/rules/:id', (req: Request<{ id: string }>, res: Response) => {
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

    this.expressApp.post('/lifecycle/:action', async (req: Request<{ action: string }>, res: Response) => {
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

    this.websocketServer.on('connection', (socket) => {
      void this.params.app.getHealth().then((health) => {
        socket.send(JSON.stringify({
          eventName: 'ws:connected',
          payload: {
            devices: this.params.app.getDevices(),
            rules: this.params.app.getRules(),
            health,
          },
          timestamp: new Date().toISOString(),
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
    this.websocketServer?.close();
    this.websocketServer = undefined;

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
