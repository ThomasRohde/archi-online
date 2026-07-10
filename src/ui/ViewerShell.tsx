import { useEffect, useMemo } from 'react';
import { ViewEditor } from '../canvas/ViewEditor';
import { openView, setSelection, useModelStoreApi, useStore } from '../model/store';
import { PropertiesPanel } from './PropertiesPanel';

type ViewerShellProps =
  | {
      status: 'loading';
      sourceLabel: string;
      onOpenEditor: () => void;
    }
  | {
      status: 'error';
      message: string;
      onOpenEditor: () => void;
    }
  | {
      status: 'loaded';
      sourceLabel: string;
      onOpenCopy: () => void;
    };

export function ViewerShell(props: ViewerShellProps) {
  if (props.status === 'loading') {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>Opening shared model</h1>
          <p>{props.sourceLabel}</p>
          <button className="welcome-btn" onClick={props.onOpenEditor}>
            Open Archi Online
          </button>
        </div>
      </div>
    );
  }

  if (props.status === 'error') {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>Could not open shared model</h1>
          <p>{props.message}</p>
          <button className="welcome-btn" onClick={props.onOpenEditor}>
            Open Archi Online
          </button>
        </div>
      </div>
    );
  }

  return <LoadedViewerShell sourceLabel={props.sourceLabel} onOpenCopy={props.onOpenCopy} />;
}

function LoadedViewerShell({
  sourceLabel,
  onOpenCopy,
}: {
  sourceLabel: string;
  onOpenCopy: () => void;
}) {
  const model = useStore((s) => s.model);
  const store = useModelStoreApi();
  const activeViewId = useStore((s) => s.activeViewId);
  const views = useMemo(() => (model ? Object.values(model.views) : []), [model]);

  useEffect(() => {
    if (!model || activeViewId || views.length === 0) return;
    openView(views[0].id, store);
  }, [activeViewId, model, store, views]);

  if (!model) {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>No model loaded</h1>
        </div>
      </div>
    );
  }

  const selectedViewId = activeViewId ?? views[0]?.id ?? '';

  return (
    <div className="viewer-shell">
      <header className="viewer-toolbar">
        <div className="viewer-title">
          <strong>{model.info.name}</strong>
          <span>{sourceLabel}</span>
        </div>
        <label className="viewer-view-picker">
          <span>View</span>
          <select
            value={selectedViewId}
            onChange={(event) => {
              openView(event.target.value, store);
              setSelection('tree', [event.target.value], store);
            }}
          >
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button className="tb-btn" onClick={onOpenCopy}>
          Open a copy in the editor
        </button>
      </header>
      <main className="viewer-main">
        <section className="viewer-canvas">
          {selectedViewId ? (
            <ViewEditor viewId={selectedViewId} readOnly />
          ) : (
            <div className="viewer-empty">
              <h1>No views in this model</h1>
            </div>
          )}
        </section>
        <aside className="viewer-properties">
          <PropertiesPanel />
        </aside>
      </main>
    </div>
  );
}
