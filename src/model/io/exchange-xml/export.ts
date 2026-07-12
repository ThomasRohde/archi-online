import type { ModelState } from '../../types';
import type { ExchangeExportOptions, ExchangeExportResult } from './contracts';
import { EXCHANGE_SCHEMAS } from './schemas';
import { serializeExchange } from './serialize';
import { validateExchangeXml } from './validation';

export async function exportExchange(
  model: ModelState,
  options: ExchangeExportOptions = {},
): Promise<ExchangeExportResult> {
  const xml = serializeExchange(model, options);
  const diagnostics = (options.validate ?? true) ? await validateExchangeXml(xml) : [];
  return {
    xml,
    diagnostics,
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    schemas: options.copySchemas ? { ...EXCHANGE_SCHEMAS } : undefined,
  };
}
