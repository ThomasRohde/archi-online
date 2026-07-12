// Relationship validity rules, backed by Archi's ArchiMate 3.2 matrix.
import { relationsMatrix } from './data/relations-matrix';
import { isAllowedRelationshipInViewpoint } from './data/viewpoints';
import {
  RELATIONSHIP_LETTER,
  RELATIONSHIP_TYPE_NAMES,
  isRelationshipType,
  type RelationshipType,
} from './metamodel';
import type { ModelState } from './types';

/** Concepts that are themselves relationships map to the pseudo-concept "Relationship" in the matrix. */
function matrixKey(conceptType: string): string {
  return isRelationshipType(conceptType) ? 'Relationship' : conceptType;
}

export function isAllowedRelationship(
  relType: RelationshipType,
  sourceType: string,
  targetType: string,
): boolean {
  const allowed = relationsMatrix[matrixKey(sourceType)]?.[matrixKey(targetType)];
  return allowed !== undefined && allowed.includes(RELATIONSHIP_LETTER[relType]);
}

/** All relationship types valid between two concept types (for the magic connector). */
export function validRelationshipTypes(sourceType: string, targetType: string): RelationshipType[] {
  const allowed = relationsMatrix[matrixKey(sourceType)]?.[matrixKey(targetType)];
  if (!allowed) return [];
  return RELATIONSHIP_TYPE_NAMES.filter((t) => allowed.includes(RELATIONSHIP_LETTER[t]));
}

export interface RelationshipCandidateEndpoint {
  conceptId: string;
  conceptType: string;
  nodeId?: string;
  /** False for a not-yet-created endpoint whose placeholder ID must not resolve in the model. */
  resolveInstance?: boolean;
}

export interface RelationshipCandidate {
  relationshipType: RelationshipType;
  sourceConceptId: string;
  targetConceptId: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}

function incidentRelationships(model: ModelState, conceptId: string) {
  return Object.values(model.relationships).filter(
    (relationship) =>
      relationship.sourceId === conceptId || relationship.targetId === conceptId,
  );
}

/**
 * Archi's concept-instance validity adds two Junction constraints to the type
 * matrix: every incident relationship must share the proposed type, and the
 * relationship must also be valid between the concepts on the far sides of
 * the Junction. New/future endpoint IDs intentionally have no incident state.
 */
function isAllowedForEndpointInstances(
  model: ModelState | undefined,
  relationshipType: RelationshipType,
  source: RelationshipCandidateEndpoint,
  target: RelationshipCandidateEndpoint,
): boolean {
  if (!model) return true;
  const sourceElement = source.resolveInstance === false
    ? undefined
    : model.elements[source.conceptId];
  const targetElement = target.resolveInstance === false
    ? undefined
    : model.elements[target.conceptId];
  const sourceType = sourceElement?.type ?? source.conceptType;
  const targetType = targetElement?.type ?? target.conceptType;

  if (sourceElement?.type === 'Junction') {
    for (const relationship of Object.values(model.relationships)) {
      if (relationship.targetId !== sourceElement.id) continue;
      const indirectSource = model.elements[relationship.sourceId];
      if (
        !indirectSource ||
        !isAllowedRelationship(relationshipType, indirectSource.type, targetType)
      ) {
        return false;
      }
    }
    if (
      incidentRelationships(model, sourceElement.id).some(
        (relationship) => relationship.type !== relationshipType,
      )
    ) {
      return false;
    }
  }

  if (targetElement?.type === 'Junction') {
    for (const relationship of Object.values(model.relationships)) {
      if (relationship.sourceId !== targetElement.id) continue;
      const indirectTarget = model.elements[relationship.targetId];
      if (
        !indirectTarget ||
        !isAllowedRelationship(relationshipType, sourceType, indirectTarget.type)
      ) {
        return false;
      }
    }
    if (
      incidentRelationships(model, targetElement.id).some(
        (relationship) => relationship.type !== relationshipType,
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Shared relationship candidate enumeration for canvas tools and ARM. The
 * caller owns direction and any feature-specific masks; this function owns the
 * ArchiMate matrix, relationship ordering, and active-viewpoint filtering.
 */
export function enumerateRelationshipCandidates(
  source: RelationshipCandidateEndpoint,
  target: RelationshipCandidateEndpoint,
  viewpointId?: string,
  relationshipTypes: readonly RelationshipType[] = RELATIONSHIP_TYPE_NAMES,
  model?: ModelState,
): RelationshipCandidate[] {
  return relationshipTypes
    .filter(
      (relationshipType) =>
        isAllowedRelationshipInViewpoint(viewpointId, relationshipType) &&
        isAllowedRelationship(relationshipType, source.conceptType, target.conceptType) &&
        isAllowedForEndpointInstances(model, relationshipType, source, target),
    )
    .map((relationshipType) => ({
      relationshipType,
      sourceConceptId: source.conceptId,
      targetConceptId: target.conceptId,
      ...(source.nodeId ? { sourceNodeId: source.nodeId } : {}),
      ...(target.nodeId ? { targetNodeId: target.nodeId } : {}),
    }));
}
