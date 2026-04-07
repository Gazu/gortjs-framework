import type { ConfigValidationIssue } from '@gortjs/contracts';

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ConfigValidationIssue[]) {
    super(
      [
        'Invalid IoT app configuration:',
        ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
      ].join('\n'),
    );
    this.name = 'ConfigValidationError';
  }
}
