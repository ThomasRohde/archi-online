import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  onPanRequest,
  publishViewport,
  requestPanTo,
  subscribeViewport,
  type ViewportInfo,
} from '../src/canvas/viewport-bus';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { addElement, addElementNodeToView, addView, createEmptyModel } from '../src/model/ops';
import { openView, replaceModel } from '../src/model/store';
import { OutlinePanel } from '../src/ui/OutlinePanel';

async function renderOutline(): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(OutlinePanel));
  });
  return { host, root };
}

const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  'getBoundingClientRect',
);
const originalGetScreenCTM = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getScreenCTM');
const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  'setPointerCapture',
);
const originalReleasePointerCapture = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  'releasePointerCapture',
);
let svgRect = { left: 0, top: 0, width: 400, height: 300 };
let resizeCallback: ResizeObserverCallback | null = null;
const disconnectResizeObserver = vi.fn();

beforeEach(() => {
  replaceModel(createEmptyModel('Outline Test'), null);
  svgRect = { left: 0, top: 0, width: 400, height: 300 };
  resizeCallback = null;
  disconnectResizeObserver.mockClear();
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 20, y: 30, width: 120, height: 55 }),
  });
  Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...svgRect,
      right: svgRect.left + svgRect.width,
      bottom: svgRect.top + svgRect.height,
      x: svgRect.left,
      y: svgRect.top,
      toJSON: () => undefined,
    }),
  });
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value: () => ({
      inverse: () => ({ a: 2, b: 0, c: 0, d: 3, e: -10, f: -20 }),
    }),
  });
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnectResizeObserver();
      }
    },
  );
});

afterEach(() => {
  if (originalGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  if (originalGetBoundingClientRect) {
    Object.defineProperty(
      SVGElement.prototype,
      'getBoundingClientRect',
      originalGetBoundingClientRect,
    );
  } else {
    Reflect.deleteProperty(SVGElement.prototype, 'getBoundingClientRect');
  }
  if (originalGetScreenCTM) {
    Object.defineProperty(SVGElement.prototype, 'getScreenCTM', originalGetScreenCTM);
  } else Reflect.deleteProperty(SVGElement.prototype, 'getScreenCTM');
  if (originalSetPointerCapture) {
    Object.defineProperty(SVGElement.prototype, 'setPointerCapture', originalSetPointerCapture);
  } else Reflect.deleteProperty(SVGElement.prototype, 'setPointerCapture');
  if (originalReleasePointerCapture) {
    Object.defineProperty(
      SVGElement.prototype,
      'releasePointerCapture',
      originalReleasePointerCapture,
    );
  } else {
    Reflect.deleteProperty(SVGElement.prototype, 'releasePointerCapture');
  }
  vi.unstubAllGlobals();
});

describe('viewport bus', () => {
  it('publishes per view and replays the latest viewport to late subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const info: ViewportInfo = { x: 10, y: 20, zoom: 2, width: 300, height: 200 };

    const unsubscribeA = subscribeViewport('bus-a', a);
    const unsubscribeB = subscribeViewport('bus-b', b);
    expect(a).toHaveBeenLastCalledWith(null);
    expect(b).toHaveBeenLastCalledWith(null);

    publishViewport('bus-a', info);
    expect(a).toHaveBeenLastCalledWith(info);
    expect(b).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    const unsubscribeLate = subscribeViewport('bus-a', late);
    expect(late).toHaveBeenCalledOnce();
    expect(late).toHaveBeenLastCalledWith(info);

    unsubscribeA();
    publishViewport('bus-a', null);
    expect(a).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenLastCalledWith(null);

    unsubscribeB();
    unsubscribeLate();
  });

  it('routes pan requests only to matching, subscribed views', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = onPanRequest('pan-a', a);
    const unsubscribeB = onPanRequest('pan-b', b);

    requestPanTo('pan-a', 75, 125);
    expect(a).toHaveBeenCalledOnce();
    expect(a).toHaveBeenLastCalledWith(75, 125);
    expect(b).not.toHaveBeenCalled();

    unsubscribeA();
    requestPanTo('pan-a', 1, 2);
    expect(a).toHaveBeenCalledOnce();

    unsubscribeB();
  });
});

