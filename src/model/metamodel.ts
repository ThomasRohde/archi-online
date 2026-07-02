// ArchiMate 3.2 metamodel: element and relationship type definitions.
// Type names match Archi's xsi:type values (without the archimate: prefix).

export type Layer =
  | 'strategy'
  | 'business'
  | 'application'
  | 'technology'
  | 'physical'
  | 'motivation'
  | 'implementation_migration'
  | 'other';

// Archi default fill colors (from Archi's UI providers)
export const LAYER_FILL: Record<Layer, string> = {
  strategy: '#f5deaa',
  business: '#ffffb5',
  application: '#b5ffff',
  technology: '#c9e7b7',
  physical: '#c9e7b7',
  motivation: '#ccccff',
  implementation_migration: '#ffe0e0',
  other: '#ffffff',
};

export interface ElementTypeDef {
  type: ElementType;
  label: string;
  layer: Layer;
  fill: string;
  /** default figure size */
  width: number;
  height: number;
}

const E = <T extends string>(arr: readonly T[]) => arr;

export const ELEMENT_TYPE_NAMES = E([
  // Strategy
  'Resource',
  'Capability',
  'CourseOfAction',
  'ValueStream',
  // Business
  'BusinessActor',
  'BusinessRole',
  'BusinessCollaboration',
  'BusinessInterface',
  'BusinessProcess',
  'BusinessFunction',
  'BusinessInteraction',
  'BusinessEvent',
  'BusinessService',
  'BusinessObject',
  'Contract',
  'Representation',
  'Product',
  // Application
  'ApplicationComponent',
  'ApplicationCollaboration',
  'ApplicationInterface',
  'ApplicationFunction',
  'ApplicationInteraction',
  'ApplicationProcess',
  'ApplicationEvent',
  'ApplicationService',
  'DataObject',
  // Technology
  'Node',
  'Device',
  'SystemSoftware',
  'TechnologyCollaboration',
  'TechnologyInterface',
  'Path',
  'CommunicationNetwork',
  'TechnologyFunction',
  'TechnologyProcess',
  'TechnologyInteraction',
  'TechnologyEvent',
  'TechnologyService',
  'Artifact',
  // Physical
  'Equipment',
  'Facility',
  'DistributionNetwork',
  'Material',
  // Motivation
  'Stakeholder',
  'Driver',
  'Assessment',
  'Goal',
  'Outcome',
  'Principle',
  'Requirement',
  'Constraint',
  'Meaning',
  'Value',
  // Implementation & Migration
  'WorkPackage',
  'Deliverable',
  'ImplementationEvent',
  'Plateau',
  'Gap',
  // Other
  'Location',
  'Grouping',
  'Junction',
] as const);

export type ElementType = (typeof ELEMENT_TYPE_NAMES)[number];

export const RELATIONSHIP_TYPE_NAMES = E([
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'RealizationRelationship',
  'ServingRelationship',
  'AccessRelationship',
  'InfluenceRelationship',
  'TriggeringRelationship',
  'FlowRelationship',
  'SpecializationRelationship',
  'AssociationRelationship',
] as const);

export type RelationshipType = (typeof RELATIONSHIP_TYPE_NAMES)[number];

export type ConceptType = ElementType | RelationshipType;

/** Letter codes used in Archi's relationships matrix (relationships-keys.xml). */
export const RELATIONSHIP_LETTER: Record<RelationshipType, string> = {
  AccessRelationship: 'a',
  CompositionRelationship: 'c',
  FlowRelationship: 'f',
  AggregationRelationship: 'g',
  AssignmentRelationship: 'i',
  InfluenceRelationship: 'n',
  AssociationRelationship: 'o',
  RealizationRelationship: 'r',
  SpecializationRelationship: 's',
  TriggeringRelationship: 't',
  ServingRelationship: 'v',
};

export interface RelationshipTypeDef {
  type: RelationshipType;
  label: string;
}

export const RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  { type: 'CompositionRelationship', label: 'Composition' },
  { type: 'AggregationRelationship', label: 'Aggregation' },
  { type: 'AssignmentRelationship', label: 'Assignment' },
  { type: 'RealizationRelationship', label: 'Realization' },
  { type: 'ServingRelationship', label: 'Serving' },
  { type: 'AccessRelationship', label: 'Access' },
  { type: 'InfluenceRelationship', label: 'Influence' },
  { type: 'TriggeringRelationship', label: 'Triggering' },
  { type: 'FlowRelationship', label: 'Flow' },
  { type: 'SpecializationRelationship', label: 'Specialization' },
  { type: 'AssociationRelationship', label: 'Association' },
];

