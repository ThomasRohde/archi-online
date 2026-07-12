// Duplicate model-tree items. Port of Archi's DuplicateCommandHandler
// (com.archimatetool.editor/.../views/tree/commands/DuplicateCommandHandler.java):
// only elements and views (IArchimateElement / IDiagramModel) are duplicable —
// not relationships, not folders. The copy's name gets a " (copy)" suffix and
// lands in the same folder. Elements copy name/documentation/properties but not
// their relationships. Views are deep-copied: diagram objects get fresh ids
// while element nodes keep referencing the same concepts and connections reuse
// the same relationships.
import { newId } from '../id';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import type { DiagramConnection, DiagramNode, ModelState } from '../types';
import { alignableNodeIds } from './alignment';
import { attachNode, rebuildConnectionAdjacency } from './draft';

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
export function duplicateItems(
  ids: string[],
  store: ModelStore = getActiveModelStore(),
): string[] {
  const model = store.getState().model;
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
  }, store);

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
  const connections = mappedConnectionClosure(draft, sourceViewId, idMap);
  for (const connection of connections) idMap.set(connection.id, newId());
  mapClonedNodeAdjacency(draft, idMap);
  for (const conn of connections) {
    const copy: DiagramConnection = {
      ...deepClone(conn),
      id: idMap.get(conn.id)!,
      viewId: targetViewId,
      sourceId: idMap.get(conn.sourceId)!,
      targetId: idMap.get(conn.targetId)!,
      sourceConnectionIds: mappedAdjacency(conn.sourceConnectionIds, idMap),
      targetConnectionIds: mappedAdjacency(conn.targetConnectionIds, idMap),
    };
    draft.connections[copy.id] = copy;
  }
  rebuildConnectionAdjacency(draft);
}

function mappedConnectionClosure(
  draft: ModelState,
  viewId: string,
  idMap: Map<string, string>,
): DiagramConnection[] {
  const candidates = Object.values(draft.connections).filter(
    (connection) => connection.viewId === viewId,
  );
  const included = new Set(idMap.keys());
  const selected: DiagramConnection[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const connection of candidates) {
      if (
        included.has(connection.id) ||
        !included.has(connection.sourceId) ||
        !included.has(connection.targetId)
      ) {
        continue;
      }
      selected.push(connection);
      included.add(connection.id);
      changed = true;
    }
  }
  return selected;
}

function mappedAdjacency(ids: string[], idMap: Map<string, string>): string[] {
  return ids.flatMap((id) => {
    const mapped = idMap.get(id);
    return mapped ? [mapped] : [];
  });
}

function mapClonedNodeAdjacency(
  draft: ModelState,
  idMap: Map<string, string>,
): void {
  for (const [sourceId, copyId] of idMap) {
    const source = draft.nodes[sourceId];
    const copy = draft.nodes[copyId];
    if (!source || !copy) continue;
    copy.sourceConnectionIds = mappedAdjacency(source.sourceConnectionIds, idMap);
    copy.targetConnectionIds = mappedAdjacency(source.targetConnectionIds, idMap);
  }
}

/**
 * Duplicate diagram objects within a view: clone the selected node subtrees in
 * place (offset by `offset`), keeping each root in its original container and
 * copying connections that run between duplicated nodes. Element nodes and
 * relationship connections receive fresh model concepts, matching Desktop
 * Archi's same-view copy semantics. Returns the new root node ids (selection
 * order). One undo step.
 */
export function duplicateViewObjects(
  viewId: string,
  ids: string[],
  offset = 0,
  store: ModelStore = getActiveModelStore(),
): string[] {
  const state = store.getState().model;
  if (!state || !state.views[viewId]) return [];

  // Roots = selected nodes with no selected ancestor (a selected container
  // already brings its children); drops connection ids and cross-view stragglers.
  const roots = alignableNodeIds(state, ids).filter((id) => state.nodes[id].viewId === viewId);
  if (roots.length === 0) return [];

  const rootNewIds = roots.map(() => newId());
  const idMap = new Map<string, string>();
  const elementIdMap = new Map<string, string>();
  const collectConcepts = (nodeId: string): void => {
    const node = state.nodes[nodeId];
    if (!node) return;
    if (node.nodeType === 'element' && !elementIdMap.has(node.elementId)) {
      elementIdMap.set(node.elementId, newId());
    }
    node.childIds.forEach(collectConcepts);
  };
  roots.forEach(collectConcepts);

  transact('Duplicate', (draft) => {
    for (const [sourceId, copyId] of elementIdMap) {
      const source = draft.elements[sourceId];
      if (!source) continue;
      draft.elements[copyId] = { ...deepClone(source), id: copyId };
      draft.folders[source.folderId]?.itemIds.push(copyId);
    }
    roots.forEach((rootId, i) => {
      cloneSubtree(
        draft,
        rootId,
        draft.nodes[rootId].parentId,
        rootNewIds[i],
        offset,
        offset,
        idMap,
        elementIdMap,
      );
    });
    copyInternalConnectionsWithFreshRelationships(draft, viewId, idMap, elementIdMap);
  }, store);

  const after = store.getState().model;
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
  elementIdMap: Map<string, string>,
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
    ...(orig.nodeType === 'element'
      ? { elementId: elementIdMap.get(orig.elementId) ?? orig.elementId }
      : {}),
  };
  attachNode(draft, node);
  for (const childId of orig.childIds) {
    cloneSubtree(draft, childId, newNodeId, newId(), 0, 0, idMap, elementIdMap);
  }
}

