// ArchiMate viewpoint definitions, hand-ported 1:1 from Archi (master) — same
// discipline as icons.tsx. Do not invent entries; track Archi's sources:
//   - com.archimatetool.model/model/viewpoints.xml
//       (the viewpoint table: ids, names, allowed concept lists)
//   - .../src/com/archimatetool/model/viewpoints/Viewpoint.java  (isAllowedConcept)
//   - .../src/com/archimatetool/model/util/ArchimateModelUtils.java
//       (getBusinessClasses() etc — the $…Elements$ collection expansions)
//
// Semantics ported from Viewpoint.isAllowedConcept():
//   - a viewpoint whose element list is empty allows every element (e.g. "Layered");
//   - the defaultList {Junction, Grouping} is allowed in every viewpoint;
//   - a null / unknown viewpoint (NONE_VIEWPOINT) allows everything.
// Relationships are never restricted here.
//
// The viewpoint ids/names must stay in lockstep with VIEWPOINT_ID_TO_NAME in
// src/model/io/exchange-xml/mapping.ts (tests/viewpoints.test.ts asserts this).

import type { ElementType } from '../metamodel';

// $…Elements$ collection expansions — ArchimateModelUtils.getXxxClasses().
const STRATEGY_ELEMENTS: readonly ElementType[] = [
  'Resource',
  'Capability',
  'ValueStream',
  'CourseOfAction',
];

const BUSINESS_ELEMENTS: readonly ElementType[] = [
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
];

const APPLICATION_ELEMENTS: readonly ElementType[] = [
  'ApplicationComponent',
  'ApplicationCollaboration',
  'ApplicationInterface',
  'ApplicationFunction',
  'ApplicationInteraction',
  'ApplicationProcess',
  'ApplicationEvent',
  'ApplicationService',
  'DataObject',
];

const TECHNOLOGY_ELEMENTS: readonly ElementType[] = [
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
];

const PHYSICAL_ELEMENTS: readonly ElementType[] = [
  'Equipment',
  'Facility',
  'DistributionNetwork',
  'Material',
];

const MOTIVATION_ELEMENTS: readonly ElementType[] = [
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
];

const IMPLEMENTATION_MIGRATION_ELEMENTS: readonly ElementType[] = [
  'WorkPackage',
  'Deliverable',
  'ImplementationEvent',
  'Plateau',
  'Gap',
];

export interface ViewpointDef {
  /** Archi viewpoint id, e.g. 'application_usage'. */
  id: string;
  /** Display name. */
  name: string;
  /** Allowed element types (empty = allow all). */
  elementTypes: readonly ElementType[];
}

