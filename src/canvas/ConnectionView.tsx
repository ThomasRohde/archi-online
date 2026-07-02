import type { ReactNode } from 'react';
import type { ArchimateRelationship, DiagramConnection } from '../model/types';
import { parseFont, pointAlong, type Point } from './geometry';

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
      // plain (note) connection: dotted line, no decoration
      return { dash: type ? undefined : '4 3', decorations: () => null };
  }
}

export interface ConnectionViewProps {
  conn: DiagramConnection;
  rel: ArchimateRelationship | undefined;
  points: Point[];
  selected: boolean;
}

export function ConnectionView({ conn, rel, points, selected }: ConnectionViewProps) {
  if (points.length < 2) return null;
  const color = conn.lineColor ?? DEFAULT_LINE;
  const style = styleFor(rel);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  let labelText = rel?.name ?? '';
  if (rel?.type === 'InfluenceRelationship' && rel.strength) {
    labelText = labelText ? `${labelText} [${rel.strength}]` : `[${rel.strength}]`;
  }
  const font = parseFont(conn.font);
  const t = conn.textPosition === 0 ? 0.15 : conn.textPosition === 2 ? 0.85 : 0.5;
  const mid = pointAlong(points, t).point;

  return (
    <g data-conn-id={conn.id}>
      {/* fat invisible path for easy clicking */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={d}
        fill="none"
        stroke={selected ? '#2a6cc4' : color}
        strokeWidth={(conn.lineWidth ?? 1) * (selected ? 1.6 : 1)}
        strokeDasharray={style.dash}
      />
      {style.decorations(points, selected ? '#2a6cc4' : color)}
      {labelText && (
        <text
          x={mid.x}
          y={mid.y - 4}
          textAnchor="middle"
          fontFamily={font.family + ', sans-serif'}
          fontSize={font.sizePx}
          fontWeight={font.bold ? 700 : 400}
          fontStyle={font.italic ? 'italic' : 'normal'}
          fill={conn.fontColor ?? '#000000'}
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth={3}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {labelText}
        </text>
      )}
    </g>
  );
}
