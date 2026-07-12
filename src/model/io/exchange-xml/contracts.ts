import type { ModelState } from '../../types';

export interface ExchangeDiagnostic {
  severity: 'warning' | 'error';
  message: string;
  line?: number;
  column?: number;
}

export interface ExchangeExportOptions {
  includeOrganization?: boolean;
  validate?: boolean;
  copySchemas?: boolean;
  language?: string;
  metadata?: ModelState['info']['metadata'];
}

export interface ExchangeExportResult {
  xml: string;
  valid: boolean;
  diagnostics: ExchangeDiagnostic[];
  schemas?: Record<string, string>;
}

export interface ExchangeImportOptions {
  language?: string;
}

export interface ExchangeImportCounts {
  elements: number;
  relationships: number;
  views: number;
  profiles: number;
  properties: number;
  warnings: number;
  errors: number;
}

export interface ExchangeImportResult {
  model?: ModelState;
  language: string;
  diagnostics: ExchangeDiagnostic[];
  warnings: ExchangeDiagnostic[];
  errors: ExchangeDiagnostic[];
  counts: ExchangeImportCounts;
}
