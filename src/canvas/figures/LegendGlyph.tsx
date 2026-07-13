import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ElementType, RelationshipType } from '../../model/metamodel';
import { ARCHI_ICONS } from './icons';

type LegendFillStrategy = 'closed' | 'custom' | 'foreground' | 'none';

/**
 * Archi's icon delegates do not share a generic fill rule. This exhaustive table records the
 * result of auditing each Desktop delegate: ordinary closed primitives, bespoke composite
 * artwork, or an icon which intentionally ignores the legend background colour.
 */
const LEGEND_FILL_STRATEGY: Record<ElementType, LegendFillStrategy> = {
  Resource: 'closed',
  Capability: 'closed',
  CourseOfAction: 'custom',
  ValueStream: 'closed',
  BusinessActor: 'closed',
  BusinessRole: 'custom',
  BusinessCollaboration: 'closed',
  BusinessInterface: 'closed',
  BusinessProcess: 'closed',
  BusinessFunction: 'closed',
  BusinessInteraction: 'custom',
  BusinessEvent: 'custom',
  BusinessService: 'closed',
  BusinessObject: 'closed',
  Contract: 'closed',
  Representation: 'custom',
  Product: 'closed',
  ApplicationComponent: 'custom',
  ApplicationCollaboration: 'closed',
  ApplicationInterface: 'closed',
  ApplicationFunction: 'closed',
  ApplicationInteraction: 'custom',
  ApplicationProcess: 'closed',
  ApplicationEvent: 'custom',
  ApplicationService: 'closed',
  DataObject: 'closed',
  Node: 'custom',
  Device: 'closed',
  SystemSoftware: 'custom',
  TechnologyCollaboration: 'closed',
  TechnologyInterface: 'closed',
  Path: 'none',
  CommunicationNetwork: 'custom',
  TechnologyFunction: 'closed',
  TechnologyProcess: 'closed',
  TechnologyInteraction: 'custom',
  TechnologyEvent: 'custom',
  TechnologyService: 'closed',
  Artifact: 'custom',
  Equipment: 'closed',
  Facility: 'closed',
  DistributionNetwork: 'custom',
  Material: 'closed',
  Stakeholder: 'custom',
  Driver: 'custom',
  Assessment: 'closed',
  Goal: 'custom',
  Outcome: 'custom',
  Principle: 'closed',
  Requirement: 'closed',
  Constraint: 'closed',
  Meaning: 'custom',
  Value: 'closed',
  WorkPackage: 'none',
  Deliverable: 'custom',
  ImplementationEvent: 'custom',
  Plateau: 'none',
  Gap: 'closed',
  Location: 'closed',
  Grouping: 'closed',
  Junction: 'foreground',
};

function closedBackgroundArtwork(node: ReactNode, color: string): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return null;
    const element = child as ReactElement<Record<string, unknown>>;
    const tag = typeof element.type === 'string' ? element.type : undefined;
    const d = typeof element.props.d === 'string' ? element.props.d : '';
    const closed = tag === 'circle' || tag === 'ellipse' || tag === 'rect' ||
      tag === 'polygon' || (tag === 'path' && /z\s*$/i.test(d));
    if (closed) {
      return cloneElement(element, {
        fill: color,
        stroke: 'none',
        'data-legend-background-shape': 'true',
      });
    }
    const nested = element.props.children as ReactNode;
    if (nested === undefined) return null;
    const children = closedBackgroundArtwork(nested, color);
    return Children.count(children) > 0 ? cloneElement(element, { children }) : null;
  });
}

const BACKGROUND_PROPS = {
  stroke: 'none',
  'data-legend-background-shape': 'true',
} as const;

/** SWT Path.addArc converted to the same SVG coordinates used by the shared icon registry. */
function iconArc(
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  extent: number,
): string {
  const rx = width / 2;
  const ry = height / 2;
  const cx = x + rx;
  const cy = y + ry;
  const point = (angle: number) => [
    +(cx + rx * Math.cos((angle * Math.PI) / 180)).toFixed(2),
    +(cy - ry * Math.sin((angle * Math.PI) / 180)).toFixed(2),
  ] as const;
  const sweep = extent > 0 ? 0 : 1;
  const [startX, startY] = point(start);
  if (Math.abs(extent) >= 360) {
    const [midX, midY] = point(start + 180);
    return `M${startX} ${startY} A${rx} ${ry} 0 1 ${sweep} ${midX} ${midY} ` +
      `A${rx} ${ry} 0 1 ${sweep} ${startX} ${startY}`;
  }
  const [endX, endY] = point(start + extent);
  const large = Math.abs(extent) > 180 ? 1 : 0;
  return `M${startX} ${startY} A${rx} ${ry} 0 ${large} ${sweep} ${endX} ${endY}`;
}

