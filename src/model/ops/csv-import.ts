import { applyCsvImport, type CsvImportFiles, type CsvImportReport } from '../io/csv';
import { transact } from '../store';

/**
 * Import Archi-format CSV files into the current model as one undo step.
 * Any parse or validation error aborts the whole import (nothing applied).
 */
export function importCsv(files: CsvImportFiles): CsvImportReport {
  let report: CsvImportReport = { created: 0, updated: 0, unchanged: 0, profiles: 0, properties: 0, warnings: 0, errors: 0 };
  transact('Import CSV', (draft) => {
    report = applyCsvImport(draft, files);
  });
  return report;
}
