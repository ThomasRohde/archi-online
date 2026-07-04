import { useState } from 'react';
import { createPortal } from 'react-dom';
import { serializeCsv, type CsvDelimiter } from '../model/io/csv';
import { useStore } from '../model/store';
import { saveFilesToDisk } from '../persistence/files';
import { showAlertDialog } from './AppDialog';

const DELIMITERS: { value: CsvDelimiter; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
];

export function ExportCsvDialog({ onClose }: { onClose: () => void }) {
  const model = useStore((s) => s.model);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',');
  const [prefix, setPrefix] = useState('');
  const [bom, setBom] = useState(false);
  const [stripNewLines, setStripNewLines] = useState(false);
  const [excelCompatible, setExcelCompatible] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!model) return null;

  const doExport = async () => {
    setBusy(true);
    try {
      const files = serializeCsv(model, {
        delimiter,
        filePrefix: prefix,
        bom,
        stripNewLines,
        excelCompatible,
      });
      await saveFilesToDisk(files);
      onClose();
    } catch (error) {
      await showAlertDialog({
        title: 'Could not export CSV',
        message: error instanceof Error ? error.message : String(error),
        intent: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Export model to CSV</div>
        <div className="export-row">
          <span className="export-label">Delimiter</span>
          {DELIMITERS.map((d) => (
            <label key={d.label}>
              <input
                type="radio"
                name="csv-delimiter"
                checked={delimiter === d.value}
                onChange={() => setDelimiter(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <div className="export-row">
          <span className="export-label">File prefix</span>
          <input
            className="export-prefix-input"
            value={prefix}
            placeholder="e.g. mymodel-"
            onChange={(e) => setPrefix(e.target.value)}
          />
        </div>
        <div className="export-row">
          <span className="export-label">Options</span>
          <label>
            <input type="checkbox" checked={bom} onChange={(e) => setBom(e.target.checked)} />
            UTF-8 BOM
          </label>
          <label>
            <input
              type="checkbox"
              checked={stripNewLines}
              onChange={(e) => setStripNewLines(e.target.checked)}
            />
            Strip newlines
          </label>
          <label>
            <input
              type="checkbox"
              checked={excelCompatible}
              onChange={(e) => setExcelCompatible(e.target.checked)}
            />
            Excel-safe
          </label>
        </div>
        <p className="export-hint">
          Writes {prefix}elements.csv, {prefix}relations.csv, and {prefix}properties.csv —
          Archi's CSV import reads them directly.
        </p>
        <div className="export-actions">
          <span className="export-actions-spacer" />
          <button className="tb-btn small" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="tb-btn small primary" disabled={busy} onClick={() => void doExport()}>
            Export…
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