function CustomBackgroundArtwork({ type, color }: { type: ElementType; color: string }) {
  const props = { ...BACKGROUND_PROPS, fill: color };
  if (type === 'CourseOfAction' || type === 'Driver' || type === 'Goal' || type === 'Outcome') {
    return <circle {...props} cx={6.5} cy={6.5} r={6.5} data-legend-background-part="outer-circle" />;
  }
  if (type === 'BusinessRole') {
    return (
      <>
        <path {...props} d="M2.5 0 A2.5 4 0 0 0 2.5 8 L12 8 L12 0 L2 0 Z" data-legend-background-part="role-body" />
        <ellipse {...props} cx={12.5} cy={4} rx={2.5} ry={4} data-legend-background-part="role-end" />
      </>
    );
  }
  if (type === 'Stakeholder') {
    return (
      <>
        <path {...props} d={iconArc(0, 0, 8, 7, 90, 180)} data-legend-background-part="stakeholder-arc" />
        <rect {...props} x={3} y={0} width={6} height={7} data-legend-background-part="stakeholder-body" />
        <ellipse {...props} cx={11.5} cy={3.5} rx={3.5} ry={3.5} data-legend-background-part="stakeholder-end" />
      </>
    );
  }
  if (type.endsWith('Interaction')) {
    return (
      <>
        <path {...props} d="M0 0 A5 6 0 0 0 0 12 L0 -0.5 Z" data-legend-background-part="interaction-left" />
        <path {...props} d="M3 12 A5 6 0 0 0 3 0 L3 12.5 Z" data-legend-background-part="interaction-right" />
      </>
    );
  }
  if (type.endsWith('Event')) {
    return (
      <g data-legend-background-part="event-body">
        <path {...props} d={iconArc(8, 0, 8, 9, 270, 180)} />
        <rect {...props} x={0} y={0} width={12} height={9} />
        <path {...props} d={iconArc(-4, 0, 8, 9, 270, 180)} />
      </g>
    );
  }
  if (type === 'Representation' || type === 'Deliverable') {
    return (
      <path
        {...props}
        d="M0 0 L0 7.5 Q3.5 11.5 8 8.5 Q10.5 6 14 8.5 L14 0 L-0.5 0 Z"
        data-legend-background-part="deliverable-body"
      />
    );
  }
  if (type === 'ApplicationComponent') {
    return (
      <>
        <path {...props} d="M0 0 L0 -13 L10 -13 L10 0 Z" data-legend-background-part="component-body" />
        <rect {...props} x={-3} y={-11} width={6} height={2.5} data-legend-background-part="component-tab-top" />
        <rect {...props} x={-3} y={-6} width={6} height={2.5} data-legend-background-part="component-tab-bottom" />
      </>
    );
  }
  if (type === 'Node') {
    return (
      <>
        <rect {...props} x={0} y={0} width={11} height={11} data-legend-background-part="node-front" />
        <path
          {...props}
          d="M-0.2 0 L3.2 -3 L14 -3 L14 8 L11 11.2 Z"
          data-legend-background-part="node-depth"
        />
      </>
    );
  }
  if (type === 'SystemSoftware') {
    return (
      <>
        <path {...props} d={iconArc(0, 0, 11, 11, 90, 360)} data-legend-background-part="software-disc" />
        <path {...props} d={iconArc(2, -2, 11, 11, -60, 210)} data-legend-background-part="software-overlay" />
      </>
    );
  }
  if (type === 'CommunicationNetwork') {
    return (
      <g data-legend-background-part="communication-nodes">
        <circle {...props} cx={2.5} cy={2.5} r={2.5} />
        <circle {...props} cx={4.5} cy={-5.5} r={2.5} />
        <circle {...props} cx={12.5} cy={-5.5} r={2.5} />
        <circle {...props} cx={10.5} cy={2.5} r={2.5} />
      </g>
    );
  }
  if (type === 'Artifact') {
    return <path {...props} d="M0 0 L7 0 L12 5 L12 15 L0 15 Z" data-legend-background-part="artifact-body" />;
  }
  if (type === 'DistributionNetwork') {
    return <path {...props} d="M1 -2 L14 -2 L16 1 L14 2 L0 2 L0 -2 Z" data-legend-background-part="distribution-body" />;
  }
  if (type === 'Meaning') {
    return (
      <>
        <rect {...props} x={0.5} y={1} width={9.5} height={6} data-legend-background-part="meaning-core" />
        <path {...props} d={iconArc(0, 0, 8, 6, 60, 149)} />
        <path {...props} d={iconArc(3, 0, 8, 6, -38, 157)} />
        <path {...props} d={iconArc(0, 3, 6, 5, -41, -171)} />
        <path {...props} d={iconArc(4, 2, 6, 6, 7, -136)} />
      </>
    );
  }
  return null;
}

function backgroundArtwork(
  type: ElementType,
  glyph: ReactNode,
  color: string,
  strategy: LegendFillStrategy,
): ReactNode {
  if (strategy === 'none' || strategy === 'foreground') return null;
  if (strategy === 'custom') return <CustomBackgroundArtwork type={type} color={color} />;
  return closedBackgroundArtwork(glyph, color);
}

