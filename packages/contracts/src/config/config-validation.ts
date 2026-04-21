export interface ConfigValidationIssue {
  path: string;
  message: string;
  section?: string;
  receivedType?: string;
}
