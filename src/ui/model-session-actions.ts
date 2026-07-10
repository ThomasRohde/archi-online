import { createEmptyModel } from '../model/ops';
import {
  addModelSession,
  getModelSession,
  removeModelSession,
  type ModelSession,
  type ModelSessionId,
} from '../model/workspace';
import { flushAutosaveNow } from '../persistence/autosave';
import { saveModelToDisk } from '../persistence/files';
import { showAlertDialog, showChoiceDialog } from './AppDialog';

export type DirtyCloseAction = 'save' | 'discard' | 'cancel';

export interface CloseModelDependencies {
  chooseDirtyAction(session: ModelSession): Promise<DirtyCloseAction>;
  save(sessionId: ModelSessionId): Promise<boolean>;
  flush(): Promise<void>;
}

const defaultDependencies: CloseModelDependencies = {
  async chooseDirtyAction(session) {
    const state = session.store.getState();
    return (
      (await showChoiceDialog({
        title: 'Save changes?',
        message: `“${state.model?.info.name ?? state.fileName ?? 'Untitled model'}” has unsaved changes.`,
        choices: [
          { label: 'Save', value: 'save', primary: true },
          { label: "Don't Save", value: 'discard', danger: true },
        ],
        cancelLabel: 'Cancel',
      })) ?? 'cancel'
    );
  },
  save: (sessionId) => saveModelSession(sessionId),
  flush: flushAutosaveNow,
};

export async function saveModelSession(
  sessionId: ModelSessionId,
  saveAs = false,
): Promise<boolean> {
  try {
    await saveModelToDisk(sessionId, saveAs);
    return getModelSession(sessionId)?.store.getState().dirty === false;
  } catch (error) {
    await showAlertDialog({
      title: 'Could not save model',
      message: error instanceof Error ? error.message : String(error),
      intent: 'error',
    });
    return false;
  }
}

export function createNewModelSession(): ModelSessionId {
  return addModelSession({
    model: createEmptyModel('New ArchiMate Model'),
    fileName: null,
    dirty: false,
  });
}

export async function closeModelSession(
  sessionId: ModelSessionId,
  dependencies: CloseModelDependencies = defaultDependencies,
): Promise<boolean> {
  const session = getModelSession(sessionId);
  if (!session) return true;
  if (session.store.getState().dirty) {
    const action = await dependencies.chooseDirtyAction(session);
    if (action === 'cancel') return false;
    if (action === 'save') {
      try {
        if (!(await dependencies.save(sessionId))) return false;
      } catch {
        return false;
      }
    }
  }
  removeModelSession(sessionId);
  await dependencies.flush();
  return true;
}

export async function closeModelSessions(
  sessionIds: ModelSessionId[],
  dependencies: CloseModelDependencies = defaultDependencies,
): Promise<boolean> {
  for (const sessionId of sessionIds) {
    if (!(await closeModelSession(sessionId, dependencies))) return false;
  }
  return true;
}
