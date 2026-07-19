import type { ModelState } from './types';
import type { ElementType, RelationshipType } from './metamodel';
import { compareStableText } from './stable-order';

export interface CompositionTreeOptions {
  rootIds: readonly string[];
  /** Child element filter; defaults to the union of the roots' own types. */
  elementTypes?: readonly ElementType[];
  /** Order doubles as priority when a child has multiple parents. */
  relationshipTypes?: readonly RelationshipType[];
  /** Levels below the roots; unlimited when omitted. */
  depth?: number;
  /** Which relationship end is the whole. Composition/Aggregation model whole -> part. */
  direction?: 'source-is-parent' | 'target-is-parent';
}

export interface CompositionTreeNode {
  elementId: string;
  depth: number;
  children: CompositionTreeNode[];
}

export interface CompositionTreeResult {
  roots: CompositionTreeNode[];
  /** Chosen parent per child element. */
  parentOf: Record<string, string>;
  /** Rejected additional parents per child (multi-parent report). */
  duplicates: Record<string, string[]>;
  /** Relationships ignored because they would nest an element under its own descendant. */
  cyclesBroken: Array<{ relationshipId: string; sourceId: string; targetId: string }>;
  /** Stable pre-order traversal of the tree. */
  elementIds: string[];
}

const DEFAULT_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'CompositionRelationship',
  'AggregationRelationship',
];

interface Claim {
  relationshipId: string;
  parentId: string;
  childId: string;
  priority: number;
}

/** Derive a parent/child hierarchy from whole -> part relationships. */
export function deriveCompositionTree(
  model: ModelState,
  options: CompositionTreeOptions,
): CompositionTreeResult {
  const relationshipTypes = options.relationshipTypes?.length
    ? options.relationshipTypes
    : DEFAULT_RELATIONSHIP_TYPES;
  const priority = new Map(relationshipTypes.map((type, index) => [type, index]));
  const sourceIsParent = options.direction !== 'target-is-parent';
  const maxDepth = Number.isFinite(options.depth) && options.depth! >= 0
    ? options.depth!
    : Number.POSITIVE_INFINITY;

  const rootIds = [...new Set(options.rootIds)].filter((id) => model.elements[id]);
  const allowedTypes = new Set<ElementType>(
    options.elementTypes?.length
      ? options.elementTypes
      : rootIds.map((id) => model.elements[id].type),
  );

  const compareElements = (a: string, b: string) =>
    compareStableText(model.elements[a]?.name ?? '', model.elements[b]?.name ?? '') ||
    compareStableText(a, b);

  const claimsByParent = new Map<string, Claim[]>();
  for (const rel of Object.values(model.relationships)) {
    const relPriority = priority.get(rel.type);
    if (relPriority === undefined) continue;
    const parentId = sourceIsParent ? rel.sourceId : rel.targetId;
    const childId = sourceIsParent ? rel.targetId : rel.sourceId;
    const child = model.elements[childId];
    if (!model.elements[parentId] || !child || !allowedTypes.has(child.type)) continue;
    const list = claimsByParent.get(parentId) ?? [];
    list.push({ relationshipId: rel.id, parentId, childId, priority: relPriority });
    claimsByParent.set(parentId, list);
  }

  const parentOf: Record<string, string> = {};
  const duplicates: Record<string, string[]> = {};
  const cyclesBroken: CompositionTreeResult['cyclesBroken'] = [];
  const childrenOf = new Map<string, string[]>();
  const placedDepth = new Map<string, number>(rootIds.map((id) => [id, 0]));

  const isAncestorOrSelf = (candidate: string, node: string): boolean => {
    for (let current: string | undefined = node; current; current = parentOf[current]) {
      if (current === candidate) return true;
    }
    return false;
  };
  const rejectCycle = (claim: Claim) => {
    const rel = model.relationships[claim.relationshipId];
    cyclesBroken.push({
      relationshipId: claim.relationshipId,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
    });
  };
  const rejectDuplicate = (claim: Claim) => {
    (duplicates[claim.childId] ??= []).push(claim.parentId);
  };

  let frontier = rootIds;
  for (let level = 0; frontier.length > 0 && level < maxDepth; level++) {
    const claimsByChild = new Map<string, Claim[]>();
    for (const parentId of frontier) {
      for (const claim of claimsByParent.get(parentId) ?? []) {
        const list = claimsByChild.get(claim.childId) ?? [];
        list.push(claim);
        claimsByChild.set(claim.childId, list);
      }
    }
    const nextFrontier: string[] = [];
    const childIds = [...claimsByChild.keys()].sort(compareElements);
    for (const childId of childIds) {
      const claims = claimsByChild.get(childId)!.sort((a, b) =>
        a.priority - b.priority ||
        compareElements(a.parentId, b.parentId) ||
        compareStableText(a.relationshipId, b.relationshipId));
      if (placedDepth.has(childId)) {
        for (const claim of claims) {
          if (isAncestorOrSelf(childId, claim.parentId)) rejectCycle(claim);
          else rejectDuplicate(claim);
        }
        continue;
      }
      let placed = false;
      for (const claim of claims) {
        if (isAncestorOrSelf(childId, claim.parentId)) {
          rejectCycle(claim);
        } else if (placed) {
          rejectDuplicate(claim);
        } else {
          parentOf[childId] = claim.parentId;
          const siblings = childrenOf.get(claim.parentId) ?? [];
          siblings.push(childId);
          childrenOf.set(claim.parentId, siblings);
          placedDepth.set(childId, level + 1);
          nextFrontier.push(childId);
          placed = true;
        }
      }
    }
    frontier = nextFrontier;
  }

  const elementIds: string[] = [];
  const buildNode = (elementId: string, depth: number): CompositionTreeNode => {
    elementIds.push(elementId);
    const childIds = [...(childrenOf.get(elementId) ?? [])].sort(compareElements);
    return {
      elementId,
      depth,
      children: childIds.map((childId) => buildNode(childId, depth + 1)),
    };
  };
  const roots = rootIds.map((id) => buildNode(id, 0));

  return { roots, parentOf, duplicates, cyclesBroken, elementIds };
}
