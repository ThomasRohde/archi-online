import type { CSSProperties, ReactNode } from 'react';
import { ELEMENT_TYPE_MAP, type ElementType } from '../../model/metamodel';
import type { ArchimateElement, DiagramNode, DiagramView } from '../../model/types';
import { parseFont } from '../geometry';
import { ICONS } from './icons';

const DEFAULT_LINE = '#5c5c5c';

type ShapeKind =
  | 'rect'
  | 'rounded'
  | 'octagon'
  | 'banded'
  | 'product'
  | 'artifact'
  | 'wavy'
  | 'cloud'
  | 'ellipse'
  | 'junction'
  | 'grouping';

function shapeFor(type: ElementType): ShapeKind {
  switch (type) {
    case 'BusinessProcess':
    case 'BusinessFunction':
    case 'BusinessInteraction':
    case 'BusinessEvent':
    case 'BusinessService':
    case 'ApplicationFunction':
    case 'ApplicationInteraction':
    case 'ApplicationProcess':
    case 'ApplicationEvent':
    case 'ApplicationService':
    case 'TechnologyFunction':
    case 'TechnologyProcess':
    case 'TechnologyInteraction':
    case 'TechnologyEvent':
    case 'TechnologyService':
    case 'ImplementationEvent':
      return 'rounded';
    case 'BusinessObject':
    case 'DataObject':
    case 'Contract':
      return 'banded';
    case 'Product':
      return 'product';
    case 'Artifact':
      return 'artifact';
    case 'Representation':
    case 'Deliverable':
      return 'wavy';
    case 'Meaning':
      return 'cloud';
    case 'Value':
      return 'ellipse';
    case 'Junction':
      return 'junction';
    case 'Grouping':
      return 'grouping';
    case 'Stakeholder':
    case 'Driver':
    case 'Assessment':
    case 'Goal':
    case 'Outcome':
    case 'Principle':
    case 'Requirement':
    case 'Constraint':
      return 'octagon';
    default:
      return 'rect';
  }
}

function shapePath(kind: ShapeKind, w: number, h: number): ReactNode | null {
  switch (kind) {
    case 'octagon': {
      const c = 12;
      return (
        <polygon
          points={`${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`}
        />
      );
    }
    case 'wavy':
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
}

/** The visual shape + label of one diagram node (position handled by parent <g>). */
export function NodeFigure({ node, element, refView, width: w, height: h }: FigureProps) {
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
    node.textAlignment === 1 ? 'left' : node.textAlignment === 4 ? 'right' : def;
  const vertOf = (def: 'top' | 'center' | 'bottom' = 'top') =>
    node.textPosition === 1 ? 'center' : node.textPosition === 2 ? 'bottom' : def;

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
    const glyph = ICONS[type];
    if (!glyph || w < 40) return null;
    return (
      <g
        transform={`translate(${w - 20}, 3)`}
        color={stroke}
        opacity={0.9}
        style={{ pointerEvents: 'none' }}
      >
        {glyph}
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
        {label(node.content, { align: alignOf('left'), vert: 'top' })}
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
          {label(node.name, { vert: 'top' })}
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
  const type = element?.type ?? 'BusinessActor';
  const def = ELEMENT_TYPE_MAP[type];
  const kind = shapeFor(type);
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

  let body: ReactNode;
  switch (kind) {
    case 'rounded':
      body = <rect width={w} height={h} rx={10} ry={10} {...common} />;
      break;
    case 'banded':
      body = (
        <g>
          <rect width={w} height={h} {...common} />
          <line x1={0} y1={16} x2={w} y2={16} stroke={stroke} strokeOpacity={lineAlpha} />
          {type === 'Contract' && (
            <line x1={0} y1={h - 12} x2={w} y2={h - 12} stroke={stroke} strokeOpacity={lineAlpha} />
          )}
        </g>
      );
      break;
    case 'product':
      body = (
        <g>
          <rect width={w} height={h} {...common} />
          <path d={`M0,14 H${w / 2} V0`} fill="none" stroke={stroke} strokeOpacity={lineAlpha} />
        </g>
      );
      break;
    case 'artifact': {
      const d = 14;
      body = (
        <g>
          <path d={`M0,0 H${w - d} L${w},${d} V${h} H0 Z`} {...common} />
          <path d={`M${w - d},0 V${d} H${w}`} fill="none" stroke={stroke} strokeOpacity={lineAlpha} />
        </g>
      );
      break;
    }
    case 'grouping':
      body = (
        <g>
          <path
            d={`M0,18 V0 H${Math.min(w / 2, 120)} V18 M0,18 V${h} H${w} V18`}
            {...common}
            strokeDasharray="6 3"
          />
        </g>
      );
      break;
    case 'octagon':
    case 'wavy':
    case 'cloud':
    case 'ellipse':
      body = <g {...common}>{shapePath(kind, w, h)}</g>;
      break;
    default:
      body = <rect width={w} height={h} {...common} />;
  }

  const showIcon = kind !== 'cloud' && kind !== 'ellipse';
  const banded = kind === 'banded' || kind === 'product';
  return (
    <g>
      {body}
      {showIcon && icon(type)}
      {banded
        ? label(element?.name ?? '', { inset: 0, vert: 'top', align: 'center' })
        : label(element?.name ?? '')}
    </g>
  );
}
