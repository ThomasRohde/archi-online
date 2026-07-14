import type { ElementType, RelationshipType } from './metamodel';
import { isAllowedElementInViewpoint } from './data/viewpoints';
import type { ArchimateRelationship, Concept, ModelState } from './types';
import { compareStableText } from './stable-order';

export type AnalysisDirection = 'incoming' | 'outgoing' | 'both';

export interface AnalysisGraphOptions {
  focusIds: readonly string[];
  depth: number;
  direction: AnalysisDirection;
  viewpointId?: string;
  elementTypes?: readonly ElementType[];
  relationshipTypes?: readonly RelationshipType[];
  maxConcepts?: number;
}

interface AnalysisGraphNodeBase {
  id: string;
  name: string;
  focus: boolean;
  compact: boolean;
}

export type AnalysisGraphNode = AnalysisGraphNodeBase & (
  | { kind: 'element'; type: ElementType }
  | { kind: 'relationship'; type: RelationshipType }
);

export interface AnalysisGraphEdge {
  id: string;
  relationshipId: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  name: string;
  segment?: 'source' | 'target';
}

export interface AnalysisGraphResult {
  focusIds: string[];
  conceptIds: string[];
  elementIds: string[];
  relationshipIds: string[];
  nodes: AnalysisGraphNode[];
  edges: AnalysisGraphEdge[];
  truncated: boolean;
  maxConcepts: number;
}

interface AdjacencyIndex {
  incoming: Map<string, ArchimateRelationship[]>;
  outgoing: Map<string, ArchimateRelationship[]>;
}

const adjacencyCache = new WeakMap<ModelState, AdjacencyIndex>();

function relationshipOrder(a: ArchimateRelationship, b: ArchimateRelationship): number {
  return compareStableText(a.name, b.name)
    || compareStableText(a.type, b.type)
    || compareStableText(a.id, b.id);
}

function adjacencyIndex(model: ModelState): AdjacencyIndex {
  const cached = adjacencyCache.get(model);
  if (cached) return cached;
  const incoming = new Map<string, ArchimateRelationship[]>();
  const outgoing = new Map<string, ArchimateRelationship[]>();
  for (const relationship of Object.values(model.relationships)) {
    const from = outgoing.get(relationship.sourceId) ?? [];
    from.push(relationship);
    outgoing.set(relationship.sourceId, from);
    const to = incoming.get(relationship.targetId) ?? [];
    to.push(relationship);
    incoming.set(relationship.targetId, to);
  }
  for (const relationships of [...incoming.values(), ...outgoing.values()]) {
    relationships.sort(relationshipOrder);
  }
  const index = { incoming, outgoing };
  adjacencyCache.set(model, index);
  return index;
}

function normalizedDepth(depth: number): number {
  return Math.max(1, Math.min(6, Math.floor(Number.isFinite(depth) ? depth : 1)));
}

function normalizedLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(1_000, Math.floor(limit ?? 1_000)));
}

function concept(model: ModelState, id: string): Concept | undefined {
  return model.elements[id] ?? model.relationships[id];
}

/**
 * Build the deterministic semantic graph used by Visualiser and Generate View For.
 * The cache is safe because ModelState snapshots are immutable outside transactions.
 */
