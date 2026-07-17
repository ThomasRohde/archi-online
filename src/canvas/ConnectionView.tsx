import { memo, type ReactNode } from 'react';
import {
  C4_VISUAL_DEFAULTS,
  c4RelationshipLabelParts,
  type C4RelationshipLabelParts,
  type C4ViewType,
} from '../model/c4';
import type { ArchimateRelationship, DiagramConnection } from '../model/types';
import { PLAIN_CONNECTION_TYPE } from '../model/types';
import { parseFont, pointAlong, type Point } from './geometry';
import { GHOST_OPACITY } from './view-editor/viewpoint-ghost';
import type { ReconnectFeedbackTone } from './view-editor/reconnect-intent';

const DEFAULT_LINE = '#5c5c5c';

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Filled/hollow triangle arrowhead sitting with its tip on `p`. */
function Triangle({ p, angle, color, hollow, size = 10 }: { p: Point; angle: number; color: string; hollow?: boolean; size?: number }) {
  return (
    <path
      d={`M0,0 L${-size},${size * 0.45} L${-size},${-size * 0.45} Z`}
      transform={`translate(${p.x},${p.y}) rotate(${deg(angle)})`}
      fill={hollow ? '#ffffff' : color}
      stroke={color}
      strokeWidth={1.2}
    />
  );
}

/** Open (two-line) arrowhead at `p`. */
function OpenArrow({ p, angle, color, size = 9 }: { p: Point; angle: number; color: string; size?: number }) {
  return (
    <path
      d={`M${-size},${size * 0.5} L0,0 L${-size},${-size * 0.5}`}
      transform={`translate(${p.x},${p.y}) rotate(${deg(angle)})`}
      fill="none"
      stroke={color}
      strokeWidth={1.2}
    />
  );
}

/** Diamond with its outer tip on `p`, pointing along angle. */
function Diamond({ p, angle, color, hollow }: { p: Point; angle: number; color: string; hollow?: boolean }) {
  const l = 14;
  const hw = 4.5;
  return (
    <path
      d={`M0,0 L${l / 2},${hw} L${l},0 L${l / 2},${-hw} Z`}
      transform={`translate(${p.x},${p.y}) rotate(${deg(angle)})`}
      fill={hollow ? '#ffffff' : color}
      stroke={color}
      strokeWidth={1.2}
    />
  );
}

interface ConnStyle {
  dash?: string;
  decorations: (points: Point[], color: string) => ReactNode;
}

function endAngles(points: Point[]) {
  const n = points.length;
  const startAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const endAngle = Math.atan2(points[n - 1].y - points[n - 2].y, points[n - 1].x - points[n - 2].x);
  return { start: points[0], end: points[n - 1], startAngle, endAngle };
}

function styleFor(rel: ArchimateRelationship | undefined): ConnStyle {
  const type = rel?.type;
  switch (type) {
    case 'CompositionRelationship':
      return {
        decorations: (pts, c) => {
          const { start, startAngle } = endAngles(pts);
          return <Diamond p={start} angle={startAngle} color={c} />;
        },
      };
    case 'AggregationRelationship':
      return {
        decorations: (pts, c) => {
          const { start, startAngle } = endAngles(pts);
          return <Diamond p={start} angle={startAngle} color={c} hollow />;
        },
      };
    case 'AssignmentRelationship':
      return {
        decorations: (pts, c) => {
          const { start, end, endAngle } = endAngles(pts);
          return (
            <g>
              <circle cx={start.x} cy={start.y} r={3} fill={c} />
              <Triangle p={end} angle={endAngle} color={c} size={9} />
            </g>
          );
        },
      };
    case 'RealizationRelationship':
      return {
        dash: '2 3',
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <Triangle p={end} angle={endAngle} color={c} hollow />;
        },
      };
    case 'SpecializationRelationship':
      return {
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <Triangle p={end} angle={endAngle} color={c} hollow />;
        },
      };
    case 'ServingRelationship':
      return {
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <OpenArrow p={end} angle={endAngle} color={c} />;
        },
      };
    case 'AccessRelationship': {
      const accessType = rel?.accessType ?? 0;
      return {
        dash: '2 3',
        decorations: (pts, c) => {
          const { start, end, startAngle, endAngle } = endAngles(pts);
          return (
            <g>
              {(accessType === 0 || accessType === 3) && (
                <OpenArrow p={end} angle={endAngle} color={c} size={7} />
              )}
              {(accessType === 1 || accessType === 3) && (
                <OpenArrow p={start} angle={startAngle + Math.PI} color={c} size={7} />
              )}
            </g>
          );
        },
      };
    }
    case 'InfluenceRelationship':
      return {
        dash: '6 4',
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <OpenArrow p={end} angle={endAngle} color={c} />;
        },
      };
    case 'TriggeringRelationship':
      return {
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <Triangle p={end} angle={endAngle} color={c} size={9} />;
        },
      };
    case 'FlowRelationship':
      return {
        dash: '6 4',
        decorations: (pts, c) => {
          const { end, endAngle } = endAngles(pts);
          return <Triangle p={end} angle={endAngle} color={c} size={9} />;
        },
      };
    case 'AssociationRelationship':
      return {
        decorations: (pts, c) => {
          if (!rel?.directed) return null;
          const { end, endAngle } = endAngles(pts);
          return (
            <path
              d={`M-9,-4.5 L0,0`}
              transform={`translate(${end.x},${end.y}) rotate(${deg(endAngle)})`}
              fill="none"
              stroke={c}
              strokeWidth={1.2}
            />
          );
        },
      };
    default:
      return { decorations: () => null };
  }
}

