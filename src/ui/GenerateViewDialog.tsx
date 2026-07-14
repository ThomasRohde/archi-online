import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { VIEWPOINTS, isAllowedElementInViewpoint } from '../model/data/viewpoints';
import { generateViewFor } from '../model/ops/generate-view';
import { useModelStoreApi, useStore } from './store-hooks';

const GENERATE_VIEW_EVENT = 'archi:generate-view-for';

export function requestGenerateViewFor(elementIds: readonly string[]): void {
  window.dispatchEvent(new CustomEvent(GENERATE_VIEW_EVENT, {
    detail: { elementIds: [...new Set(elementIds)] },
  }));
}

interface RequestDetail { elementIds: string[] }

export function GenerateViewDialogHost() {
  const modelStore = useModelStoreApi();
  const model = useStore((state) => state.model);
  const readOnly = useStore((state) => state.readOnly);
  const [elementIds, setElementIds] = useState<string[] | null>(null);
  const [name, setName] = useState('Generated View');
  const [viewpointId, setViewpointId] = useState('');
  const [depth, setDepth] = useState(1);
  const [direction, setDirection] = useState<'incoming' | 'outgoing' | 'both'>('both');
  const [allInternalRelationships, setAllInternalRelationships] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const listener = (event: Event) => {
      const requested = (event as CustomEvent<RequestDetail>).detail?.elementIds ?? [];
      const eligible = requested.filter((id) => Boolean(modelStore.getState().model?.elements[id]));
      if (eligible.length === 0 || modelStore.getState().readOnly) return;
      const currentModel = modelStore.getState().model!;
      setElementIds(eligible);
      setName(eligible.length === 1
        ? `${currentModel.elements[eligible[0]].name || 'Element'} View`
        : 'Generated View');
      setViewpointId('');
      setDepth(1);
      setDirection('both');
      setAllInternalRelationships(false);
      setError('');
    };
    window.addEventListener(GENERATE_VIEW_EVENT, listener);
    return () => window.removeEventListener(GENERATE_VIEW_EVENT, listener);
  }, [modelStore]);

  const validViewpoints = useMemo(() => {
    if (!model || !elementIds) return VIEWPOINTS;
    return VIEWPOINTS.filter((viewpoint) => elementIds.every((id) => {
      const element = model.elements[id];
      return element && isAllowedElementInViewpoint(viewpoint.id, element.type);
    }));
  }, [elementIds, model]);

  if (!elementIds) return null;
  const close = () => { if (!busy) setElementIds(null); };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await generateViewFor(modelStore, {
        focusIds: elementIds,
        name,
        viewpointId: viewpointId || undefined,
        depth,
        direction,
        allInternalRelationships,
      });
      setElementIds(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="modal generate-view-dialog" role="dialog" aria-modal="true" aria-labelledby="generate-view-title">
        <h2 id="generate-view-title">Generate View For</h2>
        <p>{elementIds.length} selected element{elementIds.length === 1 ? '' : 's'} will seed a new view.</p>
        <label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Viewpoint</span><select value={viewpointId} onChange={(event) => setViewpointId(event.target.value)}><option value="">None (unrestricted)</option>{validViewpoints.map((viewpoint) => <option key={viewpoint.id} value={viewpoint.id}>{viewpoint.name}</option>)}</select></label>
        <div className="generate-view-grid">
          <label><span>Depth</span><select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="both">Both</option><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select></label>
        </div>
        <label className="generate-view-check"><input type="checkbox" checked={allInternalRelationships} onChange={(event) => setAllInternalRelationships(event.target.checked)} />Include all internal relationships</label>
        {error && <p className="generate-view-error" role="alert">{error}</p>}
        {readOnly && <p className="generate-view-error">The model is read-only.</p>}
        <footer><button className="tb-btn" disabled={busy} onClick={close}>Cancel</button><button className="tb-btn primary" disabled={busy || readOnly || !name.trim()} onClick={() => void submit()}>{busy ? 'Generating…' : 'Generate'}</button></footer>
      </section>
    </div>,
    document.body,
  );
}
