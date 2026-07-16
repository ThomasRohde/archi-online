import type { Bendpoint, Bounds, DiagramConnection } from '../../model/types';
import {
  bendpointPositions,
  toRelativeBendpoint,
  type Point,
} from '../geometry';

const CONTROL_OFFSET = 12;
const REUSE_DISTANCE = 24;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

type Side = (typeof SIDES)[number];

export interface ConnectionAnchorEditInput {
  connection: DiagramConnection;
  end: 'source' | 'target';
  dropPoint: Point;
  nodeBounds: ReadonlyMap<string, Bounds>;
  endpointPoints: { source: Point; target: Point };
  currentRoute: readonly Point[];
  orthogonalAnchors: boolean;
}

function center(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function boundarySides(bounds: Bounds, point: Point): Side[] {
  const sides: Side[] = [];
  if (point.y === bounds.y) sides.push('top');
  if (point.x === bounds.x + bounds.width) sides.push('right');
  if (point.y === bounds.y + bounds.height) sides.push('bottom');
  if (point.x === bounds.x) sides.push('left');
  return sides;
}

function projectToBoundary(bounds: Bounds, point: Point, currentAnchor: Point): Point {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const x = Math.min(right, Math.max(bounds.x, point.x));
  const y = Math.min(bottom, Math.max(bounds.y, point.y));
  const outsideX = point.x < bounds.x || point.x > right;
  const outsideY = point.y < bounds.y || point.y > bottom;
  if (outsideX || outsideY) return { x, y };

  const distance: Record<Side, number> = {
    top: point.y - bounds.y,
    right: right - point.x,
    bottom: bottom - point.y,
    left: point.x - bounds.x,
  };
  const minimum = Math.min(...Object.values(distance));
  const candidates = SIDES.filter((side) => distance[side] === minimum);
  const currentSide = boundarySides(bounds, currentAnchor).find((side) => candidates.includes(side));
  const side = currentSide ?? candidates[0];
  switch (side) {
    case 'top': return { x: point.x, y: bounds.y };
    case 'right': return { x: right, y: point.y };
    case 'bottom': return { x: point.x, y: bottom };
    case 'left': return { x: bounds.x, y: point.y };
  }
}

function controlPoint(bounds: Bounds, anchor: Point, orthogonal: boolean): Point | null {
  const sides = boundarySides(bounds, anchor);
  if (sides.length === 0) return null;
  if (orthogonal) {
    const dx = sides.includes('left') ? -1 : sides.includes('right') ? 1 : 0;
    const dy = sides.includes('top') ? -1 : sides.includes('bottom') ? 1 : 0;
    return { x: anchor.x + dx * CONTROL_OFFSET, y: anchor.y + dy * CONTROL_OFFSET };
  }

  const origin = center(bounds);
  const dx = anchor.x - origin.x;
  const dy = anchor.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return {
    x: anchor.x + (dx / length) * CONTROL_OFFSET,
    y: anchor.y + (dy / length) * CONTROL_OFFSET,
  };
}

function distanceToBounds(point: Point, bounds: Bounds): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - bounds.x - bounds.width);
  const dy = Math.max(bounds.y - point.y, 0, point.y - bounds.y - bounds.height);
  return Math.hypot(dx, dy);
}

export function planConnectionAnchorBendpoints({
  connection,
  end,
  dropPoint,
  nodeBounds,
  endpointPoints,
  currentRoute,
  orthogonalAnchors,
}: ConnectionAnchorEditInput): Bendpoint[] | null {
  if (currentRoute.length < 2) return null;
  const endpointId = end === 'source' ? connection.sourceId : connection.targetId;
  const endpointBounds = nodeBounds.get(endpointId);
  if (!endpointBounds) return null;

  const currentAnchor = end === 'source' ? currentRoute[0] : currentRoute[currentRoute.length - 1];
  const anchor = projectToBoundary(endpointBounds, dropPoint, currentAnchor);
  const control = controlPoint(endpointBounds, anchor, orthogonalAnchors);
  if (!control) return null;

  const absolute = bendpointPositions(
    connection.bendpoints,
    endpointPoints.source,
    endpointPoints.target,
  );
  if (absolute.length === 0) {
    const oppositeId = end === 'source' ? connection.targetId : connection.sourceId;
    const oppositeBounds = nodeBounds.get(oppositeId);
    const oppositeAnchor = end === 'source'
      ? currentRoute[currentRoute.length - 1]
      : currentRoute[0];
    const stabilizer = oppositeBounds
      ? controlPoint(oppositeBounds, oppositeAnchor, orthogonalAnchors)
      : null;
    if (end === 'source') absolute.push(control, ...(stabilizer ? [stabilizer] : []));
    else absolute.push(...(stabilizer ? [stabilizer] : []), control);
  } else {
    const index = end === 'source' ? 0 : absolute.length - 1;
    if (distanceToBounds(absolute[index], endpointBounds) <= REUSE_DISTANCE) {
      absolute[index] = control;
    } else if (end === 'source') {
      absolute.unshift(control);
    } else {
      absolute.push(control);
    }
  }

  return absolute.map((point) =>
    toRelativeBendpoint(point, endpointPoints.source, endpointPoints.target));
}
