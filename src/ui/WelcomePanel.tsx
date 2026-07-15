import { parseArchimateDocument } from '../model/io/archimate-xml';
import { addView } from '../model/ops';
import { openView } from '../model/store';
import { viewsInTreeOrder } from '../model/tree-order';
import { useStore } from './store-hooks';
import { addModelSession, getModelSession, type ModelSessionId } from '../model/workspace';
import { showAlertDialog } from './AppDialog';
import { newModel, openModel } from './Toolbar';

export async function loadExampleModel(
  fileName = 'Archisurance.archimate',
): Promise<ModelSessionId> {
  const res = await fetch(import.meta.env.BASE_URL + `examples/${fileName}`);
  const model = await parseArchimateDocument(new Uint8Array(await res.arrayBuffer()));
  const sessionId = addModelSession({ model, fileName, dirty: false });
  const firstViewId = viewsInTreeOrder(model)[0];
  const session = getModelSession(sessionId);
  if (firstViewId && session) openView(firstViewId, session.store);
  return sessionId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WelcomePanel() {
  const hasModel = useStore((s) => s.model !== null);
  return (
    <div className="dock-panel">
      <div className="editor-empty welcome">
        <img
          className="welcome-logo"
          src={import.meta.env.BASE_URL + 'icons/icon.svg'}
          alt="Archi Online"
          width={128}
          height={128}
        />
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
              void loadExampleModel().catch((error) =>
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
          <button
            className="welcome-btn"
            onClick={() =>
              void loadExampleModel('c4-customer-portal.archimate').catch((error) =>
                showAlertDialog({
                  title: 'Could not load example',
                  message: errorMessage(error),
                  intent: 'error',
                }),
              )
            }
          >
            Load C4 example
          </button>
        </div>
      </div>
    </div>
  );
}