describe('OutlinePanel', () => {
  it('renders the active view at measured content bounds and shows its viewport', async () => {
    const elementId = addElement('BusinessActor', 'Actor');
    const viewId = addView('Active View');
    addElementNodeToView(viewId, elementId, viewId, {
      x: 20,
      y: 30,
      width: 120,
      height: 55,
    });
    openView(viewId);

    const { host, root } = await renderOutline();
    const svg = host.querySelector<SVGSVGElement>('svg.outline-svg');
    expect(svg?.getAttribute('viewBox')).toBe('10 20 140 75');
    expect(host.textContent).toContain('Actor');

    await act(async () => {
      publishViewport(viewId, { x: 5, y: 6, zoom: 2, width: 300, height: 200 });
    });
    const rect = host.querySelector<SVGRectElement>('rect.outline-viewport');
    expect(rect?.getAttribute('x')).toBe('5');
    expect(rect?.getAttribute('y')).toBe('6');
    expect(rect?.getAttribute('width')).toBe('300');
    expect(rect?.getAttribute('height')).toBe('200');

    await act(async () => root.unmount());
  });

  it('shows an empty state when there is no active view', async () => {
    const { host, root } = await renderOutline();

    expect(host.textContent).toBe('No active view');
    expect(host.querySelector('svg')).toBeNull();

    await act(async () => root.unmount());
  });

  it('uses a margin-only viewBox for an existing empty view', async () => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });
    const viewId = addView('Empty View');
    openView(viewId);

    const { host, root } = await renderOutline();

    expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('-10 -10 20 20');

    await act(async () => root.unmount());
  });

  it('maps pointer clicks and captured drags into view-space pan requests', async () => {
    const viewId = addView('Interactive View');
    openView(viewId);
    const pan = vi.fn();
    const unsubscribe = onPanRequest(viewId, pan);
    const { host, root } = await renderOutline();
    const svg = host.querySelector<SVGSVGElement>('svg.outline-svg')!;

    const dispatch = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
      }) as PointerEvent;
      Object.defineProperty(event, 'pointerId', { value: 7 });
      svg.dispatchEvent(event);
    };

    await act(async () => {
      dispatch('pointerdown', 30, 40);
      dispatch('pointermove', 40, 50);
      dispatch('pointerup', 40, 50);
    });

    expect(pan.mock.calls).toEqual([
      [50, 100],
      [70, 130],
    ]);

    unsubscribe();
    await act(async () => root.unmount());
  });
});

describe('ViewEditor viewport publication', () => {
  function populatedView(): string {
    const elementId = addElement('BusinessActor', 'Actor');
    const viewId = addView('Editor View');
    addElementNodeToView(viewId, elementId, viewId, {
      x: 20,
      y: 30,
      width: 120,
      height: 55,
    });
    return viewId;
  }

  it('publishes visible view-space bounds, republishes on resize, and clears on unmount', async () => {
    const viewId = populatedView();
    const observed = vi.fn();
    const unsubscribe = subscribeViewport(viewId, observed);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(ViewEditor, { viewId, readOnly: true }));
    });
    expect(observed).toHaveBeenLastCalledWith({
      x: -20,
      y: -20,
      zoom: 1,
      width: 400,
      height: 300,
    });

    svgRect = { left: 0, top: 0, width: 600, height: 450 };
    await act(async () => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(observed).toHaveBeenLastCalledWith({
      x: -20,
      y: -20,
      zoom: 1,
      width: 600,
      height: 450,
    });

    await act(async () => root.unmount());
    expect(observed).toHaveBeenLastCalledWith(null);
    expect(disconnectResizeObserver).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('centers the current viewport on matching pan requests', async () => {
    const viewId = populatedView();
    const observed = vi.fn();
    const unsubscribe = subscribeViewport(viewId, observed);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(ViewEditor, { viewId, readOnly: true }));
    });
    await act(async () => {
      requestPanTo(viewId, 100, 50);
    });

    expect(observed).toHaveBeenLastCalledWith({
      x: -100,
      y: -100,
      zoom: 1,
      width: 400,
      height: 300,
    });

    await act(async () => root.unmount());
    unsubscribe();
  });
});
