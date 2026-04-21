import type { ConfigValidationIssue } from '@gortjs/contracts';

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ConfigValidationIssue[]) {
    const groupedBySection = new Map<string, ConfigValidationIssue[]>();
    for (const issue of issues) {
      const section = issue.section ?? issue.path.split(/[.[\]]/, 1)[0] ?? 'config';
      const entries = groupedBySection.get(section) ?? [];
      entries.push(issue);
      groupedBySection.set(section, entries);
    }

    super(
      [
        'Invalid IoT app configuration:',
        ...Array.from(groupedBySection.entries()).flatMap(([section, sectionIssues]) => [
          `- ${section}:`,
          ...sectionIssues.map((issue) => `  - ${issue.path}: ${issue.message}`),
        ]),
      ].join('\n'),
    );
    this.name = 'ConfigValidationError';
  }
}
