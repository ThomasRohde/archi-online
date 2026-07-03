import { fromKebab, isElementType, isRelationshipType } from '../../model/metamodel';

export function resolveType(type: string): string | undefined {
  if (isElementType(type) || isRelationshipType(type)) return type;
  let t = fromKebab(type.toLowerCase());
  if (t) return t;
  // Allow "composition" as shorthand for "composition-relationship".
  t = fromKebab(type.toLowerCase() + '-relationship');
  return t;
}
