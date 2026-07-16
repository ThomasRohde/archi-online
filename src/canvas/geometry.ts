import type {
  Bendpoint,
  Bounds,
  DiagramConnection,
  ModelState,
} from '../model/types';
import {
  createManhattanRouterState,
  routeManhattanConnection,
  type ManhattanConnectionReservations,
  type ManhattanRouteInput,
  type ManhattanRouteResult,
  type ManhattanRouterState,
} from './manhattan-router';
export {
  createManhattanRouterState,
  routeManhattanConnection,
  type ManhattanConnectionReservations,
  type ManhattanRouteInput,
  type ManhattanRouteResult,
  type ManhattanRouterState,
};
export { createConnectionVisibilityResolver } from '../model/connection-visibility';

export interface Point {
  x: number;
  y: number;
}

export interface ConnectionRouteResolverOptions {
  /** Read a transient connection override, for example a bendpoint drag preview. */
  connection?: (connectionId: string) => DiagramConnection | undefined;
  /** Derived visibility. Hidden dependencies make their dependents unroutable. */
  isVisible?: (connectionId: string) => boolean;
  /** Prefer horizontal or vertical node attachment points, falling back to corners. */
  orthogonalAnchors?: boolean;
}

export interface ConnectionRouteResolver {
  (connectionId: string): Point[] | undefined;
  endpointPoints(connectionId: string): { source: Point; target: Point } | undefined;
}

/**
 * Build one route projection for a model snapshot. Routes are memoized and
 * recursively resolve connection endpoints through the midpoint of the
 * referenced routed polyline. A corrupt dependency cycle resolves to
 * `undefined` instead of recursing forever.
 */
export function createConnectionRouteResolver(
  model: ModelState,
  nodeBounds: ReadonlyMap<string, Bounds>,
  options: ConnectionRouteResolverOptions = {},
): ConnectionRouteResolver {
  const cache = new Map<string, Point[] | undefined>();
  const resolving = new Set<string>();
  const manhattanState = new Map<string, ManhattanRouterState>();
  const connection = (id: string) => options.connection?.(id) ?? model.connections[id];
  const anchor = options.orthogonalAnchors ? orthogonalRectAnchor : rectAnchor;

  const connectableGeometry = (
    id: string,
  ): { point: Point; bounds?: Bounds } | undefined => {
    const bounds = nodeBounds.get(id);
    if (model.nodes[id] && bounds) return { point: center(bounds), bounds };
    if (!model.connections[id]) return undefined;
    const route = resolve(id);
    return route
      ? { point: pointAlong(route, 0.5).point, bounds: pointsBounds(route) }
      : undefined;
  };

  const endpointGeometries = (connectionId: string) => {
    const conn = connection(connectionId);
    if (!conn) return undefined;
    const source = connectableGeometry(conn.sourceId);
    const target = connectableGeometry(conn.targetId);
    return source && target ? { source, target } : undefined;
  };

  const endpointPoints = (
    connectionId: string,
  ): { source: Point; target: Point } | undefined => {
    const endpoints = endpointGeometries(connectionId);
    return endpoints
      ? { source: endpoints.source.point, target: endpoints.target.point }
      : undefined;
  };

  const resolve = ((connectionId: string): Point[] | undefined => {
    if (cache.has(connectionId)) return cache.get(connectionId);
    if (resolving.has(connectionId)) return undefined;
    const conn = connection(connectionId);
    if (!conn || (options.isVisible && !options.isVisible(connectionId))) {
      cache.set(connectionId, undefined);
      return undefined;
    }

    resolving.add(connectionId);
    const endpointGeometry = endpointGeometries(connectionId);
    const endpoints = endpointGeometry
      ? { source: endpointGeometry.source.point, target: endpointGeometry.target.point }
      : undefined;
    if (!endpoints) {
      resolving.delete(connectionId);
      cache.set(connectionId, undefined);
      return undefined;
    }

    const sourceBounds = model.nodes[conn.sourceId] ? nodeBounds.get(conn.sourceId) : undefined;
    const targetBounds = model.nodes[conn.targetId] ? nodeBounds.get(conn.targetId) : undefined;
    let route: Point[];
    if ((model.views[conn.viewId]?.connectionRouterType ?? 0) === 2) {
      const source = sourceBounds
        ? anchor(sourceBounds, endpoints.target)
        : endpoints.source;
      const target = targetBounds
        ? anchor(targetBounds, endpoints.source)
        : endpoints.target;
      const result = routeManhattanConnection(
        {
          connectionId: conn.id,
          start: source,
          end: target,
          sourceBounds: endpointGeometry?.source.bounds,
          targetBounds: endpointGeometry?.target.bounds,
        },
        manhattanState.get(conn.viewId) ?? createManhattanRouterState(),
      );
      manhattanState.set(conn.viewId, result.state);
      route = result.points;
    } else if (
      sourceBounds &&
      targetBounds &&
      conn.sourceId === conn.targetId &&
      conn.bendpoints.length === 0
    ) {
      route = connectionPolyline(sourceBounds, targetBounds, conn.bendpoints);
    } else {
      const mids = bendpointPositions(conn.bendpoints, endpoints.source, endpoints.target);
      const source = sourceBounds
        ? anchor(sourceBounds, mids[0] ?? endpoints.target)
        : endpoints.source;
      const target = targetBounds
        ? anchor(targetBounds, mids[mids.length - 1] ?? endpoints.source)
        : endpoints.target;
      route = [source, ...mids, target];
    }
    resolving.delete(connectionId);
    cache.set(connectionId, route);
    return route;
  }) as ConnectionRouteResolver;
  resolve.endpointPoints = endpointPoints;
  // Draw2D owns one Manhattan router per connection layer. Pre-warming in a
  // stable dependency-first order makes row/column reservations independent
  // of which projection asks for a route first.
  for (const connectionId of Object.keys(model.connections)) resolve(connectionId);
  return resolve;
}

