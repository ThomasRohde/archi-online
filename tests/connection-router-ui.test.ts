import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { showViewObjectContextMenu } from '../src/canvas/view-editor/contextMenu';
import {
  createModelStore,
  openView,
  replaceModel,
  setSelection,
} from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { useStore } from '../src/ui/store-hooks';
import {
  canvasStatusKey,
  useCanvasStatus,
} from '../src/ui/canvas-status';
import { connectionEndpointModel } from './helpers/connection-endpoints';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useCanvasStatus.setState({ entries: {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
  useCanvasStatus.setState({ entries: {} });
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('view router and endpoint controls', () => {
  function pointer(type: string, clientX: number, clientY: number): PointerEvent {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
    }) as PointerEvent;
    Object.defineProperty(event, 'pointerId', { value: 7 });
    return event;
  }

  it('shows endpoint handles in both modes and disables Manhattan bendpoint editing', async () => {
    const manual = connectionEndpointModel();
    manual.connections.base.bendpoints = [
      { startX: 0, startY: 80, endX: 0, endY: 80 },
    ];
    replaceModel(manual, null);
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));

    expect(host.querySelectorAll('[data-connection-endpoint-handle]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-bendpoint]')).toHaveLength(1);

    const manhattan = structuredClone(useStore.getState().model!);
    manhattan.views.view.connectionRouterType = 2;
    await act(async () => {
      replaceModel(manhattan, null);
      setSelection('view', ['base']);
    });

    expect(host.querySelectorAll('[data-connection-endpoint-handle]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-bendpoint]')).toHaveLength(0);
  });

  it('keeps resize, bendpoint, and endpoint handles constant in screen space', async () => {
    const model = connectionEndpointModel();
    model.connections.base.bendpoints = [
      { startX: 0, startY: 80, endX: 0, endY: 80 },
    ];
    replaceModel(model, null);

    for (const zoom of [0.5, 2]) {
      useStore.setState({
        viewportsByViewId: { view: { zoom, x: 0, y: 0 } },
      });
      await act(async () => {
        setSelection('view', ['node-a']);
        root.render(createElement(ViewEditor, { key: `node-${zoom}`, viewId: 'view' }));
      });
      const resize = host.querySelector<SVGRectElement>('[data-handle="se"]')!;
      expect(Number(resize.getAttribute('width')) * zoom).toBeCloseTo(7);
      expect(Number(resize.getAttribute('height')) * zoom).toBeCloseTo(7);

      await act(async () => {
        setSelection('view', ['base']);
        root.render(createElement(ViewEditor, { key: `connection-${zoom}`, viewId: 'view' }));
      });
      const bendpoint = host.querySelector<SVGRectElement>('[data-bendpoint="base@0"]')!;
      const endpointHit = host.querySelector<SVGCircleElement>(
        '[data-connection-endpoint-handle="target"]',
      )!;
      const endpointVisual = host.querySelector<SVGCircleElement>(
        '[data-connection-endpoint-visual="target"]',
      )!;
      expect(Number(bendpoint.getAttribute('width')) * zoom).toBeCloseTo(7);
      expect(Number(endpointHit.getAttribute('r')) * 2 * zoom).toBeCloseTo(12);
      expect(endpointHit.getAttribute('fill')).toBe('transparent');
      expect(Number(endpointVisual.getAttribute('r')) * 2 * zoom).toBeCloseTo(8);
    }
  });

  it('uses the identical Manhattan path in editable and read-only viewers', async () => {
    const model = connectionEndpointModel();
    model.views.view.connectionRouterType = 2;
    replaceModel(model, null);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const editable = host.querySelector('[data-conn-id="dependent"] path')?.getAttribute('d');

    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view', readOnly: true })));
    const viewer = host.querySelector('[data-conn-id="dependent"] path')?.getAttribute('d');

    expect(editable).toBe('M150,20 L150,90 L150,90 L150,160');
    expect(viewer).toBe(editable);
    expect(host.querySelectorAll('[data-connection-endpoint-handle]')).toHaveLength(0);
  });

  it('publishes and removes read-only canvas status by session and view', async () => {
    const model = connectionEndpointModel();
    replaceModel(model, null);
    openView('view');
    useStore.setState({
      viewportsByViewId: { view: { zoom: 1.5, x: 0, y: 0 } },
    });
    await act(async () => root.render(
      createElement(ViewEditor, { viewId: 'view', readOnly: true }),
    ));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    const key = canvasStatusKey('legacy-single-model', 'view');

    await act(async () => {
      svg.dispatchEvent(pointer('pointermove', 45, 60));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(useCanvasStatus.getState().entries[key]).toMatchObject({
      zoom: 1.5,
      x: 30,
      y: 40,
    });

    await act(async () => root.render(null));
    expect(useCanvasStatus.getState().entries[key]).toBeUndefined();
  });

  it('uses the orthogonal anchor preference in editable and read-only viewers', async () => {
    const model = connectionEndpointModel();
    model.connections.base.targetId = 'node-c';
    model.nodes['node-b'].targetConnectionIds = [];
    model.nodes['node-c'].targetConnectionIds.push('base');
    replaceModel(model, null);
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, useOrthogonalConnectionAnchors: true },
    });

    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const editable = host.querySelector('[data-conn-id="base"] path')?.getAttribute('d');
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view', readOnly: true })));
    const viewer = host.querySelector('[data-conn-id="base"] path')?.getAttribute('d');

    expect(editable).toBe('M100,40 L100,160');
    expect(viewer).toBe(editable);
  });

  it('provides a compact accessible Manual/Manhattan view property', async () => {
    const model = connectionEndpointModel();
    replaceModel(model, null);
    setSelection('tree', ['view']);
    await act(async () => root.render(
      createElement(Fragment, null, createElement(PropertiesPanel)),
    ));
    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Connection router"]',
    );
    expect(select).not.toBeNull();
    expect(select?.value).toBe('0');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, '2');
      select?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useStore.getState().model?.views.view.connectionRouterType).toBe(2);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Set Connection Router');
  });

  it('drags a selected endpoint handle onto another connectable', async () => {
    const model = connectionEndpointModel();
    replaceModel(model, null);
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const targetHandle = host.querySelector<SVGCircleElement>(
      '[data-connection-endpoint-handle="target"]',
    )!;
    const targetNode = host.querySelector<SVGGElement>('[data-node-id="node-c"]')!;
    const hit = vi.fn(() => targetHandle as Element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hit,
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 220, 40)));
    hit.mockReturnValue(targetNode);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 170, 180)));
    expect(host.querySelector('[data-reconnection-preview="target"]')?.getAttribute('stroke'))
      .toBe('var(--canvas-valid)');
    expect(targetNode.querySelector('rect[stroke="var(--canvas-valid)"]')).not.toBeNull();
    await act(async () => {
      svg.dispatchEvent(pointer('pointerup', 170, 180));
      await Promise.resolve();
    });

    expect(useStore.getState().model!.connections.base.targetId).toBe('node-c');
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Reconnect Connection');
  });

  it('drags a selected endpoint handle on its current node to edit its anchor', async () => {
    const model = connectionEndpointModel();
    replaceModel(model, null);
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const targetHandle = host.querySelector<SVGCircleElement>(
      '[data-connection-endpoint-handle="target"]',
    )!;
    const currentTarget = host.querySelector<SVGGElement>('[data-node-id="node-b"]')!;
    const hit = vi.fn(() => targetHandle as Element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hit,
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 200, 20)));
    expect(host.querySelector('[data-connection-endpoint-handle="target"]')).toBeNull();
    hit.mockReturnValue(currentTarget);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 300, 12)));
    expect(host.querySelector('[data-reconnection-preview="target"]')?.getAttribute('stroke'))
      .toBe('var(--canvas-anchor)');
    expect(currentTarget.querySelector('rect[stroke="var(--canvas-anchor)"]')).not.toBeNull();
    await act(async () => svg.dispatchEvent(pointer('pointerup', 300, 12)));

    const edited = useStore.getState().model!.connections.base;
    expect(edited.targetId).toBe('node-b');
    expect(edited.bendpoints).toHaveLength(2);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Edit Bendpoints');
  });

  it('does not edit an anchor when the same endpoint is dropped in Manhattan mode', async () => {
    const model = connectionEndpointModel();
    model.views.view.connectionRouterType = 2;
    replaceModel(model, null);
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const targetHandle = host.querySelector<SVGCircleElement>(
      '[data-connection-endpoint-handle="target"]',
    )!;
    const currentTarget = host.querySelector<SVGGElement>('[data-node-id="node-b"]')!;
    const hit = vi.fn(() => targetHandle as Element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hit,
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 200, 20)));
    hit.mockReturnValue(currentTarget);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 300, 12)));
    expect(host.querySelector('[data-reconnection-preview="target"]')?.getAttribute('stroke'))
      .toBe('var(--canvas-invalid)');
    expect(currentTarget.querySelector('rect[stroke="var(--canvas-invalid)"]')).not.toBeNull();
    await act(async () => svg.dispatchEvent(pointer('pointerup', 300, 12)));

    expect(useStore.getState().model!.connections.base.bendpoints).toEqual([]);
    expect(useStore.getState().undoStack).toEqual([]);
  });

  it('keeps a near-container drop as an anchor move', async () => {
    const model = connectionEndpointModel();
    model.nodes.container = {
      id: 'container',
      viewId: 'view',
      parentId: 'view',
      bounds: { x: 180, y: -20, width: 150, height: 80 },
      childIds: ['node-b'],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'group',
      name: 'Container',
      documentation: '',
      properties: [],
    };
    model.views.view.childIds = ['node-a', 'container', 'node-c'];
    model.nodes['node-b'].parentId = 'container';
    model.nodes['node-b'].bounds = { x: 20, y: 20, width: 100, height: 40 };
    replaceModel(model, null);
    useStore.setState({
      viewportsByViewId: { view: { zoom: 1, x: 0, y: 0 } },
    });
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const handle = host.querySelector<SVGCircleElement>(
      '[data-connection-endpoint-handle="target"]',
    )!;
    const container = host.querySelector<SVGGElement>('[data-node-id="container"]')!;
    const hit = vi.fn(() => handle as Element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hit,
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 20)));
    hit.mockReturnValue(container);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 305, 20)));
    expect(host.querySelector('[data-reconnection-preview="target"]')?.getAttribute('stroke'))
      .toBe('var(--canvas-anchor)');
    await act(async () => svg.dispatchEvent(pointer('pointerup', 305, 20)));

    expect(useStore.getState().model!.connections.base.targetId).toBe('node-b');
    expect(useStore.getState().model!.connections.base.bendpoints.length).toBeGreaterThan(0);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Edit Bendpoints');
  });

  it('shows invalid feedback on a hovered connection target', async () => {
    const model = connectionEndpointModel();
    model.connections.dependent.lineStyle = 3;
    replaceModel(model, null);
    setSelection('view', ['base']);
    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const handle = host.querySelector<SVGCircleElement>(
      '[data-connection-endpoint-handle="target"]',
    )!;
    const dependent = host.querySelector<SVGGElement>('[data-conn-id="dependent"]')!;
    const hit = vi.fn(() => handle as Element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hit,
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 20)));
    hit.mockReturnValue(dependent);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 150, 90)));

    expect(host.querySelector('[data-reconnection-preview="target"]')?.getAttribute('stroke'))
      .toBe('var(--canvas-invalid)');
    expect(
      dependent.querySelectorAll('path')[1]?.getAttribute('stroke'),
    ).toBe('var(--canvas-invalid)');
  });

  it('publishes reconnect intent messages and briefly reports an empty-drop cancellation', async () => {
    vi.useFakeTimers();
    try {
      const model = connectionEndpointModel();
      replaceModel(model, null);
      openView('view');
      setSelection('view', ['base']);
      await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
      const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
      Object.defineProperty(svg, 'setPointerCapture', {
        configurable: true,
        value: vi.fn(),
      });
      const handle = host.querySelector<SVGCircleElement>(
        '[data-connection-endpoint-handle="target"]',
      )!;
      const targetNode = host.querySelector<SVGGElement>('[data-node-id="node-c"]')!;
      const hit = vi.fn(() => handle as Element);
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: hit,
      });
      const key = canvasStatusKey('legacy-single-model', 'view');

      await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 20)));
      hit.mockReturnValue(targetNode);
      await act(async () => svg.dispatchEvent(pointer('pointermove', 150, 180)));
      expect(useCanvasStatus.getState().entries[key]).toMatchObject({
        message: 'Reconnect to C',
        tone: 'valid',
      });

      hit.mockReturnValue(null as unknown as Element);
      await act(async () => svg.dispatchEvent(pointer('pointermove', 400, 240)));
      expect(useCanvasStatus.getState().entries[key]).toMatchObject({
        message: 'Cannot reconnect here',
        tone: 'invalid',
      });
      await act(async () => svg.dispatchEvent(pointer('pointerup', 400, 240)));
      expect(useCanvasStatus.getState().entries[key]).toMatchObject({
        message: 'Reconnect cancelled',
        tone: 'neutral',
      });

      await act(async () => vi.advanceTimersByTime(1500));
      expect(useCanvasStatus.getState().entries[key]?.message).toBeNull();
      expect(useStore.getState().undoStack).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not offer bendpoint editing from a Manhattan connection context menu', async () => {
    const model = connectionEndpointModel();
    model.views.view.connectionRouterType = 2;
    model.connections.base.bendpoints = [
      { startX: 0, startY: 80, endX: 0, endY: 80 },
    ];
    const store = createModelStore({ model, fileName: null });
    await act(async () => root.render(createElement(ContextMenuHost)));

    await act(async () => showViewObjectContextMenu({
      clientX: 20,
      clientY: 20,
      viewId: 'view',
      id: 'base',
      ids: ['base'],
      model,
      settings: DEFAULT_SETTINGS,
      modelStore: store,
      sessionId: 'router-test',
      startEdit: vi.fn(),
    }));

    expect(document.body.textContent).not.toContain('Remove All Bendpoints');
  });
});
