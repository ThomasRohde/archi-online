import type { RelationshipType } from './metamodel';

/** Desktop Archi's stable ARM bit assignments and presentation order. */
export const ARM_RELATIONSHIP_BITS: Readonly<Record<RelationshipType, number>> = {
  CompositionRelationship: 1 << 9,
  AggregationRelationship: 1 << 8,
  AccessRelationship: 1 << 1,
  AssignmentRelationship: 1 << 7,
  RealizationRelationship: 1 << 5,
  ServingRelationship: 1 << 2,
  InfluenceRelationship: 1 << 10,
  SpecializationRelationship: 1 << 6,
  AssociationRelationship: 1 << 0,
  TriggeringRelationship: 1 << 4,
  FlowRelationship: 1 << 3,
};

export const ARM_RELATIONSHIP_ORDER = Object.keys(
  ARM_RELATIONSHIP_BITS,
) as RelationshipType[];

export const ARM_ALL_RELATIONSHIPS_MASK = ARM_RELATIONSHIP_ORDER.reduce(
  (mask, type) => mask | ARM_RELATIONSHIP_BITS[type],
  0,
);

export const ARM_DEFAULT_NEW_RELATIONSHIPS_MASK = [
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'SpecializationRelationship',
  'RealizationRelationship',
  'AccessRelationship',
].reduce((mask, type) => mask | ARM_RELATIONSHIP_BITS[type as RelationshipType], 0);

export interface AutomaticRelationshipSettings {
  useNestedConnections: boolean;
  createRelationWhenAddingNewElementToContainer: boolean;
  createRelationWhenAddingModelTreeElementToContainer: boolean;
  createRelationWhenMovingElementToContainer: boolean;
  newRelationsTypes: number;
  newReverseRelationsTypes: number;
  hiddenRelationsTypes: number;
}

export const DEFAULT_AUTOMATIC_RELATIONSHIP_SETTINGS: AutomaticRelationshipSettings = {
  useNestedConnections: true,
  createRelationWhenAddingNewElementToContainer: true,
  createRelationWhenAddingModelTreeElementToContainer: true,
  createRelationWhenMovingElementToContainer: true,
  newRelationsTypes: ARM_DEFAULT_NEW_RELATIONSHIPS_MASK,
  newReverseRelationsTypes: 0,
  hiddenRelationsTypes: ARM_ALL_RELATIONSHIPS_MASK,
};

export function relationshipTypesInMask(mask: number): RelationshipType[] {
  return ARM_RELATIONSHIP_ORDER.filter((type) => (mask & ARM_RELATIONSHIP_BITS[type]) !== 0);
}

export function isRelationshipTypeInMask(type: RelationshipType, mask: number): boolean {
  return (mask & ARM_RELATIONSHIP_BITS[type]) !== 0;
}
