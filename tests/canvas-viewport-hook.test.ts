import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasViewport } from '../src/canvas/view-editor/useCanvasViewport';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, type ModelStore } from '../src/model/store';
import type { Bounds } from '../src/model/types';

const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  'getBoundingClientRect',
);
let svgSize = { width: 0, height: 0 };
let resizeCallbacks: ResizeObserverCallback[] = [];

function Harness({ store, bounds }: { store: ModelStore; bounds: Map<string, Bounds> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useCanvasViewport('view', svgRef, bounds, store);
  return createElement('svg', { ref: svgRef });
}

beforeEach(() => {
  svgSize = { width: 0, height: 0 };
  resizeCallbacks = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: svgSize.width,
      bottom: svgSize.height,
      width: svgSize.width,
      height: svgSize.height,
      toJSON: () => undefined,
    }),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  if (originalGetBoundingClientRect) {
    Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', originalGetBoundingClientRect);
  } else {
    Reflect.deleteProperty(SVGElement.prototype, 'getBoundingClientRect');
  }
  vi.unstubAllGlobals();
});

describe('canvas viewport initialization', () => {
  it('fits once when a hidden canvas later receives a non-zero size', async () => {
    const store = createModelStore({ model: createEmptyModel('Viewport') });
    const bounds = new Map([['node', { x: 0, y: 0, width: 1_600, height: 900 }]]);
    const host = document.createElement('div');
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(createElement(Harness, { store, bounds }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(store.getState().viewportsByViewId.view).toBeUndefined();

    svgSize = { width: 800, height: 600 };
    await act(async () => {
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });
    expect(store.getState().viewportsByViewId.view?.zoom).toBeLessThan(1);

    const initialized = store.getState().viewportsByViewId.view;
    svgSize = { width: 400, height: 300 };
    await act(async () => {
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });
    expect(store.getState().viewportsByViewId.view).toBe(initialized);

    await act(async () => root.unmount());
  });
});
