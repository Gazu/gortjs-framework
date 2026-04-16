import type { IoTAppMetrics } from '@gortjs/contracts';

export class AppMetricsService {
  private metrics: IoTAppMetrics = {
    appStarts: 0,
    appStops: 0,
    commandsDispatched: 0,
    eventsObserved: 0,
    rulesExecuted: 0,
    workflowsExecuted: 0,
    scheduledExecutions: 0,
  };

  increment(metric: keyof IoTAppMetrics, amount = 1): void {
    this.metrics[metric] += amount;
  }

  snapshot(): IoTAppMetrics {
    return { ...this.metrics };
  }
}
