// CSV record reader matching the behavior Archi relies on from Apache
// commons-csv (CSVImporter.getRecords): quoted fields with doubled quotes,
// '#' comment lines, BOM tolerance, and comma → semicolon → tab delimiter
// auto-detection keyed on the "invalid character after quoted field" error.

import { CSV_DELIMITERS } from './constants';

export class CsvParseError extends Error {}

/** Internal: thrown when a closing quote is followed by neither the
 * delimiter nor a record end — the signal to try the next delimiter. */
class DelimiterMismatchError extends CsvParseError {}

export function parseCsvRecords(text: string): string[][] {
  let lastError: Error = new CsvParseError('Failed to parse CSV');
  let bestRecords: string[][] | null = null;
  let bestColumnCount = -1;
  for (const delimiter of CSV_DELIMITERS) {
    try {
      const records = parseWithDelimiter(text, delimiter);
      const columnCount = Math.max(0, ...records.map((record) => record.length));
      if (columnCount > bestColumnCount) {
        bestRecords = records;
        bestColumnCount = columnCount;
      }
    } catch (error) {
      if (!(error instanceof DelimiterMismatchError)) throw error;
      lastError = error;
    }
  }
  if (bestRecords) return bestRecords;
  throw lastError;
}

function parseWithDelimiter(text: string, delimiter: string): string[][] {
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM

  const records: string[][] = [];
  const n = text.length;

  while (i < n) {
    // Skip blank lines and comment lines.
    if (text[i] === '\r' || text[i] === '\n') {
      i++;
      continue;
    }
    if (text[i] === '#') {
      while (i < n && text[i] !== '\r' && text[i] !== '\n') i++;
      continue;
    }

    const record: string[] = [];
    let endOfRecord = false;
    while (!endOfRecord) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw new CsvParseError('Unterminated quoted field');
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += ch;
            i++;
          }
        }
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw new DelimiterMismatchError(
            'Invalid character between encapsulated token and delimiter',
          );
        }
      } else {
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          field += text[i];
          i++;
        }
      }
      record.push(field);

      if (i >= n) {
        endOfRecord = true;
      } else if (text[i] === delimiter) {
        i++;
      } else {
        // \r, \n, or \r\n ends the record.
        if (text[i] === '\r' && text[i + 1] === '\n') i++;
        i++;
        endOfRecord = true;
      }
    }
    records.push(record);
  }

  return records;
}
