import { describe, expect, it } from 'vitest';
import {
  centerAtZoom,
  fitViewport,
  panByScreenDelta,
  visibleGraphBounds,
  zoomAtPoint,
} from '../src/ui/visualiser/viewport';

describe('Visualiser viewport geometry', () => {
  it('zooms around the pointer and clamps to the supported range', () => {
    const viewport = { zoom: 1, x: 20, y: 30 };
    const zoomed = zoomAtPoint(viewport, 2, { x: 140, y: 110 });

    expect(zoomed).toEqual({ zoom: 2, x: -100, y: -50 });
    expect(zoomAtPoint(viewport, 0.01, { x: 0, y: 0 }).zoom).toBe(0.2);
    expect(zoomAtPoint(viewport, 12, { x: 0, y: 0 }).zoom).toBe(4);
  });

  it('pans using screen-space pointer deltas', () => {
    expect(panByScreenDelta(
      { zoom: 1.5, x: 20, y: 30 },
      { x: -12, y: 8 },
    )).toEqual({ zoom: 1.5, x: 8, y: 38 });
  });

  it('centers graph content at an explicit zoom', () => {
    expect(centerAtZoom(
      { x: 100, y: 200, width: 300, height: 100 },
      { width: 900, height: 500 },
      1,
    )).toEqual({ zoom: 1, x: 200, y: 0 });
  });

  it('fits content with 32 screen pixels of padding and caps fit at 150 percent', () => {
    expect(fitViewport(
      { x: 100, y: 200, width: 800, height: 400 },
      { width: 1_000, height: 600 },
    )).toEqual({ zoom: 1.17, x: -85, y: -168 });

    expect(fitViewport(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: 1_000, height: 600 },
    ).zoom).toBe(1.5);
  });

  it('returns stable defaults for invalid dimensions and computes visible graph bounds', () => {
    expect(fitViewport(
      { x: Number.NaN, y: 0, width: 0, height: 0 },
      { width: 0, height: 0 },
    )).toEqual({ zoom: 1, x: 0, y: 0 });

    expect(visibleGraphBounds(
      { zoom: 2, x: -100, y: -50 },
      { width: 800, height: 600 },
    )).toEqual({ x: 50, y: 25, width: 400, height: 300 });
  });
});