function foregroundArtwork(type: ElementType, glyph: ReactNode, backgroundColor?: string) {
  if (type !== 'Junction') return glyph;
  const color = backgroundColor ?? 'currentColor';
  return (
    <g
      data-legend-junction-desktop="true"
      fill="none"
      stroke={color}
      strokeWidth={1}
    >
      <rect x={2} y={2} width={2} height={2} />
      <rect x={2} y={12} width={2} height={2} />
      <rect x={14} y={7} width={2} height={2} />
      <line x1={4} y1={4} x2={6} y2={6} />
      <line x1={10} y1={8} x2={14} y2={8} />
      <line x1={4} y1={12} x2={6} y2={10} />
      <circle cx={8} cy={8} r={3} fill={color} stroke="none" />
    </g>
  );
}

/** Exact existing Archi element glyph, with Desktop's optional background fill inside the glyph. */
export function LegendElementGlyph({
  type,
  backgroundColor,
  size = 18,
}: {
  type: ElementType;
  backgroundColor?: string;
  size?: number;
}) {
  const definition = ARCHI_ICONS[type];
  if (!definition) return null;
  const fillStrategy = LEGEND_FILL_STRATEGY[type];
  const [x, y, width, height] = type === 'Junction'
    ? [2, 2, 14, 12]
    : definition.box;
  const padding = 1.5;
  return (
    <svg
      data-legend-element-glyph={type}
      data-legend-background={backgroundColor}
      data-legend-fill-strategy={fillStrategy}
      viewBox={`${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}`}
      width={size}
      height={size}
      color="#000000"
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
    >
      {backgroundColor && backgroundArtwork(type, definition.glyph, backgroundColor, fillStrategy)}
      {foregroundArtwork(type, definition.glyph, backgroundColor)}
    </svg>
  );
}

const LINE_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
} as const;

function RelationshipLine({ d, dash }: { d: string; dash?: string }) {
  return (
    <path
      data-legend-relationship-line="true"
      {...LINE_PROPS}
      d={d}
      strokeDasharray={dash}
    />
  );
}

/** 13 x 13 diagonal relationship artwork transcribed from Archi 5.9's icon delegates. */
export function LegendRelationshipGlyph({ type, size = 18 }: {
  type: RelationshipType;
  size?: number;
}) {
  const openArrow = <path {...LINE_PROPS} d="M8 0 L13 0 L13 5" />;
  const filledArrow = (
    <path d="M8 0 L13 0 L13 5 Z" fill="currentColor" stroke="currentColor" strokeWidth={1} />
  );
  let glyph: ReactNode;
  switch (type) {
    case 'CompositionRelationship':
      glyph = (
        <>
          <rect x={0} y={9} width={4} height={4} fill="currentColor" stroke="currentColor" />
          <RelationshipLine d="M4 9 L13 0" />
        </>
      );
      break;
    case 'AggregationRelationship':
      glyph = (
        <>
          <rect x={0} y={9} width={4} height={4} fill="none" stroke="currentColor" />
          <RelationshipLine d="M4 9 L13 0" />
        </>
      );
      break;
    case 'AssignmentRelationship':
      glyph = (
        <>
          <RelationshipLine d="M0 13 L13 0" />
          {filledArrow}
          <circle cx={1.5} cy={11.5} r={2.5} fill="currentColor" />
        </>
      );
      break;
    case 'RealizationRelationship':
      glyph = (
        <>
          <RelationshipLine d="M0 13 L10 3" dash="1.5 1.5" />
          <path {...LINE_PROPS} d="M7 0 L13 0 L13 6 Z" />
        </>
      );
      break;
    case 'ServingRelationship':
      glyph = <><RelationshipLine d="M0 13 L13 0" />{openArrow}</>;
      break;
    case 'AccessRelationship':
      glyph = <><RelationshipLine d="M0 13 L13 0" dash="1.5 1.5" />{openArrow}</>;
      break;
    case 'InfluenceRelationship':
      glyph = (
        <>
          <RelationshipLine d="M0 13 L13 0" dash="3 1.5" />
          {openArrow}
          <path {...LINE_PROPS} d="M9 8 L13 8 M11 6 L11 10" />
        </>
      );
      break;
    case 'TriggeringRelationship':
      glyph = <><RelationshipLine d="M0 13 L13 0" />{filledArrow}</>;
      break;
    case 'FlowRelationship':
      glyph = <><RelationshipLine d="M0 13 L13 0" dash="3 1.5" />{filledArrow}</>;
      break;
    case 'SpecializationRelationship':
      glyph = (
        <>
          <RelationshipLine d="M0 13 L10 3" />
          <path {...LINE_PROPS} d="M7 0 L13 0 L13 6 Z" />
        </>
      );
      break;
    case 'AssociationRelationship':
      glyph = <RelationshipLine d="M0 13 L13 0" />;
      break;
  }
  return (
    <svg
      data-legend-relationship-glyph={type}
      viewBox="-1 -1 16 16"
      width={size}
      height={size}
      color="#000000"
      overflow="visible"
      preserveAspectRatio="xMidYMid meet"
    >
      {glyph}
    </svg>
  );
}