export function buildAnalysisGraph(
  model: ModelState,
  options: AnalysisGraphOptions,
): AnalysisGraphResult {
  const depth = normalizedDepth(options.depth);
  const maxConcepts = normalizedLimit(options.maxConcepts);
  const allowedElements = options.elementTypes?.length
    ? new Set<ElementType>(options.elementTypes)
    : undefined;
  const allowedRelationships = options.relationshipTypes?.length
    ? new Set<RelationshipType>(options.relationshipTypes)
    : undefined;
  const focusIds = [...new Set(options.focusIds)].filter((id) => Boolean(concept(model, id)));
  const focusSet = new Set(focusIds);
  const ids: string[] = [];
  const included = new Set<string>();
  const queuedDepth = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [];
  let truncated = false;

  const allowed = (candidate: Concept, isFocus = false): boolean => {
    if (isFocus) return true;
    if (candidate.kind === 'element') {
      return (
        (!allowedElements || allowedElements.has(candidate.type))
        && isAllowedElementInViewpoint(options.viewpointId, candidate.type)
      );
    }
    return !allowedRelationships || allowedRelationships.has(candidate.type);
  };
  const add = (id: string, distance: number, isFocus = false): boolean => {
    const candidate = concept(model, id);
    if (!candidate || !allowed(candidate, isFocus)) return false;
    if (!included.has(id)) {
      if (included.size >= maxConcepts) {
        truncated = true;
        return false;
      }
      included.add(id);
      ids.push(id);
    }
    const previousDepth = queuedDepth.get(id);
    if (previousDepth === undefined || distance < previousDepth) {
      queuedDepth.set(id, distance);
      queue.push({ id, depth: distance });
    }
    return true;
  };

  for (const id of focusIds) add(id, 0, true);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const currentConcept = concept(model, current.id);
    if (!currentConcept) continue;

    // A relationship selected as the focus still needs its own semantic endpoints.
    if (currentConcept.kind === 'relationship' && focusSet.has(current.id)) {
      for (const endpointId of [currentConcept.sourceId, currentConcept.targetId]) {
        add(endpointId, current.depth, false);
      }
    }
    if (current.depth >= depth) continue;

    const index = adjacencyIndex(model);
    const candidates = new Map<string, ArchimateRelationship>();
    if (options.direction !== 'incoming') {
      for (const relationship of index.outgoing.get(current.id) ?? []) {
        candidates.set(relationship.id, relationship);
      }
    }
    if (options.direction !== 'outgoing') {
      for (const relationship of index.incoming.get(current.id) ?? []) {
        candidates.set(relationship.id, relationship);
      }
    }
    const ordered = [...candidates.values()].sort(relationshipOrder);
    for (const relationship of ordered) {
      if (!allowed(relationship)) continue;
      const endpointId = relationship.sourceId === current.id
        ? relationship.targetId
        : relationship.sourceId;
      const endpoint = concept(model, endpointId);
      if (!endpoint || !allowed(endpoint)) continue;
      const nextDepth = current.depth + 1;
      if (!add(relationship.id, nextDepth)) continue;
      add(endpointId, nextDepth);
    }
  }

  const relationshipIds = ids.filter((id) => Boolean(model.relationships[id]));
  const elementIds = ids.filter((id) => Boolean(model.elements[id]));
  const promoted = new Set<string>(focusIds.filter((id) => Boolean(model.relationships[id])));
  for (const relationshipId of relationshipIds) {
    const relationship = model.relationships[relationshipId];
    if (model.relationships[relationship.sourceId]) promoted.add(relationship.sourceId);
    if (model.relationships[relationship.targetId]) promoted.add(relationship.targetId);
  }
  const nodes = ids
    .filter((id) => Boolean(model.elements[id]) || promoted.has(id))
    .map((id): AnalysisGraphNode => {
      const item = concept(model, id)!;
      const base: AnalysisGraphNodeBase = {
        id,
        name: item.name,
        focus: focusSet.has(id),
        compact: item.kind === 'relationship',
      };
      return item.kind === 'element'
        ? { ...base, kind: 'element', type: item.type }
        : { ...base, kind: 'relationship', type: item.type };
    });
  const edges: AnalysisGraphEdge[] = [];
  for (const relationshipId of relationshipIds) {
    const relationship = model.relationships[relationshipId];
    if (!included.has(relationship.sourceId) || !included.has(relationship.targetId)) continue;
    if (promoted.has(relationshipId)) {
      edges.push({
        id: `${relationship.id}:source`,
        relationshipId: relationship.id,
        sourceId: relationship.sourceId,
        targetId: relationship.id,
        type: relationship.type,
        name: relationship.name,
        segment: 'source',
      });
      edges.push({
        id: `${relationship.id}:target`,
        relationshipId: relationship.id,
        sourceId: relationship.id,
        targetId: relationship.targetId,
        type: relationship.type,
        name: relationship.name,
        segment: 'target',
      });
    } else {
      edges.push({
        id: relationship.id,
        relationshipId: relationship.id,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        type: relationship.type,
        name: relationship.name,
      });
    }
  }

  return {
    focusIds,
    conceptIds: ids,
    elementIds,
    relationshipIds,
    nodes,
    edges,
    truncated,
    maxConcepts,
  };
}
