import type { ArchimateRelationship, DiagramView, ModelState } from './types';

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