function plainStyleFor(connectionType: number): ConnStyle {
  const dash = (connectionType & PLAIN_CONNECTION_TYPE.DASHED) !== 0
    ? '4'
    : (connectionType & PLAIN_CONNECTION_TYPE.DOTTED) !== 0
      ? '1 4'
      : undefined;
  return {
    dash,
    decorations: (points, color) => {
      const { start, end, startAngle, endAngle } = endAngles(points);
      let source: ReactNode = null;
      let target: ReactNode = null;
      if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_FILLED) !== 0) {
        source = <Triangle p={start} angle={startAngle + Math.PI} color={color} />;
      } else if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_OPEN) !== 0) {
        source = <OpenArrow p={start} angle={startAngle + Math.PI} color={color} />;
      } else if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW) !== 0) {
        source = <Triangle p={start} angle={startAngle + Math.PI} color={color} hollow />;
      }
      if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_FILLED) !== 0) {
        target = <Triangle p={end} angle={endAngle} color={color} />;
      } else if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_OPEN) !== 0) {
        target = <OpenArrow p={end} angle={endAngle} color={color} />;
      } else if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_HOLLOW) !== 0) {
        target = <Triangle p={end} angle={endAngle} color={color} hollow />;
      }
      const sourceMarker: string | undefined = source ? (
        (connectionType & PLAIN_CONNECTION_TYPE.SOURCE_FILLED) !== 0
          ? 'source-filled'
          : (connectionType & PLAIN_CONNECTION_TYPE.SOURCE_OPEN) !== 0
            ? 'source-open'
            : 'source-hollow'
      ) : undefined;
      const targetMarker: string | undefined = target ? (
        (connectionType & PLAIN_CONNECTION_TYPE.TARGET_FILLED) !== 0
          ? 'target-filled'
          : (connectionType & PLAIN_CONNECTION_TYPE.TARGET_OPEN) !== 0
            ? 'target-open'
            : 'target-hollow'
      ) : undefined;
      return (
        <g>
          {source && <g data-plain-arrow={sourceMarker}>{source}</g>}
          {target && <g data-plain-arrow={targetMarker}>{target}</g>}
        </g>
      );
    },
  };
}

function appearanceDash(lineStyle: DiagramConnection['lineStyle'], nativeDash: string | undefined) {
  if (lineStyle === 0) return undefined;
  if (lineStyle === 1) return '6 4';
  if (lineStyle === 2) return '2 3';
  return nativeDash;
}

function c4StyleFor(): ConnStyle {
  return {
    dash: '6 4',
    decorations: (pts, c) => {
      const { end, endAngle } = endAngles(pts);
      return <Triangle p={end} angle={endAngle} color={c} size={9} />;
    },
  };
}

function c4RelationshipIntentLine(parts: C4RelationshipLabelParts): string {
  return parts.order && parts.label ? `${parts.order}. ${parts.label}` : parts.label;
}

