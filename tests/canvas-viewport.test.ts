import { describe, expect, it } from 'vitest';
import { initialViewportForBounds } from '../src/canvas/view-editor/viewport-state';

describe('initial canvas viewport', () => {
  it('keeps the default viewport when the diagram fits at 100 percent', () => {
    expect(initialViewportForBounds(
      new Map([['node', { x: 10, y: 10, width: 200, height: 100 }]]),
      { width: 800, height: 600 },
      { fitPadding: 24, fitMaxZoom: 1.5, minZoom: 0.1 },
    )).toEqual({ zoom: 1, x: 20, y: 20 });
  });

  it('fits an oversized diagram inside the available canvas', () => {
    const viewport = initialViewportForBounds(
      new Map([['node', { x: 0, y: 0, width: 1600, height: 900 }]]),
      { width: 800, height: 600 },
      { fitPadding: 24, fitMaxZoom: 1.5, minZoom: 0.1 },
    );
    expect(viewport.zoom).toBeLessThan(1);
    expect(viewport.x).toBeGreaterThanOrEqual(24);
    expect(viewport.y).toBeGreaterThanOrEqual(24);
  });
});
