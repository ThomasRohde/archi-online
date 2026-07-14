import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisGraphResult } from '../src/model/analysis-graph';
import type { ElkGraphLayoutResult } from '../src/model/layout/elk-graph';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { VisualiserCanvas } from '../src/ui/visualiser/VisualiserCanvas';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function graphFixture(): AnalysisGraphResult {
  return {
    focusIds: ['a'],
    conceptIds: ['a', 'b', 'e'],
    elementIds: ['a', 'b'],
    relationshipIds: ['e'],
    nodes: [
      {
        id: 'a', name: 'Actor', focus: true, compact: false,
        kind: 'element', type: 'BusinessActor',
      },
      {
        id: 'b', name: 'Back Office', focus: false, compact: false,
        kind: 'element', type: 'BusinessActor',
      },
    ],
    edges: [{
      id: 'e', relationshipId: 'e', sourceId: 'a', targetId: 'b',
      type: 'AssignmentRelationship', name: 'Assigned',
    }],
    truncated: false,
    maxConcepts: 1_000,
  };
}

const layout: ElkGraphLayoutResult = {
  nodes: {
    a: { x: 0, y: 0, width: 120, height: 55 },
    b: { x: 300, y: 0, width: 120, height: 55 },
  },
  edges: {
    e: { points: [{ x: 120, y: 27.5 }, { x: 300, y: 27.5 }] },
  },
};

