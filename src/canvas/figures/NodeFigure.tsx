import type { CSSProperties, ReactNode } from 'react';
import {
  c4ElementLabelParts,
  c4VisualStyleForElement,
  type C4ElementLabelParts,
  type C4ViewType,
  type C4VisualStyle,
} from '../../model/c4';
import { ELEMENT_TYPE_MAP, type ElementType } from '../../model/metamodel';
import type { ArchimateElement, DiagramNode, DiagramView } from '../../model/types';
import { parseFont } from '../geometry';
import { ARCHI_ICONS, NodeIcon } from './icons';

const DEFAULT_LINE = '#5c5c5c';

type ShapeKind =
  | 'rect'
  | 'rounded'
  | 'octagon'
  | 'banded'
  | 'contract'
  | 'product'
  | 'artifact'
  | 'wavy'
  | 'wavy-lined'
  | 'cloud'
  | 'ellipse'
  | 'junction'
  | 'grouping'
  | 'grouping-tab'
  | 'cylinder'
  | 'capsule'
  | 'pennant'
  | 'arrow'
  | 'chevron-banner'
  | 'lenses'
  | 'circles'
  | 'lollipop'
  | 'parallelogram'
  | 'box3d'
  | 'component'
  | 'pin';

const ROUNDED_TYPES = new Set<ElementType>([
  'Capability',
  'CourseOfAction',
  'ValueStream',
  'WorkPackage',
  'BusinessProcess',
  'BusinessFunction',
  'BusinessInteraction',
  'BusinessEvent',
  'BusinessService',
  'ApplicationFunction',
  'ApplicationInteraction',
  'ApplicationProcess',
  'ApplicationEvent',
  'ApplicationService',
  'TechnologyFunction',
  'TechnologyProcess',
  'TechnologyInteraction',
  'TechnologyEvent',
  'TechnologyService',
  'ImplementationEvent',
]);

const MOTIVATION_TYPES = new Set<ElementType>([
  'Stakeholder',
  'Driver',
  'Assessment',
  'Goal',
  'Outcome',
  'Principle',
  'Requirement',
  'Constraint',
]);

/** Alternate figures (Archi figureType 1): the classic ArchiMate notation shapes. */
const ALT_SHAPES: Partial<Record<ElementType, ShapeKind>> = {
  BusinessObject: 'banded',
  DataObject: 'banded',
  Contract: 'contract',
  Product: 'product',
  Deliverable: 'wavy',
  Representation: 'wavy-lined',
  Artifact: 'artifact',
  Node: 'box3d',
  BusinessRole: 'cylinder',
  Stakeholder: 'cylinder',
  BusinessService: 'capsule',
  ApplicationService: 'capsule',
  TechnologyService: 'capsule',
  BusinessEvent: 'pennant',
  ApplicationEvent: 'pennant',
  TechnologyEvent: 'pennant',
  ImplementationEvent: 'pennant',
  BusinessProcess: 'arrow',
  ApplicationProcess: 'arrow',
  TechnologyProcess: 'arrow',
  BusinessFunction: 'chevron-banner',
  ApplicationFunction: 'chevron-banner',
  TechnologyFunction: 'chevron-banner',
  BusinessInteraction: 'lenses',
  ApplicationInteraction: 'lenses',
  TechnologyInteraction: 'lenses',
  BusinessCollaboration: 'circles',
  ApplicationCollaboration: 'circles',
  TechnologyCollaboration: 'circles',
  BusinessInterface: 'lollipop',
  ApplicationInterface: 'lollipop',
  TechnologyInterface: 'lollipop',
  Requirement: 'parallelogram',
  Constraint: 'parallelogram',
  Meaning: 'cloud',
  Value: 'ellipse',
  Location: 'pin',
  Grouping: 'grouping-tab',
  ApplicationComponent: 'component',
};

/**
 * Archi's figure semantics: figureType 0 (default) draws a plain/rounded box
 * (octagon for motivation) with the corner icon; figureType 1 draws the classic
 * notation shape without an icon.
 */
function shapeFor(type: ElementType, figureType: number): ShapeKind {
  if (type === 'Junction') return 'junction';
  if (figureType === 1) {
    const alt = ALT_SHAPES[type];
    if (alt) return alt;
  }
  if (type === 'Grouping') return 'grouping';
  if (MOTIVATION_TYPES.has(type)) return 'octagon';
  if (ROUNDED_TYPES.has(type)) return 'rounded';
  return 'rect';
}