const layerOf: Record<ElementType, Layer> = {
  Resource: 'strategy',
  Capability: 'strategy',
  CourseOfAction: 'strategy',
  ValueStream: 'strategy',
  BusinessActor: 'business',
  BusinessRole: 'business',
  BusinessCollaboration: 'business',
  BusinessInterface: 'business',
  BusinessProcess: 'business',
  BusinessFunction: 'business',
  BusinessInteraction: 'business',
  BusinessEvent: 'business',
  BusinessService: 'business',
  BusinessObject: 'business',
  Contract: 'business',
  Representation: 'business',
  Product: 'business',
  ApplicationComponent: 'application',
  ApplicationCollaboration: 'application',
  ApplicationInterface: 'application',
  ApplicationFunction: 'application',
  ApplicationInteraction: 'application',
  ApplicationProcess: 'application',
  ApplicationEvent: 'application',
  ApplicationService: 'application',
  DataObject: 'application',
  Node: 'technology',
  Device: 'technology',
  SystemSoftware: 'technology',
  TechnologyCollaboration: 'technology',
  TechnologyInterface: 'technology',
  Path: 'technology',
  CommunicationNetwork: 'technology',
  TechnologyFunction: 'technology',
  TechnologyProcess: 'technology',
  TechnologyInteraction: 'technology',
  TechnologyEvent: 'technology',
  TechnologyService: 'technology',
  Artifact: 'technology',
  Equipment: 'physical',
  Facility: 'physical',
  DistributionNetwork: 'physical',
  Material: 'physical',
  Stakeholder: 'motivation',
  Driver: 'motivation',
  Assessment: 'motivation',
  Goal: 'motivation',
  Outcome: 'motivation',
  Principle: 'motivation',
  Requirement: 'motivation',
  Constraint: 'motivation',
  Meaning: 'motivation',
  Value: 'motivation',
  WorkPackage: 'implementation_migration',
  Deliverable: 'implementation_migration',
  ImplementationEvent: 'implementation_migration',
  Plateau: 'implementation_migration',
  Gap: 'implementation_migration',
  Location: 'other',
  Grouping: 'other',
  Junction: 'other',
};

const SPECIAL_FILL: Partial<Record<ElementType, string>> = {
  Location: '#edcfe2',
  Grouping: '#ffffff',
  Junction: '#000000',
};

/** Split CamelCase into words: "CourseOfAction" -> "Course Of Action" -> fix "Of". */
function labelFor(type: string): string {
  const words = type.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
  return words.map((w) => (w === 'Of' ? 'of' : w)).join(' ').replace(' Relationship', '');
}

export const ELEMENT_TYPES: ElementTypeDef[] = ELEMENT_TYPE_NAMES.map((type) => ({
  type,
  label: labelFor(type),
  layer: layerOf[type],
  fill: SPECIAL_FILL[type] ?? LAYER_FILL[layerOf[type]],
  width: type === 'Junction' ? 15 : 120,
  height: type === 'Junction' ? 15 : 55,
}));

export const ELEMENT_TYPE_MAP: Record<string, ElementTypeDef> = Object.fromEntries(
  ELEMENT_TYPES.map((d) => [d.type, d]),
);

export function isElementType(type: string): type is ElementType {
  return type in ELEMENT_TYPE_MAP;
}

export function isRelationshipType(type: string): type is RelationshipType {
  return type in RELATIONSHIP_LETTER;
}

/** "BusinessActor" -> "business-actor"; "CompositionRelationship" -> "composition-relationship" */
export function toKebab(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

const kebabToType = new Map<string, string>();
for (const t of [...ELEMENT_TYPE_NAMES, ...RELATIONSHIP_TYPE_NAMES]) {
  kebabToType.set(toKebab(t), t);
}

/** "business-actor" -> "BusinessActor". Returns undefined for unknown names. */
export function fromKebab(kebab: string): string | undefined {
  return kebabToType.get(kebab);
}

export function relationshipLabel(type: RelationshipType): string {
  return labelFor(type);
}

export function elementLabel(type: ElementType): string {
  return ELEMENT_TYPE_MAP[type].label;
}

/** Layer display info for palette / tree grouping. */
export const LAYERS: { layer: Layer; label: string }[] = [
  { layer: 'strategy', label: 'Strategy' },
  { layer: 'business', label: 'Business' },
  { layer: 'application', label: 'Application' },
  { layer: 'technology', label: 'Technology' },
  { layer: 'physical', label: 'Physical' },
  { layer: 'motivation', label: 'Motivation' },
  { layer: 'implementation_migration', label: 'Implementation & Migration' },
  { layer: 'other', label: 'Other' },
];
