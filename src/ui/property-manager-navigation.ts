import {
  preparePropertyNavigation,
  type PropertyManagerSessionCapture,
} from '../model/property-manager';
import { openView, setSelection } from '../model/store';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

/** Navigate an occurrence without panning unrelated canvases or changing model content. */
export function navigateToPropertyOccurrence(
  capture: PropertyManagerSessionCapture,
  occurrenceId: string,
): boolean {
  const target = preparePropertyNavigation(capture, occurrenceId);
  if (!target) return false;
  const { store, sessionId, occurrence } = target;
  const model = store.getState().model;
  if (!model) return false;

  if (occurrence.navigation.kind === 'view') {
    const { viewId, objectId } = occurrence.navigation;
    if (!model.views[viewId]
      || (!model.nodes[objectId] && !model.connections[objectId])) return false;
    openView(viewId, store);
    setSelection('view', [objectId], store);
    return true;
  }

  const objectId = occurrence.navigation.objectId;
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