// One entry per <viewpoint> in viewpoints.xml, transcribed in file order.
export const VIEWPOINTS: readonly ViewpointDef[] = [
  {
    id: 'organization',
    name: 'Organization',
    elementTypes: [
      'BusinessActor',
      'BusinessCollaboration',
      'BusinessInterface',
      'BusinessRole',
      'Location',
    ],
  },
  {
    id: 'business_process_cooperation',
    name: 'Business Process Cooperation',
    elementTypes: [
      ...APPLICATION_ELEMENTS,
      'BusinessActor',
      'BusinessCollaboration',
      'BusinessEvent',
      'BusinessFunction',
      'BusinessInteraction',
      'BusinessInterface',
      'BusinessObject',
      'BusinessProcess',
      'BusinessRole',
      'BusinessService',
      'Location',
      'Representation',
    ],
  },
  {
    id: 'product',
    name: 'Product',
    elementTypes: [
      ...APPLICATION_ELEMENTS,
      'Artifact',
      'BusinessActor',
      'BusinessCollaboration',
      'BusinessEvent',
      'BusinessFunction',
      'BusinessInteraction',
      'BusinessInterface',
      'BusinessObject',
      'BusinessProcess',
      'BusinessRole',
      'BusinessService',
      'Contract',
      'Material',
      'Product',
      'TechnologyService',
      'Value',
    ],
  },
  {
    id: 'application_cooperation',
    name: 'Application Cooperation',
    elementTypes: [...APPLICATION_ELEMENTS, 'Location'],
  },
  {
    id: 'application_structure',
    name: 'Application Structure',
    elementTypes: [
      'ApplicationComponent',
      'ApplicationCollaboration',
      'ApplicationInterface',
      'DataObject',
    ],
  },
  {
    id: 'application_usage',
    name: 'Application Usage',
    elementTypes: [
      ...APPLICATION_ELEMENTS,
      'BusinessActor',
      'BusinessCollaboration',
      'BusinessEvent',
      'BusinessFunction',
      'BusinessInteraction',
      'BusinessObject',
      'BusinessProcess',
      'BusinessRole',
    ],
  },
  {
    id: 'implementation_deployment',
    name: 'Implementation and Deployment',
    elementTypes: [
      ...APPLICATION_ELEMENTS,
      'Artifact',
      'Path',
      'SystemSoftware',
      'TechnologyFunction',
      'TechnologyInteraction',
      'TechnologyInterface',
      'TechnologyProcess',
      'TechnologyService',
    ],
  },
  {
    id: 'technology',
    name: 'Technology',
    elementTypes: [...TECHNOLOGY_ELEMENTS, 'Location'],
  },
  {
    id: 'technology_usage',
    name: 'Technology Usage',
    elementTypes: [
      'ApplicationComponent',
      'ApplicationCollaboration',
      'ApplicationEvent',
      'ApplicationFunction',
      'ApplicationInteraction',
      'ApplicationProcess',
      ...TECHNOLOGY_ELEMENTS,
    ],
  },
  {
    id: 'information_structure',
    name: 'Information Structure',
    elementTypes: ['Artifact', 'BusinessObject', 'DataObject', 'Meaning', 'Representation'],
  },
  {
    id: 'service_realization',
    name: 'Service Realization',
    elementTypes: [
      ...APPLICATION_ELEMENTS,
      'BusinessActor',
      'BusinessCollaboration',
      'BusinessEvent',
      'BusinessFunction',
      'BusinessInteraction',
      'BusinessInterface',
      'BusinessObject',
      'BusinessProcess',
      'BusinessRole',
      'BusinessService',
      'Representation',
    ],
  },
  {
    id: 'physical',
    name: 'Physical',
    elementTypes: [
      ...PHYSICAL_ELEMENTS,
      'CommunicationNetwork',
      'Device',
      'Location',
      'Node',
      'Path',
    ],
  },
  {
    id: 'stakeholder',
    name: 'Stakeholder',
    elementTypes: ['Assessment', 'Driver', 'Goal', 'Outcome', 'Stakeholder'],
  },
  {
    id: 'goal_realization',
    name: 'Goal Realization',
    elementTypes: ['Constraint', 'Goal', 'Outcome', 'Principle', 'Requirement'],
  },
  {
    id: 'requirements_realization',
    name: 'Requirements Realization',
    elementTypes: [
      'Constraint',
      'Goal',
      'Meaning',
      'Outcome',
      'Principle',
      'Requirement',
      'Value',
      ...STRATEGY_ELEMENTS,
      ...BUSINESS_ELEMENTS,
      ...APPLICATION_ELEMENTS,
      ...TECHNOLOGY_ELEMENTS,
      'Location',
    ],
  },
  {
    id: 'motivation',
    name: 'Motivation',
    elementTypes: [...MOTIVATION_ELEMENTS],
  },
  {
    id: 'strategy',
    name: 'Strategy',
    elementTypes: [...STRATEGY_ELEMENTS, 'Outcome'],
  },
  {
    id: 'capability',
    name: 'Capability Map',
    elementTypes: ['Capability', 'Outcome', 'Resource'],
  },
  {
    id: 'value_stream',
    name: 'Value Stream',
    elementTypes: ['Capability', 'Outcome', 'Stakeholder', 'ValueStream'],
  },
  {
    id: 'outcome_realization',
    name: 'Outcome Realization',
    elementTypes: [
      'Capability',
      'Meaning',
      'Outcome',
      'Resource',
      'Value',
      'ValueStream',
      ...BUSINESS_ELEMENTS,
      ...APPLICATION_ELEMENTS,
      ...TECHNOLOGY_ELEMENTS,
      'Location',
    ],
  },
  {
    id: 'resource',
    name: 'Resource Map',
    elementTypes: ['Capability', 'Resource', 'WorkPackage'],
  },
  {
    id: 'project',
    name: 'Project',
    elementTypes: [
      'BusinessActor',
      'BusinessRole',
      'Deliverable',
      'Goal',
      'ImplementationEvent',
      'Outcome',
      'WorkPackage',
    ],
  },
  {
    id: 'migration',
    name: 'Migration',
    elementTypes: ['Gap', 'Plateau'],
  },
  {
    id: 'implementation_migration',
    name: 'Implementation and Migration',
    elementTypes: [
      ...BUSINESS_ELEMENTS,
      ...APPLICATION_ELEMENTS,
      ...TECHNOLOGY_ELEMENTS,
      ...IMPLEMENTATION_MIGRATION_ELEMENTS,
      'Constraint',
      'Goal',
      'Location',
      'Requirement',
    ],
  },
  {
    id: 'layered',
    name: 'Layered',
    elementTypes: [],
  },
];

const byId = new Map<string, ViewpointDef>(VIEWPOINTS.map((vp) => [vp.id, vp]));

/** Viewpoint.defaultList — always allowed regardless of the active viewpoint. */
const ALWAYS_ALLOWED: ReadonlySet<ElementType> = new Set<ElementType>(['Junction', 'Grouping']);

/**
 * Port of Viewpoint.isAllowedConcept for elements. '' / undefined viewpoint,
 * unknown ids, junctions/groupings, and empty allow-lists all allow everything
 * (Archi behavior). Relationships are never restricted.
 */
export function isAllowedElementInViewpoint(
  viewpointId: string | undefined,
  type: ElementType,
): boolean {
  if (!viewpointId) return true; // no viewpoint (NONE_VIEWPOINT) → allow all
  if (ALWAYS_ALLOWED.has(type)) return true; // defaultList {Junction, Grouping}
  const vp = byId.get(viewpointId);
  if (!vp) return true; // unknown id → NONE_VIEWPOINT → allow all
  if (vp.elementTypes.length === 0) return true; // empty list → allow all elements
  return vp.elementTypes.includes(type);
}
