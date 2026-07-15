import type { Bounds } from '../../model/types';
import type { ViewViewport } from '../../model/store';

export const DEFAULT_VIEWPORT: ViewViewport = { zoom: 1, x: 20, y: 20 };

interface ViewportFitSettings {
  fitPadding: number;
  fitMaxZoom: number;
  minZoom: number;
}

export function initialViewportForBounds(
  absBounds: Map<string, Bounds>,
  canvas: { width: number; height: number },
  settings: ViewportFitSettings,
): ViewViewport {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bounds of absBounds.values()) {
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  if (!isFinite(minX)) return DEFAULT_VIEWPORT;
  const padding = settings.fitPadding;
  const fitsAtDefault =
    minX + DEFAULT_VIEWPORT.x >= padding &&
    minY + DEFAULT_VIEWPORT.y >= padding &&
    maxX + DEFAULT_VIEWPORT.x <= canvas.width - padding &&
    maxY + DEFAULT_VIEWPORT.y <= canvas.height - padding;
  if (fitsAtDefault) return DEFAULT_VIEWPORT;

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, canvas.width - padding * 2);
  const availableHeight = Math.max(1, canvas.height - padding * 2);
  const zoom = Math.min(
    Math.max(settings.minZoom, settings.fitMaxZoom),
    Math.max(settings.minZoom, Math.min(availableWidth / width, availableHeight / height)),
  );
  return {
    zoom,
    x: (canvas.width - width * zoom) / 2 - minX * zoom,
    y: (canvas.height - height * zoom) / 2 - minY * zoom,
  };
}
