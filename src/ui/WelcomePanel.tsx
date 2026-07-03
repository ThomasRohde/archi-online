import { parseArchimate } from '../model/io/archimate-xml';
import { addView } from '../model/ops';
import { openView, replaceModel, useStore } from '../model/store';
import { newModel, openModel } from './Toolbar';

async function loadExample(): Promise<void> {
  const res = await fetch(import.meta.env.BASE_URL + 'examples/Archisurance.archimate');
  const model = parseArchimate(await res.text());
  replaceModel(model, 'Archisurance.archimate', false);
}

export function WelcomePanel() {
  const hasModel = useStore((s) => s.model !== null);
  return (
    <div className="dock-panel">
      <div className="editor-empty welcome">
        <h2>Archi Online</h2>
        <p>A web-based ArchiMate® modeler, scriptable with a jArchi-style JavaScript API.</p>
        {hasModel && <p className="welcome-hint">Double-click a view in the model tree to open it.</p>}
        <div className="welcome-actions">
          {hasModel && (
            <button
              className="welcome-btn"
              onClick={() => {
                const id = addView('New View');
                openView(id);
              }}
            >
              New view
            </button>
          )}
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
