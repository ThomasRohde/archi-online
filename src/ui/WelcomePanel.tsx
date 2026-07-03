import { parseArchimate } from '../model/io/archimate-xml';
import { addView } from '../model/ops';
import { openView, replaceModel, useStore } from '../model/store';
import { showAlertDialog } from './AppDialog';
import { newModel, openModel } from './Toolbar';

async function loadExample(): Promise<void> {
  const res = await fetch(import.meta.env.BASE_URL + 'examples/Archisurance.archimate');
  const model = parseArchimate(await res.text());
  replaceModel(model, 'Archisurance.archimate', false);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
          <button className="welcome-btn" onClick={() => void newModel()}>
            New model
          </button>
          <button className="welcome-btn" onClick={() => void openModel()}>
            Open .archimate file…
          </button>
          <button
            className="welcome-btn"
            onClick={() =>
              void loadExample().catch((error) =>
                showAlertDialog({
                  title: 'Could not load example',
                  message: errorMessage(error),
                  intent: 'error',
                }),
              )
            }
          >
            Load Archisurance example
          </button>
        </div>
      </div>
    </div>
  );
}
