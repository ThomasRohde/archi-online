import type { Bendpoint, Bounds } from '../model/types';

export interface Point {
  x: number;
  y: number;
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