function pointer(
  type: string,
  { x, y, button = 0, buttons = 1, pointerId = 7 }: {
    x: number;
    y: number;
    button?: number;
    buttons?: number;
    pointerId?: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event as PointerEvent;
}

async function renderCanvas(showRelationshipNames = false): Promise<{
  host: HTMLDivElement;
  root: Root;
  canvas: HTMLDivElement;
  onSelect: ReturnType<typeof vi.fn>;
  onOpen: ReturnType<typeof vi.fn>;
}> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  await act(async () => {
    root.render(createElement(Fragment, null,
      createElement(VisualiserCanvas, {
        graph: graphFixture(),
        layout,
        showRelationshipNames,
        onSelectConcept: onSelect,
        onOpenConcept: onOpen,
      }),
      createElement(ContextMenuHost),
    ));
  });
  const canvas = host.querySelector<HTMLDivElement>('.visualiser-canvas')!;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, toJSON: () => ({}),
    }),
  });
  Object.defineProperty(canvas, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(canvas, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  return { host, root, canvas, onSelect, onOpen };
}

afterEach(() => {
  document.body.replaceChildren();
});

function zoom(canvas: HTMLElement): number {
  return Number(canvas.dataset.zoom);
}

function menuItem(label: string): HTMLElement {
  const item = Array.from(document.querySelectorAll<HTMLElement>('.ctx-item'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(item, `Expected menu item "${label}"`).toBeDefined();
  return item!;
}

describe('VisualiserCanvas', () => {
  it('ships the route-placard, floating HUD, pan, focus, and reduced-motion styles', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(css).toContain('.visualiser-edge-label rect');
    expect(css).toContain('.visualiser-zoom-controls');
    expect(css).toContain('.visualiser-canvas.is-panning');
    expect(css).toContain('.visualiser-canvas:focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('zooms at the pointer with a plain wheel and exposes the floating zoom HUD', async () => {
    const { root, host, canvas } = await renderCanvas();

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 100,
        deltaY: -100,
      }));
    });

    expect(zoom(canvas)).toBeCloseTo(1.12);
    expect(Number(canvas.dataset.viewportX)).toBeCloseTo(-24);
    expect(Number(canvas.dataset.viewportY)).toBeCloseTo(-12);
    expect(host.querySelector('[aria-label="Zoom out"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Reset zoom to 100%"]')?.textContent).toBe('112%');
    expect(host.querySelector('[aria-label="Zoom in"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Fit graph to view"]')).not.toBeNull();

    const fitButton = host.querySelector<HTMLButtonElement>('[aria-label="Fit graph to view"]')!;
    const hudPointerDown = pointer('pointerdown', { x: 760, y: 560, pointerId: 11 });
    await act(async () => { fitButton.dispatchEvent(hudPointerDown); });
    expect(hudPointerDown.defaultPrevented).toBe(false);
    expect(canvas.classList.contains('is-panning')).toBe(false);
    expect(canvas.setPointerCapture).not.toHaveBeenCalledWith(11);

    await act(async () => { root.unmount(); });
  });

  it('pans with empty-canvas left drag, middle drag, and Space plus left drag', async () => {
    const { root, canvas, host } = await renderCanvas();

    await act(async () => {
      canvas.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { x: 140, y: 130 }));
    });
    expect(canvas.dataset.viewportX).toBe('40');
    expect(canvas.dataset.viewportY).toBe('30');
    expect(canvas.classList.contains('is-panning')).toBe(true);

    await act(async () => {
      canvas.dispatchEvent(pointer('lostpointercapture', { x: 140, y: 130 }));
      canvas.dispatchEvent(pointer('pointermove', { x: 200, y: 200 }));
    });
    expect(canvas.dataset.viewportX).toBe('40');

    const node = host.querySelector<SVGGElement>('[data-concept-id="a"]')!;
    await act(async () => {
      node.dispatchEvent(pointer('pointerdown', {
        x: 100, y: 100, button: 1, buttons: 4, pointerId: 8,
      }));
      canvas.dispatchEvent(pointer('pointermove', {
        x: 120, y: 110, button: 1, buttons: 4, pointerId: 8,
      }));
      canvas.dispatchEvent(pointer('pointerup', {
        x: 120, y: 110, button: 1, buttons: 0, pointerId: 8,
      }));
    });
    expect(canvas.dataset.viewportX).toBe('60');
    expect(canvas.dataset.viewportY).toBe('40');

    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ', code: 'Space', bubbles: true, cancelable: true,
      }));
      node.dispatchEvent(pointer('pointerdown', { x: 50, y: 50, pointerId: 9 }));
      canvas.dispatchEvent(pointer('pointermove', { x: 60, y: 70, pointerId: 9 }));
      canvas.dispatchEvent(pointer('pointerup', { x: 60, y: 70, buttons: 0, pointerId: 9 }));
      canvas.dispatchEvent(new KeyboardEvent('keyup', {
        key: ' ', code: 'Space', bubbles: true,
      }));
    });
    expect(canvas.dataset.viewportX).toBe('70');
    expect(canvas.dataset.viewportY).toBe('60');

    await act(async () => { root.unmount(); });
  });

  it('supports zoom shortcuts and ignores them from editable targets', async () => {
    const { root, canvas } = await renderCanvas();
    canvas.focus();

    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: '+', bubbles: true, cancelable: true,
      }));
    });
    expect(zoom(canvas)).toBeCloseTo(1.2);

    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: '0', bubbles: true, cancelable: true,
      }));
    });
    expect(zoom(canvas)).toBe(1);

    const input = document.createElement('input');
    canvas.append(input);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: '+', bubbles: true, cancelable: true,
      }));
    });
    expect(zoom(canvas)).toBe(1);

    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: '1', bubbles: true, cancelable: true,
      }));
    });
    expect(zoom(canvas)).toBe(1.5);

    await act(async () => { root.unmount(); });
  });

  it('offers canvas and node context actions while preserving node click semantics', async () => {
    const { root, canvas, host, onSelect, onOpen } = await renderCanvas();

    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: 20, clientY: 30,
      }));
    });
    menuItem('Fit to view');
    menuItem('Zoom in');
    menuItem('Zoom out');
    menuItem('100%');

    await act(async () => { menuItem('Fit to view').click(); });
    expect(zoom(canvas)).toBe(1.5);

    const node = host.querySelector<SVGGElement>('[data-concept-id="a"]')!;
    await act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onOpen).toHaveBeenCalledWith('a');

    await act(async () => {
      node.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: 50, clientY: 60,
      }));
    });
    menuItem('Select');
    menuItem('Open');
    menuItem('Center on node');

    await act(async () => { menuItem('Select').click(); });
    expect(onSelect).toHaveBeenCalledTimes(2);

    await act(async () => { root.unmount(); });
  });
});
