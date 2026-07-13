import { newId } from '../id';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import { getConnectable, type ModelState } from '../types';
import { attachConnection } from './draft';

/** The Task 7 note-connection contract: one endpoint is a Note, both are same-view connectables. */
export function canCreatePlainConnection(
  model: ModelState,
  viewId: string,
  sourceId: string,
  targetId: string,
): boolean {
  if (!model.views[viewId]) return false;
  const source = getConnectable(model, sourceId);
  const target = getConnectable(model, targetId);
  if (!source || !target || source.viewId !== viewId || target.viewId !== viewId) return false;
  return (
    ('nodeType' in source && source.nodeType === 'note') ||
    ('nodeType' in target && target.nodeType === 'note')
  );
}

export function createPlainConnectionOnView(
  viewId: string,
  sourceId: string,
  targetId: string,
  store: ModelStore = getActiveModelStore(),
  connectionType = 0,
): string | null {
  const state = store.getState();
  if (
    state.readOnly ||
    !state.model ||
    !canCreatePlainConnection(state.model, viewId, sourceId, targetId)
  ) {
    return null;
  }
  const id = newId();
  transact('Create Connection', (draft) => {
    if (!canCreatePlainConnection(draft, viewId, sourceId, targetId)) return;
    const circularNode = sourceId === targetId ? draft.nodes[sourceId] : undefined;
    const circularBendpoints = circularNode
      ? (() => {
          const width = Math.trunc(Math.max(100, circularNode.bounds.width * 0.6));
          const height = Math.trunc(Math.max(60, circularNode.bounds.height * 0.6));
          return [
            { startX: width, startY: 0, endX: width, endY: 0 },
            { startX: width, startY: height, endX: width, endY: height },
            { startX: 0, startY: height, endX: 0, endY: height },
          ];
        })()
      : [];
    attachConnection(draft, {
      id,
      viewId,
      connType: 'plain',
      name: '',
      documentation: '',
      properties: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      sourceId,
      targetId,
      connectionType: normalizeConnectionType(connectionType),
      nameVisible: true,
      bendpoints: circularBendpoints,
    });
  }, store);
  return store.getState().model?.connections[id] ? id : null;
}

export interface PlainConnectionAttributes {
  connectionType?: number;
  nameVisible?: boolean;
}

export function setPlainConnectionAttributes(
  id: string,
  attributes: PlainConnectionAttributes,
  store?: ModelStore,
): void {
  transact('Change Connection', (draft) => {
    const connection = draft.connections[id];
    if (!connection || connection.connType !== 'plain') return;
    if ('connectionType' in attributes) {
      connection.connectionType = normalizeConnectionType(attributes.connectionType ?? 0);
    }
    if ('nameVisible' in attributes) {
      connection.nameVisible = attributes.nameVisible !== false;
    }
  }, store);
}

function normalizeConnectionType(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) & 0xff;
}
