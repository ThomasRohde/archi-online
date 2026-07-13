import {
  prepareFindReplaceNavigation,
  type FindReplacePreview,
} from '../model/find-replace';
import { openView, setSelection } from '../model/store';
import { activateModelSession } from '../model/workspace';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

/** Navigate a preview row without mutating persistent model content. */
export function navigateToFindReplaceRow(
  preview: FindReplacePreview,
  rowId: string,
): boolean {
  const target = prepareFindReplaceNavigation(preview, rowId);
  if (!target) return false;
  const { store, sessionId, row } = target;
  const state = store.getState();
  const model = state.model;
  if (!model) return false;
  if (sessionId !== null) activateModelSession(sessionId);

  if (row.navigation.kind === 'view') {
    const { viewId, objectId } = row.navigation;
    if (!model.views[viewId]
      || (!model.nodes[objectId] && !model.connections[objectId])) return false;
    openView(viewId, store);
    setSelection('view', [objectId], store);
    return true;
  }

  const objectId = row.navigation.objectId;
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
