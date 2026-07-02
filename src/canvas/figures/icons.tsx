import type { ReactNode } from 'react';
import type { ElementType } from '../../model/metamodel';

// 16x16 viewBox glyphs, stroke-based, drawn in the element's top-right corner.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.1 } as const;

const actor = (
  <g {...S}>
    <circle cx="8" cy="3.5" r="2.2" />
    <line x1="8" y1="5.7" x2="8" y2="10.5" />
    <line x1="3.5" y1="7.5" x2="12.5" y2="7.5" />
    <line x1="8" y1="10.5" x2="4.5" y2="14.5" />
    <line x1="8" y1="10.5" x2="11.5" y2="14.5" />
  </g>
);

// role: cylinder lying on its side
const role = (
  <g {...S}>
    <path d="M4 5 H12 M4 11 H12" />
    <ellipse cx="12" cy="8" rx="1.8" ry="3" />
    <path d="M4 5 A 1.8 3 0 0 0 4 11" />
  </g>
);

const collaboration = (
  <g {...S}>
    <circle cx="5.7" cy="8" r="3.6" />
    <circle cx="10.3" cy="8" r="3.6" />
  </g>
);

// interface: lollipop
const iface = (
  <g {...S}>
    <line x1="2" y1="8" x2="8.5" y2="8" />
    <circle cx="11.2" cy="8" r="2.8" />
  </g>
);

// process: fat arrow
const process = (
  <g {...S}>
    <path d="M2 6 h7 v-2.6 L14 8 l-5 4.6 V10 H2 Z" strokeLinejoin="round" />
  </g>
);

// function: pointed pennant
const func = (
  <g {...S}>
    <path d="M3 13.5 V5.5 L8 2.5 L13 5.5 V13.5 L8 8.5 Z" strokeLinejoin="round" />
  </g>
);

// interaction: two half-rounded halves
const interaction = (
  <g {...S}>
    <path d="M7 3 A 5 5 0 0 0 7 13 Z" />
    <path d="M9 3 A 5 5 0 0 1 9 13 Z" />
  </g>
);

// event: open pennant with concave left edge
const event = (
  <g {...S}>
    <path d="M3 4.5 h6.5 L13.5 8 L9.5 11.5 H3 A 4.5 4.5 0 0 0 3 4.5 Z" strokeLinejoin="round" />
  </g>
);

// service: pill
const service = (
  <g {...S}>
    <rect x="2.5" y="5" width="11" height="6" rx="3" ry="3" />
  </g>
);

// object: rect with header band
const object = (
  <g {...S}>
    <rect x="3" y="4" width="10" height="8" />
    <line x1="3" y1="6.5" x2="13" y2="6.5" />
  </g>
);

const contract = (
  <g {...S}>
    <rect x="3" y="4" width="10" height="8" />
    <line x1="3" y1="6.5" x2="13" y2="6.5" />
    <line x1="3" y1="9.5" x2="13" y2="9.5" />
  </g>
);

// representation: doc with wavy bottom
const representation = (
  <g {...S}>
    <path d="M3 4 H13 V11 Q 10.5 9.5 8 11 T 3 11 Z" />
  </g>
);

const product = (
  <g {...S}>
    <rect x="3" y="4" width="10" height="8" />
    <path d="M3 6.5 H8 V4" />
  </g>
);

const meaning = (
  <g {...S}>
    <path d="M4.5 11.5 A 2.7 2.7 0 0 1 4 6.3 A 3.2 3.2 0 0 1 10 4.8 A 2.8 2.8 0 0 1 12.3 9.6 A 2.4 2.4 0 0 1 10.5 11.5 Z" />
  </g>
);

const value = (
  <g {...S}>
    <ellipse cx="8" cy="8" rx="5.5" ry="3.5" />
  </g>
);

const location = (
  <g {...S}>
    <path d="M8 14 C 5 10.5 4 8.8 4 6.8 A 4 4 0 0 1 12 6.8 C 12 8.8 11 10.5 8 14 Z" />
    <circle cx="8" cy="6.8" r="1.4" />
  </g>
);

const component = (
  <g {...S}>
    <path d="M5 4 H13 V13 H5 V11 M5 9 V7 M5 6 V4" />
    <rect x="3" y="5.5" width="4" height="2" />
    <rect x="3" y="9" width="4" height="2" />
  </g>
);

