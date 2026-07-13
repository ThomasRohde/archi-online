import {
  findReplacePreviewSource,
  type FindReplacePreview,
} from '../model/find-replace';
import { openView, setSelection } from '../model/store';
import { activateModelSession, getModelSession } from '../model/workspace';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

/** Navigate a preview row without mutating persistent model content. */
export function navigateToFindReplaceRow(
  preview: FindReplacePreview,
  rowId: string,
): boolean {
  const source = findReplacePreviewSource(preview);
  if (!preview.valid || !source?.sourceModel) return false;
  const row = preview.rows.find((candidate) => candidate.id === rowId);
  if (!row) return false;
  const { capture, sourceModel, sourceActiveViewId } = source;
  const { store, sessionId } = capture;
  if (
    sessionId !== null
    && getModelSession(sessionId)?.store !== store
  ) return false;
  const state = store.getState();
  if (state.model !== sourceModel || state.activeViewId !== sourceActiveViewId) {
    return false;
  }
  if (sessionId !== null) activateModelSession(sessionId);

  if (row.navigation.kind === 'view') {
    const { viewId, objectId } = row.navigation;
    if (!state.model.views[viewId]
      || (!state.model.nodes[objectId] && !state.model.connections[objectId])) return false;
    openView(viewId, store);
    setSelection('view', [objectId], store);
    return true;
  }

  const objectId = row.navigation.objectId;
  const model = state.model;
  if (
    model.info.id !== objectId
    && !model.folders[objectId]
    && !model.elements[objectId]
    && !model.relationships[objectId]
    && !model.views[objectId]
  ) return false;
  layoutBus()?.showPanel('models');
  setSelection('tree', [objectId], store);
  requestReveal(objectId, sessionId);
  return true;
}