function shapePath(kind: ShapeKind, w: number, h: number): ReactNode | null {
  switch (kind) {
    case 'octagon': {
      const c = 10; // Archi's FLANGE
      return (
        <polygon
          points={`${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`}
        />
      );
    }
    case 'wavy':
    case 'wavy-lined':
      return (
        <path
          d={`M0,0 H${w} V${h - 8} Q ${w * 0.75},${h - 16} ${w / 2},${h - 8} T 0,${h - 8} Z`}
        />
      );
    case 'cloud':
      return (
        <path
          d={`M ${w * 0.2},${h * 0.85}
              A ${w * 0.18} ${h * 0.22} 0 0 1 ${w * 0.12},${h * 0.4}
              A ${w * 0.2} ${h * 0.25} 0 0 1 ${w * 0.45},${h * 0.2}
              A ${w * 0.22} ${h * 0.28} 0 0 1 ${w * 0.8},${h * 0.3}
              A ${w * 0.18} ${h * 0.22} 0 0 1 ${w * 0.85},${h * 0.75}
              A ${w * 0.16} ${h * 0.2} 0 0 1 ${w * 0.6},${h * 0.85} Z`}
        />
      );
    case 'ellipse':
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} />;
    case 'capsule':
      return <rect width={w} height={h} rx={h / 2} ry={h / 2} />;
    case 'pennant':
      return (
        <path
          d={`M${h * 0.4},0 H${w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${w - h / 2},${h} H${h * 0.4} A${h * 0.55} ${h * 0.55} 0 0 0 ${h * 0.4},0 Z`}
        />
      );
    case 'arrow': {
      const a = Math.min(h / 2, 30);
      return (
        <path d={`M0,${h * 0.15} H${w - a} V0 L${w},${h / 2} L${w - a},${h} V${h * 0.85} H0 Z`} />
      );
    }
    case 'chevron-banner': {
      const inset = Math.min(w * 0.15, 25);
      return (
        <polygon points={`0,${h * 0.15} ${w / 2},0 ${w},${h * 0.15} ${w},${h} ${w / 2},${h - inset} 0,${h}`} />
      );
    }
    case 'parallelogram': {
      const s = Math.min(w * 0.15, 25);
      return <polygon points={`${s},0 ${w},0 ${w - s},${h} 0,${h}`} />;
    }
    case 'box3d': {
      const f = 14;
      return (
        <g>
          <path d={`M0,${f} L${f},0 H${w} V${h - f} L${w - f},${h} H0 Z`} />
          <path d={`M0,${f} H${w - f} V${h} M${w - f},${f} L${w},0`} fill="none" />
        </g>
      );
    }
    case 'pin':
      return (
        <path
          d={`M${w / 2},${h} C${w * 0.28},${h * 0.55} ${w * 0.22},${h * 0.45} ${w * 0.22},${h * 0.3} A${w * 0.28} ${h * 0.28} 0 1 1 ${w * 0.78},${h * 0.3} C${w * 0.78},${h * 0.45} ${w * 0.72},${h * 0.55} ${w / 2},${h} Z`}
        />
      );
    default:
      return null;
  }
}

export interface FigureProps {
  node: DiagramNode;
  element?: ArchimateElement;
  refView?: DiagramView;
  width: number;
  height: number;
  c4ViewType?: C4ViewType;
}