function copyInternalConnectionsWithFreshRelationships(
  draft: ModelState,
  viewId: string,
  nodeIdMap: Map<string, string>,
  elementIdMap: Map<string, string>,
): void {
  const relationshipIdMap = new Map<string, string>();
  const connections = mappedConnectionClosure(draft, viewId, nodeIdMap);
  for (const connection of connections) nodeIdMap.set(connection.id, newId());
  mapClonedNodeAdjacency(draft, nodeIdMap);
  const eligibleConnectionIds = new Set<string>();
  let addedConnection = true;
  while (addedConnection) {
    addedConnection = false;
    for (const connection of connections) {
      if (
        eligibleConnectionIds.has(connection.id) ||
        (connection.relationshipId && !draft.relationships[connection.relationshipId])
      ) {
        continue;
      }
      const endpointIsEligible = (endpointId: string): boolean => (
        Boolean(draft.nodes[endpointId] && nodeIdMap.has(endpointId)) ||
        eligibleConnectionIds.has(endpointId)
      );
      if (!endpointIsEligible(connection.sourceId) || !endpointIsEligible(connection.targetId)) {
        continue;
      }
      eligibleConnectionIds.add(connection.id);
      addedConnection = true;
    }
  }
  for (const connection of connections) {
    if (
      eligibleConnectionIds.has(connection.id) &&
      connection.relationshipId &&
      draft.relationships[connection.relationshipId] &&
      !relationshipIdMap.has(connection.relationshipId)
    ) {
      relationshipIdMap.set(connection.relationshipId, newId());
    }
  }
  let addedRelationshipDependency = true;
  while (addedRelationshipDependency) {
    addedRelationshipDependency = false;
    for (const relationshipId of [...relationshipIdMap.keys()]) {
      const relationship = draft.relationships[relationshipId];
      for (const endpointId of [relationship.sourceId, relationship.targetId]) {
        if (draft.relationships[endpointId] && !relationshipIdMap.has(endpointId)) {
          relationshipIdMap.set(endpointId, newId());
          addedRelationshipDependency = true;
        }
      }
    }
  }
  for (const [relationshipId, copyRelationshipId] of relationshipIdMap) {
    const relationship = draft.relationships[relationshipId];
    draft.relationships[copyRelationshipId] = {
      ...deepClone(relationship),
      id: copyRelationshipId,
      sourceId:
        elementIdMap.get(relationship.sourceId) ??
        relationshipIdMap.get(relationship.sourceId) ??
        relationship.sourceId,
      targetId:
        elementIdMap.get(relationship.targetId) ??
        relationshipIdMap.get(relationship.targetId) ??
        relationship.targetId,
    };
    draft.folders[relationship.folderId]?.itemIds.push(copyRelationshipId);
  }
  for (const connection of connections) {
    if (!eligibleConnectionIds.has(connection.id)) continue;
    const relationshipId = connection.relationshipId
      ? relationshipIdMap.get(connection.relationshipId)
      : undefined;

    const copy: DiagramConnection = {
      ...deepClone(connection),
      id: nodeIdMap.get(connection.id)!,
      sourceId: nodeIdMap.get(connection.sourceId)!,
      targetId: nodeIdMap.get(connection.targetId)!,
      sourceConnectionIds: mappedAdjacency(connection.sourceConnectionIds, nodeIdMap),
      targetConnectionIds: mappedAdjacency(connection.targetConnectionIds, nodeIdMap),
      ...(relationshipId ? { relationshipId } : {}),
    };
    draft.connections[copy.id] = copy;
  }
  rebuildConnectionAdjacency(draft);
}