export interface ConnectionViewProps {
  conn: DiagramConnection;
  rel: ArchimateRelationship | undefined;
  points: Point[];
  selected: boolean;
  c4ViewType?: C4ViewType;
  /** Dim the connection because an endpoint element is outside the viewpoint. */
  ghosted?: boolean;
  displayLabel?: string;
  interactionTone?: ReconnectFeedbackTone;
}

function ConnectionViewComponent({
  conn,
  rel,
  points,
  selected,
  c4ViewType,
  ghosted,
  displayLabel,
  interactionTone,
}: ConnectionViewProps) {
  if (points.length < 2) return null;
  const isC4Relationship = !!c4ViewType && !!rel;
  const color = conn.lineColor ?? (isC4Relationship ? C4_VISUAL_DEFAULTS.relationshipLine : DEFAULT_LINE);
  const nativeStyle = isC4Relationship
    ? c4StyleFor()
    : rel
      ? styleFor(rel)
      : plainStyleFor(conn.connectionType ?? 0);
  const style = {
    ...nativeStyle,
    // Appearance lineStyle is an explicit Online override. Native type bits
    // remain persisted and render when appearance is Default/unspecified.
    dash: appearanceDash(conn.lineStyle, nativeStyle.dash),
  };
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  let labelLines: string[];
  if (conn.nameVisible === false) {
    labelLines = [];
  } else if (displayLabel !== undefined) {
    labelLines = displayLabel.split(/\r?\n/).filter(Boolean);
  } else if (rel && isC4Relationship) {
    const parts = c4RelationshipLabelParts(rel);
    labelLines = [
      c4RelationshipIntentLine(parts),
      parts.technology ? `[${parts.technology}]` : '',
    ].filter(Boolean);
  } else if (rel) {
    let labelText = rel.name;
    if (rel.type === 'InfluenceRelationship' && rel.strength) {
      labelText = labelText ? `${labelText} [${rel.strength}]` : `[${rel.strength}]`;
    }
    labelLines = labelText.split(/\r?\n/).filter(Boolean);
  } else {
    labelLines = conn.name.split(/\r?\n/).filter(Boolean);
  }
  const font = conn.fontStyle
    ? { family: conn.fontStyle.family, sizePx: conn.fontStyle.sizePt * (4 / 3), bold: conn.fontStyle.bold, italic: conn.fontStyle.italic }
    : parseFont(conn.font);
  const t = conn.textPosition === 0 ? 0.15 : conn.textPosition === 2 ? 0.85 : 0.5;
  const mid = pointAlong(points, t).point;
  const labelColor = conn.fontColor ?? (isC4Relationship ? C4_VISUAL_DEFAULTS.relationshipText : '#000000');
  const interactionColor =
    interactionTone === 'anchor'
      ? 'var(--canvas-anchor)'
      : interactionTone === 'valid'
        ? 'var(--canvas-valid)'
        : interactionTone === 'invalid'
          ? 'var(--canvas-invalid)'
          : undefined;
  const displayColor = interactionColor ?? (selected ? 'var(--canvas-selection)' : color);
  const showLine = conn.lineStyle !== 3 || interactionTone !== undefined;

  return (
    <g
      data-conn-id={conn.id}
      opacity={ghosted && !selected ? GHOST_OPACITY : undefined}
      data-ghosted={ghosted && !selected ? 'true' : undefined}
    >
      {/* fat invisible path for easy clicking */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={d}
        data-c4-relationship={isC4Relationship ? 'true' : undefined}
        fill="none"
        stroke={showLine ? displayColor : 'none'}
        strokeWidth={(conn.lineWidth ?? 1) * (selected || interactionTone ? 1.6 : 1)}
        strokeDasharray={style.dash}
      />
      {showLine && style.decorations(points, displayColor)}
      {labelLines.length > 0 && (
        <text
          x={mid.x}
          y={mid.y - 4 - (labelLines.length - 1) * font.sizePx * 0.55}
          textAnchor="middle"
          fontFamily={font.family + ', sans-serif'}
          fontSize={font.sizePx}
          fontWeight={font.bold ? 700 : 400}
          fontStyle={font.italic ? 'italic' : 'normal'}
          fill={labelColor}
          opacity={(conn.fontAlpha ?? 255) / 255}
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth={3}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {labelLines.map((line, index) => (
            <tspan key={index} x={mid.x} dy={index === 0 ? 0 : '1.25em'}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

export const ConnectionView = memo(ConnectionViewComponent);
