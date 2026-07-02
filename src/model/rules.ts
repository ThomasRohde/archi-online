// Relationship validity rules, backed by Archi's ArchiMate 3.2 matrix.
import { relationsMatrix } from './data/relations-matrix';
import {
  RELATIONSHIP_LETTER,
  RELATIONSHIP_TYPE_NAMES,
  isRelationshipType,
  type RelationshipType,
} from './metamodel';

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
