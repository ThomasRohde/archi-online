// Duplicate model-tree items. Port of Archi's DuplicateCommandHandler
// (com.archimatetool.editor/.../views/tree/commands/DuplicateCommandHandler.java):
// only elements and views (IArchimateElement / IDiagramModel) are duplicable —
// not relationships, not folders. The copy's name gets a " (copy)" suffix and
// lands in the same folder. Elements copy name/documentation/properties but not
// their relationships. Views are deep-copied: diagram objects get fresh ids
// while element nodes keep referencing the same concepts and connections reuse
// the same relationships.
import { newId } from '../id';
import { transact, useStore } from '../store';
import type { DiagramConnection, DiagramNode, ModelState } from '../types';
import { alignableNodeIds } from './alignment';
import { attachConnection, attachNode } from './draft';

const COPY_SUFFIX = ' (copy)';

// JSON clone (not structuredClone): inside a transact() recipe the source
// objects are Immer draft proxies, which structuredClone rejects. Node and
// connection fields are all JSON-safe. Matches src/canvas/clipboard.ts.
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Duplicate tree items (elements and views only; other ids ignored).
 * Returns the new ids in the same order as the duplicable inputs.
 * One undo step for the whole call.
 */
export function duplicateItems(ids: string[]): string[] {
  const model = useStore.getState().model;
  if (!model) return [];

  // Filter to elements and views, preserving input order.
  const targets = ids.filter((id) => model.elements[id] || model.views[id]);
  if (targets.length === 0) return [];

  // Pre-generate the top-level new ids so we can return them.
  const newIds = targets.map(() => newId());

  transact('Duplicate', (draft) => {
    targets.forEach((id, i) => {
      const copyId = newIds[i];
      if (draft.elements[id]) duplicateElement(draft, id, copyId);
      else if (draft.views[id]) duplicateView(draft, id, copyId);
    });
  });

  return newIds;
}

function duplicateElement(draft: ModelState, id: string, copyId: string): void {
  const el = draft.elements[id];
  draft.elements[copyId] = {
    ...el,
    id: copyId,
    name: el.name + COPY_SUFFIX,
    properties: el.properties.map((p) => ({ ...p })),
  };
  draft.folders[el.folderId]?.itemIds.push(copyId);
}

function duplicateView(draft: ModelState, id: string, copyId: string): void {
  const view = draft.views[id];
  draft.views[copyId] = {
    ...view,
    id: copyId,
    name: view.name + COPY_SUFFIX,
    properties: view.properties.map((p) => ({ ...p })),
    childIds: [],
  };
  draft.folders[view.folderId]?.itemIds.push(copyId);

  // Clone every diagram node, walking childIds in z-order so parents attach
  // before their children. Element nodes keep their elementId; ref nodes keep
  // refViewId (both preserved by the deep clone).
  const idMap = new Map<string, string>();
  const cloneNode = (oldNodeId: string, newParentId: string): void => {
    const orig = draft.nodes[oldNodeId];
    if (!orig) return;
    const newNodeId = newId();
    idMap.set(oldNodeId, newNodeId);
    const node: DiagramNode = {
      ...deepClone(orig),
      id: newNodeId,
      viewId: copyId,
      parentId: newParentId,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
    };
    attachNode(draft, node);
    for (const childId of orig.childIds) cloneNode(childId, newNodeId);
  };
  for (const topId of view.childIds) cloneNode(topId, copyId);

  copyInternalConnections(draft, id, copyId, idMap);
}

/** Clone connections of `sourceViewId` whose endpoints were both cloned, into
 *  `targetViewId`, remapping ids via `idMap`. Same relationship + bendpoints. */
function copyInternalConnections(
  draft: ModelState,
  sourceViewId: string,
  targetViewId: string,
  idMap: Map<string, string>,
): void {
  for (const conn of Object.values(draft.connections)) {
    if (conn.viewId !== sourceViewId) continue;
    const sourceId = idMap.get(conn.sourceId);
    const targetId = idMap.get(conn.targetId);
    if (!sourceId || !targetId) continue;
    const copy: DiagramConnection = {
      ...deepClone(conn),
      id: newId(),
      viewId: targetViewId,
      sourceId,
      targetId,
    };
    attachConnection(draft, copy);
  }
}

/**
 * Duplicate diagram objects within a view: clone the selected node subtrees in
 * place (offset by `offset`), keeping each root in its original container and
 * copying connections that run between duplicated nodes. Like paste, the copies
 * reference the same concepts/relationships — it duplicates the picture, not the
 * model. Returns the new root node ids (selection order). One undo step.
 */
export function duplicateViewObjects(viewId: string, ids: string[], offset = 0): string[] {
  const state = useStore.getState().model;
  if (!state || !state.views[viewId]) return [];

  // Roots = selected nodes with no selected ancestor (a selected container
  // already brings its children); drops connection ids and cross-view stragglers.
  const roots = alignableNodeIds(state, ids).filter((id) => state.nodes[id].viewId === viewId);
  if (roots.length === 0) return [];

  const rootNewIds = roots.map(() => newId());
  const idMap = new Map<string, string>();

  transact('Duplicate', (draft) => {
    roots.forEach((rootId, i) => {
      cloneSubtree(draft, rootId, draft.nodes[rootId].parentId, rootNewIds[i], offset, offset, idMap);
    });
    copyInternalConnections(draft, viewId, viewId, idMap);
  });

  const after = useStore.getState().model;
  return rootNewIds.filter((id) => after?.nodes[id]);
}

/** Deep-clone one node and its descendants into the draft. Only the top call
 *  applies (dx, dy); children keep their parent-relative bounds. */
function cloneSubtree(
  draft: ModelState,
  oldId: string,
  newParentId: string,
  newNodeId: string,
  dx: number,
  dy: number,
  idMap: Map<string, string>,
): void {
  const orig = draft.nodes[oldId];
  idMap.set(oldId, newNodeId);
  const node: DiagramNode = {
    ...deepClone(orig),
    id: newNodeId,
    parentId: newParentId,
    bounds: { ...orig.bounds, x: orig.bounds.x + dx, y: orig.bounds.y + dy },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
  };
  attachNode(draft, node);
  for (const childId of orig.childIds) {
    cloneSubtree(draft, childId, newNodeId, newId(), 0, 0, idMap);
  }
}
