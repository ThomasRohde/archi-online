import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DUBLIN_CORE_FIELDS, type DublinCoreEntry } from '../model/types';
import { exportExchange } from '../model/io/exchange-xml';
import { setModelExchangeInfo } from '../model/ops';
import { sanitizeFileName, saveFilesToDisk } from '../persistence/files';
import { showAlertDialog } from './AppDialog';
import { useModelStoreApi, useStore } from './store-hooks';

export function ExportExchangeDialog({ onClose }: { onClose: () => void }) {
  const model = useStore((state) => state.model);
  const modelStore = useModelStoreApi();
  const [language, setLanguage] = useState(model?.info.language ?? 'en');
  const [metadata, setMetadata] = useState<DublinCoreEntry[]>(model?.info.metadata ?? []);
  const [includeOrganization, setIncludeOrganization] = useState(true);
  const [validate, setValidate] = useState(true);
  const [copySchemas, setCopySchemas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  if (!model) return null;

  const metadataValue = (name: DublinCoreEntry['name']) => metadata.find((entry) => entry.name === name)?.value ?? '';
  const updateMetadata = (name: DublinCoreEntry['name'], value: string) => {
    setMetadata((current) => {
      const without = current.filter((entry) => entry.name !== name);
      if (!value) return without;
      return [...without, { name, value }].sort(
        (left, right) => DUBLIN_CORE_FIELDS.indexOf(left.name) - DUBLIN_CORE_FIELDS.indexOf(right.name),
      );
    });
  };

  const runExport = async () => {
    setBusy(true);
    setDiagnostics([]);
    try {
      const result = await exportExchange(model, { language, metadata, includeOrganization, validate, copySchemas });
      if (!result.valid) {
        setDiagnostics(result.diagnostics.map((diagnostic) => diagnostic.message));
        return;
      }
      const name = `${sanitizeFileName(model.info.name)}.xml`;
      const files = [{ name, content: result.xml }];
      if (result.schemas) files.push(...Object.entries(result.schemas).map(([schemaName, content]) => ({ name: schemaName, content })));
      const saved = await saveFilesToDisk(files);
      if (!saved) return;
      setModelExchangeInfo(metadata, language, modelStore);
      onClose();
    } catch (error) {
      await showAlertDialog({ title: 'Could not export model', message: error instanceof Error ? error.message : String(error), intent: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-dialog exchange-export-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">Export Open Exchange model</div>
        <div className="export-row"><span className="export-label">Language</span><input aria-label="ISO-639 language" value={language} onChange={(event) => setLanguage(event.target.value)} /></div>
        <div className="exchange-metadata-grid">
          {DUBLIN_CORE_FIELDS.map((field) => (
            <label key={field}><span>{field}</span><input value={metadataValue(field)} onChange={(event) => updateMetadata(field, event.target.value)} /></label>
          ))}
        </div>
        <div className="export-row"><span className="export-label">Options</span>
          <label><input type="checkbox" checked={includeOrganization} onChange={(event) => setIncludeOrganization(event.target.checked)} /> Include folder organization</label>
          <label><input type="checkbox" checked={validate} onChange={(event) => setValidate(event.target.checked)} /> Validate before writing</label>
          <label><input type="checkbox" checked={copySchemas} onChange={(event) => setCopySchemas(event.target.checked)} /> Copy official schemas</label>
        </div>
        {diagnostics.length > 0 && <div className="exchange-diagnostics" role="alert">{diagnostics.map((message, index) => <div key={index}>{message}</div>)}</div>}
        <div className="export-actions"><span className="export-actions-spacer" /><button className="tb-btn small" disabled={busy} onClick={onClose}>Cancel</button><button className="tb-btn small primary" disabled={busy} onClick={() => void runExport()}>Export…</button></div>
      </div>
    </div>,
    document.body,
  );
}
