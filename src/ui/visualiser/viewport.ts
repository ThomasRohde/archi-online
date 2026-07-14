import type { VisualiserBounds, VisualiserPoint } from './presentation';

export interface VisualiserViewport {
  zoom: number;
  x: number;
  y: number;
}

export interface VisualiserViewportSize {
  width: number;
  height: number;
}

export const VISUALISER_MIN_ZOOM = 0.2;
export const VISUALISER_MAX_ZOOM = 4;
export const VISUALISER_FIT_MAX_ZOOM = 1.5;
export const VISUALISER_FIT_PADDING = 32;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clean(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function clampVisualiserZoom(value: number): number {
  return Math.min(
    VISUALISER_MAX_ZOOM,
    Math.max(VISUALISER_MIN_ZOOM, finite(value, 1)),
  );
}

export function zoomAtPoint(
  viewport: VisualiserViewport,
  requestedZoom: number,
  point: VisualiserPoint,
): VisualiserViewport {
  const currentZoom = clampVisualiserZoom(viewport.zoom);
  const zoom = clampVisualiserZoom(requestedZoom);
  const x = finite(viewport.x, 0);
  const y = finite(viewport.y, 0);
  const anchorX = finite(point.x, 0);
  const anchorY = finite(point.y, 0);
  const graphX = (anchorX - x) / currentZoom;
  const graphY = (anchorY - y) / currentZoom;
  return {
    zoom,
    x: clean(anchorX - graphX * zoom),
    y: clean(anchorY - graphY * zoom),
  };
}

export function panByScreenDelta(
  viewport: VisualiserViewport,
  delta: VisualiserPoint,
): VisualiserViewport {
  return {
    zoom: clampVisualiserZoom(viewport.zoom),
    x: clean(finite(viewport.x, 0) + finite(delta.x, 0)),
    y: clean(finite(viewport.y, 0) + finite(delta.y, 0)),
  };
}

export function centerAtZoom(
  bounds: VisualiserBounds,
  size: VisualiserViewportSize,
  requestedZoom = 1,
): VisualiserViewport {
  const zoom = clampVisualiserZoom(requestedZoom);
  const width = Math.max(0, finite(size.width, 0));
  const height = Math.max(0, finite(size.height, 0));
  const centerX = finite(bounds.x, 0) + Math.max(0, finite(bounds.width, 0)) / 2;
  const centerY = finite(bounds.y, 0) + Math.max(0, finite(bounds.height, 0)) / 2;
  return {
    zoom,
    x: clean(width / 2 - centerX * zoom),
    y: clean(height / 2 - centerY * zoom),
  };
}

export function fitViewport(
  bounds: VisualiserBounds,
  size: VisualiserViewportSize,
  padding = VISUALISER_FIT_PADDING,
  maxZoom = VISUALISER_FIT_MAX_ZOOM,
): VisualiserViewport {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) return { zoom: 1, x: 0, y: 0 };
  const safePadding = Math.max(0, finite(padding, VISUALISER_FIT_PADDING));
  const availableWidth = Math.max(1, size.width - safePadding * 2);
  const availableHeight = Math.max(1, size.height - safePadding * 2);
  const zoom = Math.min(
    clampVisualiserZoom(maxZoom),
    Math.max(
      VISUALISER_MIN_ZOOM,
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    ),
  );
  return centerAtZoom(bounds, size, clean(zoom));
}

export function visibleGraphBounds(
  viewport: VisualiserViewport,
  size: VisualiserViewportSize,
): VisualiserBounds {
  const zoom = clampVisualiserZoom(viewport.zoom);
  const x = finite(viewport.x, 0);
  const y = finite(viewport.y, 0);
  return {
    x: clean(-x / zoom),
    y: clean(-y / zoom),
    width: clean(Math.max(0, finite(size.width, 0)) / zoom),
    height: clean(Math.max(0, finite(size.height, 0)) / zoom),
  };
}
