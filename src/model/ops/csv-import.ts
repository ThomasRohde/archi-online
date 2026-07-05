import { applyCsvImport, type CsvImportFiles } from '../io/csv';
import { transact } from '../store';

/**
 * Import Archi-format CSV files into the current model as one undo step.
 * Any parse or validation error aborts the whole import (nothing applied).
 */
export function importCsv(files: CsvImportFiles): void {
  transact('Import CSV', (draft) => applyCsvImport(draft, files));
}
