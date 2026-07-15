// Reader/writer for the ArchiMate Open Exchange format (.xml), ported from
// Archi's org.opengroup.archimate.xmlexchange plugin.

export { isExchangeXml } from './exchange-xml/detect';
export { ExchangeParseError, parseExchange, parseExchangeDocument } from './exchange-xml/parse';
export { serializeExchange } from './exchange-xml/serialize';
export { exportExchange } from './exchange-xml/export';
export { EXCHANGE_SCHEMAS } from './exchange-xml/schemas';
export { validateExchangeXml } from './exchange-xml/validation';
export type {
  ExchangeDiagnostic,
  ExchangeExportOptions,
  ExchangeExportResult,
  ExchangeImportCounts,
  ExchangeImportOptions,
  ExchangeImportResult,
} from './exchange-xml/contracts';