/** The visual shape + label of one diagram node (position handled by parent <g>). */
export function NodeFigure({ node, element, refView, width: w, height: h, c4ViewType }: FigureProps) {
  const font = parseFont(node.font);
  const alpha = (node.alpha ?? 255) / 255;
  const lineAlpha = (node.lineAlpha ?? 255) / 255;
  const stroke = node.lineColor ?? DEFAULT_LINE;
  const fontColor = node.fontColor ?? '#000000';

  const labelStyle = (align: 'left' | 'center' | 'right', vert: 'top' | 'center' | 'bottom'): CSSProperties => ({
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
    justifyContent: vert === 'top' ? 'flex-start' : vert === 'bottom' ? 'flex-end' : 'center',
    textAlign: align,
    fontFamily: font.family + ', sans-serif',
    fontSize: font.sizePx,
    fontWeight: font.bold ? 700 : 400,
    fontStyle: font.italic ? 'italic' : 'normal',
    color: fontColor,
    overflow: 'hidden',
    lineHeight: 1.25,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    padding: '3px 4px',
  });

  const alignOf = (def: 'left' | 'center' | 'right' = 'center') =>
    node.textAlignment === 1
      ? 'left'
      : node.textAlignment === 2
        ? 'center'
        : node.textAlignment === 4
          ? 'right'
          : def;
  const vertOf = (def: 'top' | 'center' | 'bottom' = 'center') =>
    node.textPosition === 0
      ? 'top'
      : node.textPosition === 1
        ? 'center'
        : node.textPosition === 2
          ? 'bottom'
          : def;

  function label(text: string, opts?: { align?: 'left' | 'center' | 'right'; vert?: 'top' | 'center' | 'bottom'; inset?: number }) {
    if (!text) return null;
    const inset = opts?.inset ?? 0;
    return (
      <foreignObject x={inset} y={inset} width={Math.max(0, w - inset * 2)} height={Math.max(0, h - inset * 2)}>
        <div style={labelStyle(opts?.align ?? alignOf(), opts?.vert ?? vertOf())}>{text}</div>
      </foreignObject>
    );
  }

  function icon(type: ElementType) {
    if (!ARCHI_ICONS[type] || w < 40) return null;
    return (
      <g color={stroke}>
        <NodeIcon type={type} width={w} />
      </g>
    );
  }

  function c4ElementTypeLine(parts: C4ElementLabelParts): string {
    return parts.technology
      ? `[${parts.kindLabel}: ${parts.technology}]`
      : `[${parts.kindLabel}]`;
  }

  function c4StructuredLabel(
    parts: C4ElementLabelParts,
    color: string,
    inset: number,
    extraTop = 0,
  ) {
    return (
      <foreignObject
        x={inset}
        y={inset + extraTop}
        width={Math.max(0, w - inset * 2)}
        height={Math.max(0, h - inset * 2 - extraTop)}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontFamily: font.family + ', sans-serif',
            fontSize: font.sizePx,
            color,
            overflow: 'hidden',
            lineHeight: 1.2,
            wordBreak: 'break-word',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontWeight: 700, maxWidth: '100%' }}>{parts.name}</div>
          <div style={{ fontSize: Math.max(10, font.sizePx - 1), marginTop: 3, maxWidth: '100%' }}>
            {c4ElementTypeLine(parts)}
          </div>
          {parts.description && (
            <div style={{ fontSize: Math.max(10, font.sizePx - 2), marginTop: 6, maxWidth: '100%' }}>
              {parts.description}
            </div>
          )}
        </div>
      </foreignObject>
    );
  }

  function c4BoundaryLabel(parts: C4ElementLabelParts, color: string) {
    return (
      <text
        x={12}
        y={22}
        fontFamily={font.family + ', sans-serif'}
        fontSize={Math.max(11, font.sizePx)}
        fontWeight={700}
        fill={color}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {parts.kindLabel}: {parts.name}
      </text>
    );
  }

  function c4DatabaseBody(fill: string, lineColor: string, visual: C4VisualStyle) {
    const capH = Math.min(24, Math.max(14, h * 0.24));
    return (
      <g>
        <path
          data-c4-shape={visual.shape}
          d={`M0,${capH / 2} V${h - capH / 2} C0,${h + capH / 2} ${w},${h + capH / 2} ${w},${h - capH / 2} V${capH / 2} C${w},${capH * 1.5} 0,${capH * 1.5} 0,${capH / 2} Z`}
          fill={fill}
          fillOpacity={alpha}
          stroke={lineColor}
          strokeOpacity={lineAlpha}
        />
        <ellipse
          cx={w / 2}
          cy={capH / 2}
          rx={w / 2}
          ry={capH / 2}
          fill={fill}
          fillOpacity={alpha}
          stroke={lineColor}
          strokeOpacity={lineAlpha}
        />
      </g>
    );
  }

  function c4Figure(element: ArchimateElement, visual: C4VisualStyle) {
    const parts = c4ElementLabelParts(element);
    if (!parts) return null;
    const fill = node.fillColor ?? visual.fillColor;
    const lineColor = node.lineColor ?? visual.lineColor;
    const textColor = node.fontColor ?? visual.fontColor;

    if (visual.shape === 'boundary') {
      return (
        <g>
          <rect
            data-c4-shape={visual.shape}
            width={w}
            height={h}
            rx={6}
            ry={6}
            fill={fill}
            fillOpacity={alpha}
            stroke={lineColor}
            strokeOpacity={lineAlpha}
            strokeDasharray="8 5"
          />
          {c4BoundaryLabel(parts, textColor)}
        </g>
      );
    }

    const body =
      visual.shape === 'database' ? (
        c4DatabaseBody(fill, lineColor, visual)
      ) : (
        <rect
          data-c4-shape={visual.shape}
          width={w}
          height={h}
          rx={4}
          ry={4}
          fill={fill}
          fillOpacity={alpha}
          stroke={lineColor}
          strokeOpacity={lineAlpha}
        />
      );

    return (
      <g>
        {body}
        {c4StructuredLabel(parts, textColor, 10)}
      </g>
    );
  }

  // ---- non-element nodes -------------------------------------------------
  if (node.nodeType === 'note') {
    const fill = node.fillColor ?? '#ffffff';
    const border = node.borderType ?? 0;
    return (
      <g>
        {border === 0 ? (
          <path
            d={`M0,0 H${w} V${h - 12} L${w - 12},${h} H0 Z`}
            fill={fill}
            fillOpacity={alpha}
            stroke={stroke}
            strokeOpacity={lineAlpha}
          />
        ) : (
          <rect
            width={w}
            height={h}
            fill={fill}
            fillOpacity={alpha}
            stroke={border === 2 ? 'none' : stroke}
            strokeOpacity={lineAlpha}
          />
        )}
        {label(node.content, { align: alignOf('left'), vert: vertOf('top') })}
      </g>
    );
  }

  if (node.nodeType === 'group') {
    const fill = node.fillColor ?? '#d2d7dd';
    const tabW = Math.min(w / 2, 120);
    const tabH = 18;
    if ((node.borderType ?? 0) === 1) {
      return (
        <g>
          <rect width={w} height={h} fill={fill} fillOpacity={alpha} stroke={stroke} strokeOpacity={lineAlpha} />
          {label(node.name, { vert: vertOf('top') })}
        </g>
      );
    }
    return (
      <g>
        <path
          d={`M0,${tabH} V${h} H${w} V${tabH} H${tabW} M0,${tabH} V0 H${tabW} V${tabH} H0 Z`}
          fill={fill}
          fillOpacity={alpha}
          stroke={stroke}
          strokeOpacity={lineAlpha}
        />
        <foreignObject x={0} y={0} width={tabW} height={tabH}>
          <div
            style={{
              ...labelStyle(alignOf('left'), 'center'),
              padding: '0 5px',
              whiteSpace: 'nowrap',
              display: 'block',
              lineHeight: `${tabH - 2}px`,
              textOverflow: 'ellipsis',
            }}
          >
            {node.name}
          </div>
        </foreignObject>
      </g>
    );
  }

  if (node.nodeType === 'ref') {
    const fill = node.fillColor ?? '#dcebeb';
    return (
      <g>
        <rect width={w} height={h} fill={fill} fillOpacity={alpha} stroke={stroke} strokeOpacity={lineAlpha} />
        <g transform={`translate(${w - 20}, 3)`} color={stroke} style={{ pointerEvents: 'none' }}>
          <g fill="none" stroke="currentColor" strokeWidth="1.1">
            <rect x="3" y="3" width="4.5" height="3.5" />
            <rect x="8.5" y="9" width="4.5" height="3.5" />
            <path d="M5.2 6.5 V10.7 H8.5" />
          </g>
        </g>
        {label(refView?.name ?? '')}
      </g>
    );
  }

  // ---- element nodes -----------------------------------------------------
  const c4Visual = c4ViewType && element ? c4VisualStyleForElement(element, node) : undefined;
  if (c4Visual && element) return c4Figure(element, c4Visual);

  const type = element?.type ?? 'BusinessActor';
  const def = ELEMENT_TYPE_MAP[type];
  const figureType = node.nodeType === 'element' ? (node.figureType ?? 0) : 0;
  const kind = shapeFor(type, figureType);
  const fill = node.fillColor ?? def.fill;
  const common = {
    fill,
    fillOpacity: alpha,
    stroke,
    strokeOpacity: lineAlpha,
  };

  if (kind === 'junction') {
    const r = Math.min(w, h) / 2;
    const or = element?.junctionType === 'or';
    return (
      <g>
        <circle
          cx={w / 2}
          cy={h / 2}
          r={r}
          fill={or ? '#ffffff' : (node.fillColor ?? '#000000')}
          stroke={or ? (node.fillColor ?? '#000000') : 'none'}
          strokeWidth={1.5}
        />
      </g>
    );
  }

  const line = { fill: 'none' as const, stroke, strokeOpacity: lineAlpha };

  let body: ReactNode;
  switch (kind) {
    case 'rounded':
      body = <rect width={w} height={h} rx={10} ry={10} {...common} />;
      break;
    case 'banded':
    case 'contract':
      body = (
        <g>
          <rect width={w} height={h} {...common} />
          <line x1={0} y1={16} x2={w} y2={16} {...line} />
          {kind === 'contract' && <line x1={0} y1={h - 12} x2={w} y2={h - 12} {...line} />}
        </g>
      );
      break;
    case 'product':
      body = (
        <g>
          <rect width={w} height={h} {...common} />
          <path d={`M0,14 H${w / 2} V0`} {...line} />
        </g>
      );
      break;
    case 'artifact': {
      const d = 14;
      body = (
        <g>
          <path d={`M0,0 H${w - d} L${w},${d} V${h} H0 Z`} {...common} />
          <path d={`M${w - d},0 V${d} H${w}`} {...line} />
        </g>
      );
      break;
    }
    case 'grouping':
      body = <rect width={w} height={h} {...common} strokeDasharray="6 3" />;
      break;
    case 'grouping-tab':
      body = (
        <path
          d={`M0,18 V0 H${Math.min(w / 2, 120)} V18 M0,18 V${h} H${w} V18`}
          {...common}
          strokeDasharray="6 3"
        />
      );
      break;
    case 'cylinder': {
      const rx = Math.min(h / 3, 20);
      body = (
        <g>
          <path
            d={`M${rx},0 H${w - rx} A${rx} ${h / 2} 0 0 1 ${w - rx},${h} H${rx} A${rx} ${h / 2} 0 0 1 ${rx},0 Z`}
            {...common}
          />
          <path d={`M${w - rx},0 A${rx} ${h / 2} 0 0 0 ${w - rx},${h}`} {...line} />
        </g>
      );
      break;
    }
    case 'lenses': {
      const lw = w / 2 - 2;
      body = (
        <g>
          <path d={`M${w / 2 - 2},0 A${lw} ${h / 2} 0 0 0 ${w / 2 - 2},${h} Z`} {...common} />
          <path d={`M${w / 2 + 2},${h} A${lw} ${h / 2} 0 0 0 ${w / 2 + 2},0 Z`} {...common} />
        </g>
      );
      break;
    }
    case 'circles': {
      const r = Math.min(w / 3.2, h / 2.2);
      body = (
        <g>
          <ellipse cx={w / 2 - r / 2} cy={h / 2} rx={r} ry={r} {...common} />
          <ellipse cx={w / 2 + r / 2} cy={h / 2} rx={r} ry={r} {...common} />
        </g>
      );
      break;
    }
    case 'lollipop': {
      const r = Math.min(w / 4, h / 3);
      body = (
        <g>
          <line x1={0} y1={h / 2} x2={w - 2 * r} y2={h / 2} {...line} />
          <ellipse cx={w - r} cy={h / 2} rx={r} ry={r} {...common} />
        </g>
      );
      break;
    }
    case 'component': {
      const tabW = Math.min(24, w / 3);
      const bodyX = tabW / 2;
      body = (
        <g>
          <rect
            data-figure-part="component-body"
            x={bodyX}
            y={0}
            width={w - bodyX}
            height={h}
            {...common}
          />
          <rect x={0} y={8} width={tabW} height={6} {...common} />
          <rect x={0} y={20} width={tabW} height={6} {...common} />
        </g>
      );
      break;
    }
    case 'octagon':
    case 'wavy':
    case 'wavy-lined':
    case 'cloud':
    case 'ellipse':
    case 'capsule':
    case 'pennant':
    case 'arrow':
    case 'chevron-banner':
    case 'parallelogram':
    case 'box3d':
    case 'pin':
      body = (
        <g {...common}>
          {shapePath(kind, w, h)}
          {kind === 'wavy-lined' && <line x1={0} y1={14} x2={w} y2={14} {...line} />}
        </g>
      );
      break;
    default:
      body = <rect width={w} height={h} {...common} />;
  }

  // corner icons belong to the default figure; alternate figures are the notation
  const showIcon = figureType !== 1 || !ALT_SHAPES[type];
  return (
    <g>
      {body}
      {showIcon && icon(type)}
      {label(element?.name ?? '')}
    </g>
  );
}
