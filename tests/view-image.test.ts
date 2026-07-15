import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_MARGIN,
  contentViewBox,
  renderViewSvg,
  supportsImageClipboard,
} from '../src/canvas/export/view-image';
import { computeAbsBounds } from '../src/canvas/view-editor/bounds';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { addLegendToView, addView, createElementOnView, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
const model = parseArchimate(archisurance);

// A view that actually contains element nodes (the first Archisurance view is
// a table of contents made only of diagram references).
const viewId = Object.values(model.nodes).find((n) => n.nodeType === 'element')!.viewId;

/** jsdom has no getBBox; measure from the model geometry instead. */
function geometricMeasure(m: ModelState, id: string) {
  const boxes = [...computeAbsBounds(m, id).values()];
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

describe('renderViewSvg', () => {
  const bbox = geometricMeasure(model, viewId);
  const rendered = renderViewSvg(model, viewId, { measure: () => bbox });

  it('produces a standalone SVG document sized to content plus margins', () => {
    expect(rendered.svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(rendered.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(rendered.width).toBe(Math.ceil(bbox.width + DEFAULT_EXPORT_MARGIN * 2));
    expect(rendered.height).toBe(Math.ceil(bbox.height + DEFAULT_EXPORT_MARGIN * 2));
    const minX = Math.floor(bbox.x) - DEFAULT_EXPORT_MARGIN;
    const minY = Math.floor(bbox.y) - DEFAULT_EXPORT_MARGIN;
    expect(rendered.svg).toContain(
      `viewBox="${minX} ${minY} ${rendered.width} ${rendered.height}"`,
    );
  });

  it('inlines the canvas font stack so the file is self-contained', () => {
    expect(rendered.svg).toContain('Segoe UI');
  });

  it('renders element names from the view', () => {
    const someElementName = Object.values(model.nodes)
      .filter((n) => n.viewId === viewId && n.nodeType === 'element')
      .map((n) => model.elements[(n as { elementId: string }).elementId]?.name)
      .find((name) => !!name);
    expect(someElementName).toBeTruthy();
    expect(rendered.svg).toContain(someElementName!);
  });

  it('adds a white background rect by default and omits it when transparent', () => {
    expect(rendered.svg).toContain('fill="#ffffff"');
    const transparent = renderViewSvg(model, viewId, {
      measure: () => bbox,
      background: 'transparent',
    });
    const bgRects = (transparent.svg.match(/fill="#ffffff"/g) ?? []).length;
    const defaultBgRects = (rendered.svg.match(/fill="#ffffff"/g) ?? []).length;
    expect(defaultBgRects).toBe(bgRects + 1);
  });

  it('does not leak selection or editing overlays into the export', () => {
    expect(rendered.svg).not.toContain('data-node-id');
    expect(rendered.svg).not.toContain('resize-handle');
    expect(rendered.svg).not.toContain('data-view-grid');
    expect(rendered.svg).not.toContain('alignment-guide');
  });

  it('contains no foreignObject (labels are native SVG text)', () => {
    // foreignObject taints canvases during PNG rasterization and is not
    // rendered by most external SVG consumers.
    expect(rendered.svg).not.toContain('foreignObject');
    expect(rendered.svg).toContain('<text');
  });

  it('throws for an unknown view', () => {
    expect(() => renderViewSvg(model, 'nope', { measure: () => bbox })).toThrow(/View not found/);
  });

  it('can isolate deterministic report rendering from browser-local legend settings', async () => {
    const store = createModelStore({ model: createEmptyModel('Legend export') });
    const legendViewId = addView('Legend View', undefined, store);
    createElementOnView(
      'BusinessActor',
      legendViewId,
      legendViewId,
      { x: 20, y: 20, width: 120, height: 55 },
      'Stakeholder',
      {},
      store,
    );
    addLegendToView(
      legendViewId,
      legendViewId,
      { x: 20, y: 100, width: 240, height: 180 },
      undefined,
      {},
      store,
    );
    const legendModel = store.getState().model!;
    const legendBounds = geometricMeasure(legendModel, legendViewId);
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        legendLabels: { BusinessActor: 'BROWSER-ONLY-SENTINEL' },
        legendUserColors: { BusinessActor: '#123456' },
      },
    });

    const browserStyled = renderViewSvg(legendModel, legendViewId, {
      measure: () => legendBounds,
    });
    const reportStyled = renderViewSvg(legendModel, legendViewId, {
      measure: () => legendBounds,
      renderSettings: {
        ...DEFAULT_SETTINGS,
        legendLabels: {},
        legendUserColors: {},
      },
    });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });

    expect(browserStyled.svg).toContain('BROWSER-ONLY-SENTINEL');
    expect(reportStyled.svg).not.toContain('BROWSER-ONLY-SENTINEL');
    expect(reportStyled.svg).not.toContain('#123456');
  });
});

describe('contentViewBox', () => {
  it('expands measured content by the export margin', () => {
    expect(contentViewBox({ x: 12, y: 34, width: 100, height: 50 })).toEqual({
      x: 2,
      y: 24,
      width: 120,
      height: 70,
    });
  });

  it('produces a margin-only box for empty content', () => {
    expect(contentViewBox({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: -DEFAULT_EXPORT_MARGIN,
      y: -DEFAULT_EXPORT_MARGIN,
      width: DEFAULT_EXPORT_MARGIN * 2,
      height: DEFAULT_EXPORT_MARGIN * 2,
    });
  });
});

describe('supportsImageClipboard', () => {
  it('reflects ClipboardItem availability', () => {
    // jsdom has neither clipboard.write nor ClipboardItem.
    expect(supportsImageClipboard()).toBe(false);
  });
});
