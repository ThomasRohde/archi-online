import { ViewEditor } from '../canvas/ViewEditor';
import { parseArchimate } from '../model/io/archimate-xml';
import { addView } from '../model/ops';
import { closeView, openView, replaceModel, useStore } from '../model/store';
import { newModel, openModel } from './Toolbar';
import { Palette } from './Palette';

async function loadExample(): Promise<void> {
  const res = await fetch(import.meta.env.BASE_URL + 'examples/Archisurance.archimate');
  const model = parseArchimate(await res.text());
  replaceModel(model, 'Archisurance.archimate', false);
}

export function EditorArea() {
  const model = useStore((s) => s.model);
  const openViewIds = useStore((s) => s.openViewIds);
  const activeViewId = useStore((s) => s.activeViewId);

  if (!model) {
    return (
      <div className="editor-area">
        <div className="editor-empty welcome">
          <h2>Archi Online</h2>
          <p>A web-based ArchiMate® modeler, scriptable with a jArchi-style JavaScript API.</p>
          <div className="welcome-actions">
            <button className="welcome-btn" onClick={newModel}>
              New model
            </button>
            <button className="welcome-btn" onClick={openModel}>
              Open .archimate file…
            </button>
            <button
              className="welcome-btn"
              onClick={() => void loadExample().catch((e) => alert('Could not load example: ' + e))}
            >
              Load Archisurance example
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (openViewIds.length === 0) {
    return (
      <div className="editor-area">
        <div className="editor-empty welcome">
          <p>Double-click a view in the model tree to open it, or create a new one.</p>
          <div className="welcome-actions">
            <button
              className="welcome-btn"
              onClick={() => {
                const id = addView('New View');
                openView(id);
              }}
            >
              New view
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      <div className="editor-tabs">
        {openViewIds.map((id) => {
          const view = model.views[id];
          if (!view) return null;
          return (
            <div
              key={id}
              className={'editor-tab' + (id === activeViewId ? ' active' : '')}
              onClick={() => useStore.setState({ activeViewId: id })}
              onAuxClick={(e) => {
                if (e.button === 1) closeView(id);
              }}
              title={view.name}
            >
              <span className="tab-label">{view.name}</span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeView(id);
                }}
              >
                ×
              </span>
            </div>
          );
        })}
      </div>
      <div className="editor-body">
        <Palette />
        {activeViewId && <ViewEditor key={activeViewId} viewId={activeViewId} />}
      </div>
    </div>
  );
}
