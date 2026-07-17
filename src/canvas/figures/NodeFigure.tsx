import type { CSSProperties, ReactNode } from 'react';
import {
  c4ElementLabelParts,
  c4VisualStyleForElement,
  type C4ElementLabelParts,
  type C4ViewType,
  type C4VisualStyle,
} from '../../model/c4';
import { ELEMENT_TYPE_MAP, type ElementType } from '../../model/metamodel';
import type { LegendPreferences } from '../../model/legend';
import type { ArchimateElement, DiagramNode, DiagramView, ModelState } from '../../model/types';
import { parseFont } from '../geometry';
import { ARCHI_ICONS, NodeIcon } from './icons';
import { LegendFigure } from './LegendFigure';

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
  imageUrl?: string;
  /** Evaluated label expression. Undefined keeps the native/default label. */
  displayLabel?: string;
  /** Required only for native live legend Notes. */
  model?: ModelState;
  legendPreferences?: LegendPreferences;
}

/** The visual shape + label of one diagram node (position handled by parent <g>). */
export function NodeFigure({
  node,
  element,
  refView,
  width: w,
  height: h,
  c4ViewType,
  imageUrl,
  displayLabel,
  model,
  legendPreferences,
}: FigureProps) {
  const font = node.fontStyle
    ? { family: node.fontStyle.family, sizePx: node.fontStyle.sizePt * (4 / 3), bold: node.fontStyle.bold, italic: node.fontStyle.italic }
    : parseFont(node.font);
  const alpha = (node.alpha ?? 255) / 255;
  const lineAlpha = (node.lineAlpha ?? 255) / 255;
  const defaultFillForLine = node.nodeType === 'element'
    ? ELEMENT_TYPE_MAP[element?.type ?? 'BusinessActor'].fill
    : node.nodeType === 'group'
      ? '#d2d7dd'
      : node.nodeType === 'ref'
        ? '#dcebeb'
        : '#ffffff';
  const derivedStroke = darken(node.fillColor ?? defaultFillForLine);
  const stroke = node.lineStyle === 3
    ? 'none'
    : (node.derivedLineColor ?? true)
      ? derivedStroke
      : node.lineColor ?? DEFAULT_LINE;
  const strokeWidth = node.lineWidth ?? 1;
  const strokeDasharray = node.lineStyle === 1 ? '6 4' : node.lineStyle === 2 ? '2 3' : undefined;
  const fontColor = node.fontColor ?? '#000000';
  const outline = { stroke, strokeOpacity: lineAlpha, strokeWidth, strokeDasharray };
  const gradientId = `gradient-${node.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const gradient = node.gradient ?? -1;
  const gradientVector = gradient === 0
    ? { x1: '0%', y1: '0%', x2: '0%', y2: '115%' }
    : gradient === 1
      ? { x1: '0%', y1: '0%', x2: '115%', y2: '0%' }
      : gradient === 2
        ? { x1: '100%', y1: '0%', x2: '-15%', y2: '0%' }
        : { x1: '0%', y1: '100%', x2: '0%', y2: '-15%' };
  function gradientPaint(fill: string) {
    return gradient >= 0 ? {
      fill: `url(#${gradientId})`,
      opacity: 1,
      definition: (
        <defs>
          <linearGradient id={gradientId} {...gradientVector}>
            <stop offset="0%" stopColor={fill} stopOpacity={alpha} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={alpha} />
          </linearGradient>
        </defs>
      ),
    } : { fill, opacity: alpha, definition: null };
  }
  const imageFigure = (() => {
    if (!imageUrl) return null;
    const position = node.imagePosition ?? (node.nodeType === 'image' ? 9 : 2);
    if (position === 9) {
      return <image href={imageUrl} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />;
    }
    const size = Math.max(1, Math.min(48, w, h));
    const column = position % 3;
    const row = Math.floor(position / 3);
    const x = column === 0 ? 0 : column === 1 ? (w - size) / 2 : w - size;
    const y = row === 0 ? 0 : row === 1 ? (h - size) / 2 : h - size;
    return <image href={imageUrl} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid meet" />;
  })();

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
    opacity: (node.fontAlpha ?? 255) / 255,
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
      <g color={node.iconColor ?? stroke}>
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
    const availableHeight = Math.max(0, h - inset * 2 - extraTop);
    const showDescription = parts.description && availableHeight >= 72;
    return (
      <foreignObject
        x={inset}
        y={inset + extraTop}
        width={Math.max(0, w - inset * 2)}
        height={availableHeight}
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
          <div style={{ fontWeight: 700, maxWidth: '100%', flexShrink: 0 }}>{parts.name}</div>
          <div style={{ fontSize: Math.max(10, font.sizePx - 1), marginTop: 3, maxWidth: '100%', flexShrink: 0 }}>
            {c4ElementTypeLine(parts)}
          </div>
          {showDescription && (
            <div style={{ fontSize: Math.max(10, font.sizePx - 2), marginTop: 6, maxWidth: '100%', minHeight: 0, overflow: 'hidden' }}>
              {parts.description}
            </div>
          )}
        </div>
      </foreignObject>
    );
  }

  function c4BoundaryLabel(parts: C4ElementLabelParts, color: string) {
    const nameSize = Math.max(11, font.sizePx);
    const kindSize = Math.max(9, font.sizePx - 2);
    return (
      <g
        fontFamily={font.family + ', sans-serif'}
        fill={color}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <text x={12} y={h - 12 - kindSize - 4} fontSize={nameSize} fontWeight={700}>
          {parts.name}
        </text>
        <text x={12} y={h - 12} fontSize={kindSize}>
          [{parts.kindLabel}]
        </text>
      </g>
    );
  }

  function c4DatabaseBody(
    fill: string,
    fillOpacity: number,
    c4Stroke: string,
    c4StrokeWidth: number,
    visual: C4VisualStyle,
  ): { body: ReactNode; labelTop: number } {
    const capH = Math.min(24, Math.max(14, h * 0.24));
    return {
      body: (
        <g>
          <path
            data-c4-shape={visual.shape}
            d={`M0,${capH / 2} V${h - capH / 2} C0,${h + capH / 2} ${w},${h + capH / 2} ${w},${h - capH / 2} V${capH / 2} C${w},${capH * 1.5} 0,${capH * 1.5} 0,${capH / 2} Z`}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
          <ellipse
            cx={w / 2}
            cy={capH / 2}
            rx={w / 2}
            ry={capH / 2}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
        </g>
      ),
      labelTop: capH * 1.25,
    };
  }

  function c4PersonBody(
    fill: string,
    fillOpacity: number,
    c4Stroke: string,
    c4StrokeWidth: number,
  ): { body: ReactNode; labelTop: number } {
    const headR = Math.max(10, Math.min(w * 0.16, h * 0.22, 30));
    const boxY = headR * 1.2;
    const bodyHeight = Math.max(0, h - boxY);
    const rx = Math.max(0, Math.min(22, bodyHeight / 3, w / 4));
    return {
      body: (
        <g>
          <rect
            data-c4-shape="person"
            x={0}
            y={boxY}
            width={w}
            height={bodyHeight}
            rx={rx}
            ry={rx}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
          <circle
            data-c4-shape-part="head"
            cx={w / 2}
            cy={headR}
            r={headR}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
        </g>
      ),
      labelTop: headR * 2,
    };
  }

  function c4BrowserBody(
    fill: string,
    fillOpacity: number,
    lineColor: string,
    c4Stroke: string,
    c4StrokeWidth: number,
  ): { body: ReactNode; labelTop: number } {
    const barH = Math.max(14, Math.min(22, h * 0.2));
    const dotR = Math.min(3, barH * 0.16);
    const dotY = barH / 2;
    const dotX = (index: number) => 8 + dotR + index * (dotR * 3);
    const addrX = dotX(2) + dotR * 3;
    const addrH = Math.min(8, barH * 0.4);
    const detailColor = c4Stroke === 'none' ? 'none' : lineColor;
    return {
      body: (
        <g>
          <rect
            data-c4-shape="browser"
            width={w}
            height={h}
            rx={5}
            ry={5}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
          <line x1={0} y1={barH} x2={w} y2={barH} stroke={detailColor} strokeOpacity={lineAlpha} strokeWidth={1} />
          {[0, 1, 2].map((index) => (
            <circle key={index} cx={dotX(index)} cy={dotY} r={dotR} fill={detailColor} fillOpacity={lineAlpha} />
          ))}
          <rect
            x={addrX}
            y={dotY - addrH / 2}
            width={Math.max(0, w - addrX - 8)}
            height={addrH}
            rx={addrH / 2}
            fill="none"
            stroke={detailColor}
            strokeOpacity={lineAlpha}
            strokeWidth={1}
          />
        </g>
      ),
      labelTop: barH,
    };
  }

  function c4FolderBody(
    fill: string,
    fillOpacity: number,
    c4Stroke: string,
    c4StrokeWidth: number,
  ): { body: ReactNode; labelTop: number } {
    const tabW = Math.min(w * 0.35, 90);
    const tabH = Math.max(10, Math.min(18, h * 0.16));
    const slant = Math.min(12, tabH);
    return {
      body: (
        <path
          data-c4-shape="folder"
          d={`M0,${h} L0,0 H${tabW} L${tabW + slant},${tabH} H${w} V${h} Z`}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={c4Stroke}
          strokeOpacity={lineAlpha}
          strokeWidth={c4StrokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinejoin="round"
        />
      ),
      labelTop: tabH,
    };
  }

  function c4BucketBody(
    fill: string,
    fillOpacity: number,
    c4Stroke: string,
    c4StrokeWidth: number,
  ): { body: ReactNode; labelTop: number; labelInset: number } {
    const topRy = Math.max(8, Math.min(14, h * 0.12));
    const inset = Math.min(w * 0.14, 34);
    const botRy = topRy * 0.8;
    const d = `M0,${topRy} L${inset},${h - botRy} C${inset},${h + botRy} ${w - inset},${h + botRy} ${w - inset},${h - botRy} L${w},${topRy} C${w},${topRy * 3} 0,${topRy * 3} 0,${topRy} Z`;
    return {
      body: (
        <g>
          <path
            data-c4-shape="bucket"
            d={d}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
          <ellipse
            cx={w / 2}
            cy={topRy}
            rx={w / 2}
            ry={topRy}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={c4StrokeWidth}
            strokeDasharray={strokeDasharray}
          />
        </g>
      ),
      labelTop: topRy * 2,
      labelInset: 10 + inset / 2,
    };
  }

  function c4TerminalBody(
    fill: string,
    fillOpacity: number,
    lineColor: string,
    c4Stroke: string,
    c4StrokeWidth: number,
  ): ReactNode {
    const detailColor = c4Stroke === 'none' ? 'none' : lineColor;
    return (
      <g>
        <rect
          data-c4-shape="terminal"
          width={w}
          height={h}
          rx={5}
          ry={5}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={c4Stroke}
          strokeOpacity={lineAlpha}
          strokeWidth={c4StrokeWidth}
          strokeDasharray={strokeDasharray}
        />
        <path
          d="M10,10 L15,14 L10,18 M18,18 H25"
          fill="none"
          stroke={detailColor}
          strokeOpacity={lineAlpha}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
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
    const paint = gradientPaint(fill);
    const c4StrokeWidth = node.lineWidth ?? 2;
    const c4Stroke = node.lineStyle === 3 ? 'none' : lineColor;

    if (visual.shape === 'boundary') {
      return (
        <g>
          {paint.definition}
          <rect
            data-c4-shape={visual.shape}
            width={w}
            height={h}
            rx={8}
            ry={8}
            fill={paint.fill}
            fillOpacity={paint.opacity}
            stroke={c4Stroke}
            strokeOpacity={lineAlpha}
            strokeWidth={node.lineWidth ?? 1}
            strokeDasharray={strokeDasharray}
          />
          {displayLabel !== undefined ? label(displayLabel, { align: 'left', vert: 'bottom', inset: 8 }) : c4BoundaryLabel(parts, textColor)}
        </g>
      );
    }

    let body: ReactNode;
    let labelTop = 0;
    let labelInset = 10;
    switch (visual.shape) {
      case 'person':
        ({ body, labelTop } = c4PersonBody(paint.fill, paint.opacity, c4Stroke, c4StrokeWidth));
        break;
      case 'database':
        ({ body, labelTop } = c4DatabaseBody(paint.fill, paint.opacity, c4Stroke, c4StrokeWidth, visual));
        break;
      case 'browser':
        ({ body, labelTop } = c4BrowserBody(paint.fill, paint.opacity, lineColor, c4Stroke, c4StrokeWidth));
        break;
      case 'folder':
        ({ body, labelTop } = c4FolderBody(paint.fill, paint.opacity, c4Stroke, c4StrokeWidth));
        break;
      case 'bucket':
        ({ body, labelTop, labelInset } = c4BucketBody(paint.fill, paint.opacity, c4Stroke, c4StrokeWidth));
        break;
      case 'terminal':
        body = c4TerminalBody(paint.fill, paint.opacity, lineColor, c4Stroke, c4StrokeWidth);
        break;
      default:
        body = (
        <rect
          data-c4-shape={visual.shape}
          width={w}
          height={h}
          rx={5}
          ry={5}
          fill={paint.fill}
          fillOpacity={paint.opacity}
          stroke={c4Stroke}
          strokeOpacity={lineAlpha}
          strokeWidth={c4StrokeWidth}
          strokeDasharray={strokeDasharray}
        />
        );
    }

    return (
      <g>
        {paint.definition}
        {body}
        {displayLabel !== undefined ? label(displayLabel, { inset: labelInset }) : c4StructuredLabel(parts, textColor, labelInset, labelTop)}
      </g>
    );
  }

  // ---- non-element nodes -------------------------------------------------
  if (node.nodeType === 'image') return <g>{imageFigure}</g>;

  if (node.nodeType === 'note') {
    const fill = node.fillColor ?? '#ffffff';
    const paint = gradientPaint(fill);
    if (node.legendOptions && model && legendPreferences) {
      return (
        <g>
          {paint.definition}
          <rect
            width={w}
            height={h}
            fill={paint.fill}
            fillOpacity={paint.opacity}
            {...outline}
          />
          <LegendFigure
            model={model}
            node={node as typeof node & { legendOptions: NonNullable<typeof node.legendOptions> }}
            preferences={legendPreferences}
            font={font}
            color={fontColor}
          />
        </g>
      );
    }
    const border = node.borderType ?? 0;
    return (
      <g>
        {paint.definition}
        {border === 0 ? (
          <path
            d={`M0,0 H${w} V${h - 12} L${w - 12},${h} H0 Z`}
            fill={paint.fill}
            fillOpacity={paint.opacity}
            {...outline}
          />
        ) : (
          <rect
            width={w}
            height={h}
            fill={paint.fill}
            fillOpacity={paint.opacity}
            {...outline}
            stroke={border === 2 ? 'none' : stroke}
          />
        )}
        {imageFigure}
        {label(displayLabel ?? node.content, { align: alignOf('left'), vert: vertOf('top') })}
      </g>
    );
  }

  if (node.nodeType === 'group') {
    const fill = node.fillColor ?? '#d2d7dd';
    const paint = gradientPaint(fill);
    const tabW = Math.min(w / 2, 120);
    const tabH = 18;
    if ((node.borderType ?? 0) === 1) {
      return (
        <g>
          {paint.definition}
          <rect width={w} height={h} fill={paint.fill} fillOpacity={paint.opacity} {...outline} />
          {imageFigure}
          {label(displayLabel ?? node.name, { vert: vertOf('top') })}
        </g>
      );
    }
    return (
      <g>
        {paint.definition}
        <path
          d={`M0,${tabH} V${h} H${w} V${tabH} H${tabW} M0,${tabH} V0 H${tabW} V${tabH} H0 Z`}
          fill={paint.fill}
          fillOpacity={paint.opacity}
          {...outline}
        />
        {imageFigure}
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
            {displayLabel ?? node.name}
          </div>
        </foreignObject>
      </g>
    );
  }

  if (node.nodeType === 'ref') {
    const fill = node.fillColor ?? '#dcebeb';
    const paint = gradientPaint(fill);
    return (
      <g>
        {paint.definition}
        <rect width={w} height={h} fill={paint.fill} fillOpacity={paint.opacity} {...outline} />
        {imageFigure}
        <g transform={`translate(${w - 20}, 3)`} color={stroke} style={{ pointerEvents: 'none' }}>
          <g fill="none" stroke="currentColor" strokeWidth="1.1">
            <rect x="3" y="3" width="4.5" height="3.5" />
            <rect x="8.5" y="9" width="4.5" height="3.5" />
            <path d="M5.2 6.5 V10.7 H8.5" />
          </g>
        </g>
        {label(displayLabel ?? refView?.name ?? '')}
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
  const paint = gradientPaint(fill);
  const common = {
    fill: paint.fill,
    fillOpacity: paint.opacity,
    ...outline,
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
  const notationAllowsIcon = figureType !== 1 || !ALT_SHAPES[type];
  const showIcon = notationAllowsIcon && node.iconVisible !== 2 && (node.iconVisible === 1 || !imageUrl);
  return (
    <g>
      {paint.definition}
      {body}
      {imageFigure}
      {showIcon && icon(type)}
      {label(displayLabel ?? element?.name ?? '')}
    </g>
  );
}

function darken(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return DEFAULT_LINE;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.floor(((value >> shift) & 0xff) * 0.7));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}
