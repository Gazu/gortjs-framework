import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createTimestamp,
  type RuntimeAuditEntry,
  type RuntimeLogEntry,
  type RuntimeLogLevel,
  type RuntimeLoggingConfig,
} from '@gortjs/contracts';

const LEVEL_ORDER: Record<RuntimeLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class RuntimeLogger {
  private readonly entries: RuntimeLogEntry[] = [];
  private readonly auditEntries: RuntimeAuditEntry[] = [];
  private readonly level: RuntimeLogLevel;
  private readonly maxEntries: number;
  private readonly enabled: boolean;

  constructor(private readonly config: RuntimeLoggingConfig = {}) {
    this.enabled = config.enabled !== false;
    this.level = config.level ?? 'info';
    this.maxEntries = config.maxEntries ?? 200;
  }

  getLogs(limit = 100): RuntimeLogEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  getAuditTrail(limit = 100): RuntimeAuditEntry[] {
    return this.auditEntries.slice(-limit).reverse();
  }

  debug(source: string, message: string, details?: Record<string, unknown>): void {
    this.log('debug', source, message, details);
  }

  info(source: string, message: string, details?: Record<string, unknown>): void {
    this.log('info', source, message, details);
  }

  warn(source: string, message: string, details?: Record<string, unknown>): void {
    this.log('warn', source, message, details);
  }

  error(source: string, message: string, details?: Record<string, unknown>): void {
    this.log('error', source, message, details);
  }

  audit(
    action: string,
    resource: string,
    outcome: 'success' | 'failure',
    details?: Record<string, unknown>,
  ): void {
    if (!this.enabled) {
      return;
    }

    const entry: RuntimeAuditEntry = {
      id: randomUUID(),
      timestamp: createTimestamp(),
      action,
      resource,
      outcome,
      actor: typeof details?.actor === 'string' ? details.actor : undefined,
      requestId: typeof details?.requestId === 'string' ? details.requestId : undefined,
      correlationId: typeof details?.correlationId === 'string' ? details.correlationId : undefined,
      details,
    };

    this.auditEntries.push(entry);
    if (this.auditEntries.length > this.maxEntries) {
      this.auditEntries.splice(0, this.auditEntries.length - this.maxEntries);
    }

    void this.writeLine(this.config.auditFile, entry);
  }

  private log(
    level: RuntimeLogLevel,
    source: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    if (!this.enabled || LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }

    const entry: RuntimeLogEntry = {
      id: randomUUID(),
      timestamp: createTimestamp(),
      level,
      source,
      message,
      requestId: typeof details?.requestId === 'string' ? details.requestId : undefined,
      correlationId: typeof details?.correlationId === 'string' ? details.correlationId : undefined,
      details,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    if (this.config.console === true) {
      const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      sink(JSON.stringify(entry));
    }

    void this.writeLine(this.config.file, entry);
  }

  private async writeLine(filePath: string | undefined, entry: unknown): Promise<void> {
    if (!filePath) {
      return;
    }

    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }
}
