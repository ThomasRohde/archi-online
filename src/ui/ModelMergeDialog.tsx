import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseArchimateDocument } from '../model/io/archimate-xml';
import {
  applyModelMergePlan,
  createModelMergePlan,
  type ModelMergeOptions,
  type ModelMergePlan,
  type ModelMergeReport,
} from '../model/model-merge';
import { openView, setSelection } from '../model/store';
import type { ModelState } from '../model/types';
import { useModelStoreApi, useStore } from './store-hooks';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

const DEFAULT_OPTIONS: ModelMergeOptions = {
  updateExisting: false,
  updateModelInfo: false,
  updateFolderStructure: false,
};

export function ModelMergeDialog({ onClose }: { onClose(): void }) {
  const modelStore = useModelStoreApi();
  const target = useStore((state) => state.model);
  const readOnly = useStore((state) => state.readOnly);
  const [source, setSource] = useState<ModelState | null>(null);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [plan, setPlan] = useState<ModelMergePlan | null>(null);
  const [report, setReport] = useState<ModelMergeReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target || !source || report) {
      setPlan(null);
      return;
    }
    try {
      setPlan(createModelMergePlan(target, source, options));
      setError('');
    } catch (reason) {
      setPlan(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [options, report, source, target]);

  const load = async (file: File) => {
    setBusy(true);
    setReport(null);
    setError('');
    try {
      setSource(await parseArchimateDocument(new Uint8Array(await file.arrayBuffer())));
      setFileName(file.name);
    } catch (reason) {
      setSource(null);
      setFileName('');
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!plan) return;
    try {
      setReport(applyModelMergePlan(modelStore, plan));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const navigate = (targetId: string | undefined) => {
    const model = modelStore.getState().model;
    if (!model || !targetId) return;
    if (model.views[targetId]) {
      openView(targetId, modelStore);
      setSelection('tree', [targetId], modelStore);
      return;
    }
    if (model.elements[targetId] || model.relationships[targetId] || model.folders[targetId]) {
      layoutBus()?.showPanel('models');
      setSelection('tree', [targetId], modelStore);
      requestReveal(targetId);
    }
  };
  const shownReport = report ?? plan?.report;
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="modal model-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="model-merge-title">
        <header><div><span className="dialog-kicker">Phase 3 reuse</span><h2 id="model-merge-title">Import and Merge Model</h2></div><button className="tb-btn" disabled={busy} onClick={onClose}>Close</button></header>
        <p className="model-merge-lead">Preview another <code>.archimate</code> model without opening a workspace session. Target-only content is never deleted.</p>
        <label className="model-merge-file"><span>{fileName || 'Choose an ArchiMate model'}</span><input type="file" accept=".archimate" disabled={busy || readOnly} onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); }} /></label>
        <div className="model-merge-options">
          <label><input type="checkbox" checked={options.updateExisting || options.updateModelInfo} disabled={options.updateModelInfo || !source} onChange={(event) => setOptions((current) => ({ ...current, updateExisting: event.target.checked }))} />Update existing objects</label>
          <label><input type="checkbox" checked={options.updateModelInfo} disabled={!source} onChange={(event) => setOptions((current) => ({ ...current, updateModelInfo: event.target.checked, updateExisting: event.target.checked || current.updateExisting }))} />Update model information</label>
          <label><input type="checkbox" checked={options.updateFolderStructure} disabled={!source} onChange={(event) => setOptions((current) => ({ ...current, updateFolderStructure: event.target.checked }))} />Update folder structure</label>
        </div>
        {shownReport && <div className="model-merge-summary" aria-label="Merge totals"><span><strong>{shownReport.created}</strong> created</span><span><strong>{shownReport.updated}</strong> updated</span><span><strong>{shownReport.moved}</strong> moved</span><span><strong>{shownReport.unchanged}</strong> unchanged</span><span><strong>{shownReport.skipped}</strong> skipped</span><span><strong>{shownReport.warnings}</strong> warnings</span></div>}
        {error && <p className="model-merge-error" role="alert">{error}</p>}
        <div className="model-merge-details">
          {!source && !error && <div className="empty-hint">Select a file to build an immutable preview.</div>}
          {shownReport?.details.slice(0, 500).map((detail, index) => <button key={`${detail.kind}:${detail.sourceId}:${index}`} className={`model-merge-detail ${detail.status}`} onClick={() => navigate(detail.targetId)} disabled={!report || !detail.targetId}><span>{detail.status}</span><strong>{detail.label || detail.sourceId}</strong><small>{detail.kind}{detail.message ? ` · ${detail.message}` : ''}</small></button>)}
        </div>
        <footer><span>{report ? 'Import applied as one undoable change.' : plan ? 'Preview is current.' : ''}</span><button className="tb-btn primary" disabled={!plan || busy || readOnly || Boolean(report)} onClick={apply}>Apply Import</button></footer>
      </section>
    </div>,
    document.body,
  );
}