const node = (
  <g {...S}>
    <path d="M3 5.5 L5.5 3 H13.5 V10.5 L11 13 H3 Z M3 5.5 H11 V13 M11 5.5 L13.5 3" strokeLinejoin="round" />
  </g>
);

const device = (
  <g {...S}>
    <rect x="3.5" y="3.5" width="9" height="7" rx="1.5" />
    <path d="M5.5 10.5 L3 13.5 H13 L10.5 10.5" strokeLinejoin="round" />
  </g>
);

const systemSoftware = (
  <g {...S}>
    <circle cx="9.5" cy="6.5" r="4" />
    <path d="M11.5 9.9 A 4 4 0 1 1 6.1 4.5" />
  </g>
);

const path_ = (
  <g {...S}>
    <path d="M4.5 5.5 L2 8 l2.5 2.5 M11.5 5.5 L14 8 l-2.5 2.5" strokeLinejoin="round" />
    <path d="M3.5 8 h1.5 M7 8 h2 M11.5 8 H13" />
  </g>
);

const network = (
  <g {...S}>
    <circle cx="4" cy="5" r="1.3" />
    <circle cx="12" cy="5" r="1.3" />
    <circle cx="4" cy="11" r="1.3" />
    <circle cx="12" cy="11" r="1.3" />
    <path d="M5.3 5 H10.7 M5.3 11 H10.7 M4.6 6.2 L11.5 9.9 M11.4 6.2 L4.5 9.9" />
  </g>
);

const artifact = (
  <g {...S}>
    <path d="M4 2.5 H10 L13 5.5 V13.5 H4 Z M10 2.5 V5.5 H13" strokeLinejoin="round" />
  </g>
);

const equipment = (
  <g {...S}>
    <circle cx="6" cy="6" r="2.6" />
    <path d="M6 2.2 V3.4 M6 8.6 V9.8 M2.2 6 H3.4 M8.6 6 H9.8 M3.3 3.3 l.9.9 M7.8 7.8 l.9.9 M8.7 3.3 l-.9.9 M4.2 7.8 l-.9.9" />
    <circle cx="11" cy="11" r="2.2" />
    <path d="M11 8 V9 M11 13 V14 M8 11 H9 M13 11 H14" />
  </g>
);

const facility = (
  <g {...S}>
    <path d="M3 13.5 V3.5 H5.5 V9 L8.5 7 V9 L11.5 7 V9 L13.5 7.5 V13.5 Z" strokeLinejoin="round" />
  </g>
);

const distribution = (
  <g {...S}>
    <path d="M5 5 L2.5 8 L5 11 M11 5 L13.5 8 L11 11" strokeLinejoin="round" />
    <path d="M3.5 6.8 H12.5 M3.5 9.2 H12.5" />
  </g>
);

const material = (
  <g {...S}>
    <path d="M8 3 L13.5 8 L8 13 L2.5 8 Z" strokeLinejoin="round" />
    <path d="M5.5 8 H10.5" />
  </g>
);

const driver = (
  <g {...S}>
    <circle cx="8" cy="8" r="5" />
    <circle cx="8" cy="8" r="1.4" />
    <path d="M8 3 V6.6 M8 9.4 V13 M3 8 H6.6 M9.4 8 H13" />
  </g>
);

const assessment = (
  <g {...S}>
    <circle cx="9.5" cy="6.5" r="3.8" />
    <line x1="6.7" y1="9.3" x2="3" y2="13" />
  </g>
);

const goal = (
  <g {...S}>
    <circle cx="8" cy="8" r="5" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" />
  </g>
);

const outcome = (
  <g {...S}>
    <circle cx="7" cy="9" r="4.8" />
    <circle cx="7" cy="9" r="2.6" />
    <path d="M7 9 L13.5 2.5 M11 2.5 h2.5 v2.5" strokeLinejoin="round" />
  </g>
);

const principle = (
  <g {...S}>
    <path d="M4.5 3 h7 l1 10 h-9 Z" strokeLinejoin="round" />
    <line x1="8" y1="5" x2="8" y2="9" />
    <line x1="8" y1="10.5" x2="8" y2="11.5" />
  </g>
);

