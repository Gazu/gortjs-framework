import type { DriverContract, EventBusContract } from '@gortjs/contracts';
import { appEventNames, boardEventNames } from '@gortjs/contracts';

export class BoardManager {
  private ready = false;

  constructor(
    private readonly params: {
      driver: DriverContract;
      eventBus: EventBusContract;
    }
  ) {}

  async start(): Promise<void> {
    this.params.eventBus.emit(appEventNames.starting, {});
    await this.params.driver.connect();
    this.ready = true;
    this.params.eventBus.emit(boardEventNames.ready, {});
  }

  async stop(): Promise<void> {
    if (!this.ready) {
      return;
    }

    await this.params.driver.disconnect?.();
    this.ready = false;
    this.params.eventBus.emit(boardEventNames.stopped, {});
  }

  isReady(): boolean {
    return this.ready;
  }

  getHealth() {
    return {
      ready: this.ready,
      driver: this.params.driver.name,
      connected: this.params.driver.isConnected?.() ?? this.ready,
    };
  }
}
