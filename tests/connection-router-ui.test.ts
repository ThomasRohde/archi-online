import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { showViewObjectContextMenu } from '../src/canvas/view-editor/contextMenu';
import { createModelStore, replaceModel, setSelection } from '../src/model/store';
import { DEFAULT_SETTINGS } from '../src/settings/app-settings';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { useStore } from '../src/ui/store-hooks';
import { connectionEndpointModel } from './helpers/connection-endpoints';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
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
    await act(async () => {
      svg.dispatchEvent(pointer('pointerup', 170, 180));
      await Promise.resolve();
    });

    expect(useStore.getState().model!.connections.base.targetId).toBe('node-c');
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Reconnect Connection');
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
