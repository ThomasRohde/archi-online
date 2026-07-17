import type { ArchimateRelationship, DiagramView, ModelState } from './types';
import type { SelectionState } from './store';

function byNameThenId<T extends { id: string; name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** All relationships whose source or target is conceptId, source-first then target, each sorted by name. */
export function modelRelations(state: ModelState, conceptId: string): ArchimateRelationship[] {
  const outgoing = outgoingRelationships(state, conceptId);
  const incoming = incomingRelationships(state, conceptId).filter(
    (relationship) => relationship.sourceId !== conceptId,
  );
  return [...outgoing, ...incoming];
}

/** Relationships where conceptId is the source, sorted by name. */
export function outgoingRelationships(
  state: ModelState,
  conceptId: string,
): ArchimateRelationship[] {
  return Object.values(state.relationships)
    .filter((relationship) => relationship.sourceId === conceptId)
    .sort(byNameThenId);
}

/** Relationships where conceptId is the target, sorted by name. */
export function incomingRelationships(
  state: ModelState,
  conceptId: string,
): ArchimateRelationship[] {
  return Object.values(state.relationships)
    .filter((relationship) => relationship.targetId === conceptId)
    .sort(byNameThenId);
}

/** Views containing the element or relationship, sorted by name. */
export function viewsUsing(state: ModelState, conceptId: string): DiagramView[] {
  const viewIds = new Set<string>();
  if (state.elements[conceptId]) {
    for (const node of Object.values(state.nodes)) {
      if (node.nodeType === 'element' && node.elementId === conceptId) {
        viewIds.add(node.viewId);
      }
    }
  }
  if (state.relationships[conceptId]) {
    for (const connection of Object.values(state.connections)) {
      if (connection.relationshipId === conceptId) {
        viewIds.add(connection.viewId);
      }
    }
  }
  return Array.from(viewIds)
    .map((viewId) => state.views[viewId])
    .filter((view): view is DiagramView => Boolean(view))
    .sort(byNameThenId);
}

/** First diagram node or connection representing conceptId in viewId, else undefined. */
export function findInView(
  state: ModelState,
  viewId: string,
  conceptId: string,
): string | undefined {
  if (state.elements[conceptId]) {
    return Object.values(state.nodes).find(
      (node) => node.viewId === viewId && node.nodeType === 'element' && node.elementId === conceptId,
    )?.id;
  }
  if (state.relationships[conceptId]) {
    return Object.values(state.connections).find(
      (connection) => connection.viewId === viewId && connection.relationshipId === conceptId,
    )?.id;
  }
  return undefined;
}

/** Semantic concepts represented by a tree or canvas selection, in selection order. */
export function conceptsFromSelection(
  state: ModelState | null,
  selection: SelectionState,
): string[] {
  if (!state) return [];
  const result: string[] = [];
  for (const id of selection.ids) {
    let conceptId: string | undefined;
    if (state.elements[id] || state.relationships[id]) conceptId = id;
    else if (selection.source === 'view') {
      const node = state.nodes[id];
      if (node?.nodeType === 'element' && state.elements[node.elementId]) {
        conceptId = node.elementId;
      } else {
        const relationshipId = state.connections[id]?.relationshipId;
        if (relationshipId && state.relationships[relationshipId]) conceptId = relationshipId;
      }
    }
    if (conceptId && !result.includes(conceptId)) result.push(conceptId);
  }
  return result;
}

function conceptIdForObject(state: ModelState, objectId: string): string | undefined {
  if (state.elements[objectId] || state.relationships[objectId]) return objectId;
  const node = state.nodes[objectId];
  if (node?.nodeType === 'element' && state.elements[node.elementId]) return node.elementId;
  const relationshipId = state.connections[objectId]?.relationshipId;
  return relationshipId && state.relationships[relationshipId] ? relationshipId : undefined;
}

/** Whether an object is directly selected or represents the same semantic concept. */
export function selectionMatchesObject(
  state: ModelState | null,
  selection: SelectionState,
  objectId: string,
): boolean {
  if (!state) return false;
  if (selection.ids.includes(objectId)) return true;
  const conceptId = conceptIdForObject(state, objectId);
  return conceptId !== undefined && conceptsFromSelection(state, selection).includes(conceptId);
}