function center(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function pointsBounds(points: Point[]): Bounds | undefined {
  if (points.length === 0) return undefined;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Absolute positions of a connection's bendpoints, GEF-style:
 * pos = (1-w)·(srcCenter + start) + w·(tgtCenter + end), w = (i+1)/(n+1).
 * Matches how desktop Archi renders relative bendpoints.
 */
export function bendpointPositions(
  bendpoints: Bendpoint[],
  srcCenter: Point,
  tgtCenter: Point,
): Point[] {
  const n = bendpoints.length;
  return bendpoints.map((bp, i) => {
    const w = (i + 1) / (n + 1);
    return {
      x: (1 - w) * (srcCenter.x + bp.startX) + w * (tgtCenter.x + bp.endX),
      y: (1 - w) * (srcCenter.y + bp.startY) + w * (tgtCenter.y + bp.endY),
    };
  });
}

/** Convert an absolute bendpoint position back to Archi's relative form. */
export function toRelativeBendpoint(pos: Point, srcCenter: Point, tgtCenter: Point): Bendpoint {
  return {
    startX: Math.round(pos.x - srcCenter.x),
    startY: Math.round(pos.y - srcCenter.y),
    endX: Math.round(pos.x - tgtCenter.x),
    endY: Math.round(pos.y - tgtCenter.y),
  };
}

/**
 * Intersection of the segment center→toward with the border of rect.
 * Falls back to the center when the target lies inside the rect.
 */
export function rectAnchor(rect: Bounds, toward: Point): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  // scale factor to reach the border along (dx, dy)
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  if (s >= 1) return { x: cx, y: cy }; // toward is inside the rect
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * Desktop-style orthogonal node anchor. A vertically or horizontally aligned
 * approach keeps that axis; a diagonal approach terminates on a corner.
 * Points inside the bounds use the radial fallback for overlapping figures.
 */
export function orthogonalRectAnchor(rect: Bounds, toward: Point): Point {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const withinX = toward.x >= rect.x && toward.x <= right;
  const withinY = toward.y >= rect.y && toward.y <= bottom;

  if (withinX && withinY) return rectAnchor(rect, toward);
  if (withinX) {
    return { x: toward.x, y: toward.y < rect.y ? rect.y : bottom };
  }
  if (withinY) {
    return { x: toward.x < rect.x ? rect.x : right, y: toward.y };
  }
  return {
    x: toward.x < rect.x ? rect.x : right,
    y: toward.y < rect.y ? rect.y : bottom,
  };
}

/** Full polyline of a connection in absolute view coordinates. */
export function connectionPolyline(
  srcBounds: Bounds,
  tgtBounds: Bounds,
  bendpoints: Bendpoint[],
): Point[] {
  const srcCenter = { x: srcBounds.x + srcBounds.width / 2, y: srcBounds.y + srcBounds.height / 2 };
  const tgtCenter = { x: tgtBounds.x + tgtBounds.width / 2, y: tgtBounds.y + tgtBounds.height / 2 };

  if (
    srcBounds.x === tgtBounds.x &&
    srcBounds.y === tgtBounds.y &&
    srcBounds.width === tgtBounds.width &&
    bendpoints.length === 0
  ) {
    // self-connection: loop on the right side
    const r = { x: srcBounds.x + srcBounds.width, y: srcCenter.y };
    return [
      { x: r.x, y: r.y - 10 },
      { x: r.x + 30, y: r.y - 10 },
      { x: r.x + 30, y: r.y + 10 },
      { x: r.x, y: r.y + 10 },
    ];
  }

  const mids = bendpointPositions(bendpoints, srcCenter, tgtCenter);
  const start = rectAnchor(srcBounds, mids[0] ?? tgtCenter);
  const end = rectAnchor(tgtBounds, mids[mids.length - 1] ?? srcCenter);
  return [start, ...mids, end];
}

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Point at fraction t (0..1) along a polyline, with the segment angle in radians. */
export function pointAlong(points: Point[], t: number): { point: Point; angle: number } {
  const total = polylineLength(points);
  let remaining = total * Math.min(1, Math.max(0, t));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg || i === points.length - 1) {
      const f = seg === 0 ? 0 : remaining / seg;
      return {
        point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remaining -= seg;
  }
  return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
}

/** Distance from point p to segment ab. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/** Index of the segment of the polyline closest to p (for bendpoint insertion). */
export function closestSegment(points: Point[], p: Point): { index: number; dist: number } {
  let best = { index: 0, dist: Infinity };
  for (let i = 1; i < points.length; i++) {
    const d = distToSegment(p, points[i - 1], points[i]);
    if (d < best.dist) best = { index: i - 1, dist: d };
  }
  return best;
}

export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectContains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function pointInRect(p: Point, r: Bounds): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Parse Archi's SWT font string: "1|Arial|8.0|1|WINDOWS|1|..." */
export function parseFont(font: string | undefined): {
  family: string;
  sizePx: number;
  bold: boolean;
  italic: boolean;
} {
  if (font) {
    const parts = font.split('|');
    if (parts.length >= 4) {
      const sizePt = parseFloat(parts[2]) || 9;
      const style = parseInt(parts[3], 10) || 0;
      return {
        family: parts[1] || 'Segoe UI',
        sizePx: Math.round((sizePt * 4) / 3),
        bold: (style & 1) !== 0,
        italic: (style & 2) !== 0,
      };
    }
  }
  return { family: 'Segoe UI', sizePx: 12, bold: false, italic: false };
}