const requirement = (
  <g {...S}>
    <path d="M5 4.5 H14 L11 11.5 H2 Z" strokeLinejoin="round" />
  </g>
);

const constraint = (
  <g {...S}>
    <path d="M5 4.5 H14 L11 11.5 H2 Z M7.5 4.5 L4.5 11.5" strokeLinejoin="round" />
  </g>
);

const resource = (
  <g {...S}>
    <rect x="2.5" y="5" width="10" height="6" rx="1" />
    <path d="M12.5 6.8 h1.2 v2.4 h-1.2 M4.5 7 v2 M6.5 7 v2 M8.5 7 v2" />
  </g>
);

const capability = (
  <g {...S}>
    <path d="M9 3 h4 v4 h-4 Z M9 7 h4 v4 h-4 Z M5 7 h4 v4 h-4 Z M5 11 h4 v4 h-4 Z M1 11 h4 v4 h-4 Z M9 11 h4 v4 h-4 Z" transform="scale(0.9) translate(1,-0.5)" />
  </g>
);

const courseOfAction = (
  <g {...S}>
    <circle cx="11" cy="5" r="2.7" />
    <circle cx="11" cy="5" r="1" fill="currentColor" />
    <path d="M2.5 13.5 Q 5.5 13 6.5 10.5 T 9.2 6.6" />
    <path d="M7.8 6.4 l1.7-.5 .4 1.7" />
  </g>
);

const valueStream = (
  <g {...S}>
    <path d="M2.5 4.5 H10 L13.5 8 L10 11.5 H2.5 L6 8 Z" strokeLinejoin="round" />
  </g>
);

const workPackage = (
  <g {...S}>
    <rect x="3" y="4.5" width="10" height="8" rx="1" />
    <path d="M3 7 H13" />
    <path d="M6.5 4.5 V3 h3 v1.5" />
  </g>
);

const deliverable = (
  <g {...S}>
    <path d="M3 4 H13 V10.5 Q 10.5 9 8 10.8 T 3 10.8 Z" />
  </g>
);

const plateau = (
  <g {...S}>
    <path d="M6 4.5 H14 M4 8 H12 M2 11.5 H10" strokeWidth="1.6" />
  </g>
);

const gap = (
  <g {...S}>
    <ellipse cx="8" cy="8" rx="5.5" ry="4" />
    <path d="M6 3 V13 M10 3 V13" />
  </g>
);

const stakeholder = role;

export const ICONS: Partial<Record<ElementType, ReactNode>> = {
  BusinessActor: actor,
  BusinessRole: role,
  BusinessCollaboration: collaboration,
  BusinessInterface: iface,
  BusinessProcess: process,
  BusinessFunction: func,
  BusinessInteraction: interaction,
  BusinessEvent: event,
  BusinessService: service,
  BusinessObject: object,
  Contract: contract,
  Representation: representation,
  Product: product,
  ApplicationComponent: component,
  ApplicationCollaboration: collaboration,
  ApplicationInterface: iface,
  ApplicationFunction: func,
  ApplicationInteraction: interaction,
  ApplicationProcess: process,
  ApplicationEvent: event,
  ApplicationService: service,
  DataObject: object,
  Node: node,
  Device: device,
  SystemSoftware: systemSoftware,
  TechnologyCollaboration: collaboration,
  TechnologyInterface: iface,
  Path: path_,
  CommunicationNetwork: network,
  TechnologyFunction: func,
  TechnologyProcess: process,
  TechnologyInteraction: interaction,
  TechnologyEvent: event,
  TechnologyService: service,
  Artifact: artifact,
  Equipment: equipment,
  Facility: facility,
  DistributionNetwork: distribution,
  Material: material,
  Stakeholder: stakeholder,
  Driver: driver,
  Assessment: assessment,
  Goal: goal,
  Outcome: outcome,
  Principle: principle,
  Requirement: requirement,
  Constraint: constraint,
  Meaning: meaning,
  Value: value,
  Resource: resource,
  Capability: capability,
  CourseOfAction: courseOfAction,
  ValueStream: valueStream,
  WorkPackage: workPackage,
  Deliverable: deliverable,
  ImplementationEvent: event,
  Plateau: plateau,
  Gap: gap,
  Location: location,
};
