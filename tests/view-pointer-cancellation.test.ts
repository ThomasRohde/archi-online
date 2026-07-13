import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { replaceModel, setSelection } from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { useStore } from '../src/ui/store-hooks';
import { connectionEndpointModel } from './helpers/connection-endpoints';

let host: HTMLDivElement;
let root: Root;
let hit: Element;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  replaceModel(connectionEndpointModel(), null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => hit),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function pointer(
  type: string,
  x: number,
  y: number,
  pointerId: number,
  button = 0,
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX: x,
    clientY: y,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

async function renderEditor(): Promise<SVGSVGElement> {
  await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
  const svg = host.querySelector<SVGSVGElement>('svg.view-svg');
  expect(svg).not.toBeNull();
  return svg!;
}

function emulatePointerCapture(svg: SVGSVGElement) {
  const captured = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
  const hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
  const releasePointerCapture = vi.fn((pointerId: number) => {
    captured.delete(pointerId);
    svg.dispatchEvent(pointer('lostpointercapture', 0, 0, pointerId));
  });
  Object.defineProperties(svg, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
  return { captured, setPointerCapture, hasPointerCapture, releasePointerCapture };
}

function currentModel() {
  return useStore.getState().model!;
}

describe('editable view pointer cancellation', () => {
  it('cancels a move without mutation and accepts a clean next move', async () => {
    const svg = await renderEditor();
    const capture = emulatePointerCapture(svg);
    const before = structuredClone(currentModel());
    hit = host.querySelector('[data-node-id="node-a"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 50, 70, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointercancel', 50, 70, 1)));

    expect(currentModel()).toEqual(before);
    expect(useStore.getState().undoStack).toEqual([]);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(capture.captured.size).toBe(0);

    hit = host.querySelector('[data-node-id="node-a"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 2)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 60, 70, 2)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 60, 70, 2)));

    expect(currentModel().nodes['node-a'].bounds).not.toEqual(before.nodes['node-a'].bounds);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Move');
  });

  it('cancels a reconnect on lost capture without recursion and accepts the next reconnect', async () => {
    setSelection('view', ['base']);
    const svg = await renderEditor();
    const capture = emulatePointerCapture(svg);
    const before = structuredClone(currentModel());
    hit = host.querySelector('[data-connection-endpoint-handle="target"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 20, 3)));
    hit = host.querySelector('[data-node-id="node-c"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointermove', 150, 180, 3)));
    expect(host.querySelector('[data-reconnection-preview="target"]')).not.toBeNull();
    await act(async () => svg.dispatchEvent(pointer('lostpointercapture', 150, 180, 3)));

    expect(currentModel()).toEqual(before);
    expect(useStore.getState().undoStack).toEqual([]);
    expect(host.querySelector('[data-reconnection-preview]')).toBeNull();
    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.captured.size).toBe(0);

    hit = host.querySelector('[data-connection-endpoint-handle="target"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 20, 4)));
    hit = host.querySelector('[data-node-id="node-c"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointermove', 150, 180, 4)));
    await act(async () => {
      svg.dispatchEvent(pointer('pointerup', 150, 180, 4));
      await Promise.resolve();
    });

    expect(currentModel().connections.base.targetId).toBe('node-c');
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Reconnect Connection');
  });

  it('cancels a bendpoint drag without mutation and accepts the next bendpoint drag', async () => {
    const model = connectionEndpointModel();
    model.connections.base.bendpoints = [
      { startX: 0, startY: 60, endX: 0, endY: 60 },
    ];
    replaceModel(model, null);
    setSelection('view', ['base']);
    const svg = await renderEditor();
    emulatePointerCapture(svg);
    const before = structuredClone(currentModel());
    hit = host.querySelector('[data-bendpoint="base@0"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 150, 80, 5)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 160, 120, 5)));
    await act(async () => svg.dispatchEvent(pointer('pointercancel', 160, 120, 5)));

    expect(currentModel()).toEqual(before);
    expect(useStore.getState().undoStack).toEqual([]);

    hit = host.querySelector('[data-bendpoint="base@0"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 150, 80, 6)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 160, 120, 6)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 160, 120, 6)));

    expect(currentModel().connections.base.bendpoints).not.toEqual(
      before.connections.base.bendpoints,
    );
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Edit Bendpoints');
  });

  it('cancels a pan without model mutation and accepts a clean next pan', async () => {
    const svg = await renderEditor();
    const capture = emulatePointerCapture(svg);
    const before = structuredClone(currentModel());
    const viewportGroup = svg.querySelector<SVGGElement>(':scope > g')!;
    const initialTransform = viewportGroup.getAttribute('transform');

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 100, 100, 7, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 140, 150, 7, 1)));
    expect(svg.style.cursor).toBe('grabbing');
    await act(async () => svg.dispatchEvent(pointer('pointercancel', 140, 150, 7, 1)));

    expect(currentModel()).toEqual(before);
    expect(useStore.getState().undoStack).toEqual([]);
    expect(svg.style.cursor).not.toBe('grabbing');
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    const afterCancelledPan = viewportGroup.getAttribute('transform');
    expect(afterCancelledPan).not.toBe(initialTransform);

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 140, 150, 8, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 160, 180, 8, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 160, 180, 8, 1)));

    expect(viewportGroup.getAttribute('transform')).not.toBe(afterCancelledPan);
    expect(svg.style.cursor).not.toBe('grabbing');
  });

  it('ignores a second pointer until the initiating pointer completes', async () => {
    const svg = await renderEditor();
    const capture = emulatePointerCapture(svg);
    const before = structuredClone(currentModel());
    hit = host.querySelector('[data-node-id="node-a"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 11)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 50, 60, 11)));
    hit = host.querySelector('[data-node-id="node-b"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 220, 20, 22)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 260, 70, 22)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 260, 70, 22)));
    await act(async () => svg.dispatchEvent(pointer('pointercancel', 260, 70, 22)));

    expect(currentModel()).toEqual(before);
    expect(useStore.getState().undoStack).toEqual([]);
    expect(capture.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.setPointerCapture).toHaveBeenCalledWith(11);

    hit = host.querySelector('[data-node-id="node-a"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointermove', 60, 70, 11)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 60, 70, 11)));

    expect(currentModel().nodes['node-a'].bounds).not.toEqual(before.nodes['node-a'].bounds);
    expect(currentModel().nodes['node-b'].bounds).toMatchObject({ x: 200, y: 0 });
  });
});
