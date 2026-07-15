import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addNoteToView,
  addView,
  deleteViewObjects,
  renameItem,
  setNodeStyle,
} from '../src/model/ops';
import { replaceModel, setActiveTool, setSelection, undo } from '../src/model/store';
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

async function renderEditor(readOnly = false, viewId = 'view'): Promise<SVGSVGElement> {
  await act(async () => root.render(createElement(ViewEditor, { viewId, readOnly })));
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
  it('captures and applies a one-shot Format Painter without changing selection', async () => {
    setNodeStyle(['node-a'], { fillColor: '#123456', lineColor: '#654321' });
    setSelection('view', ['node-b']);
    setActiveTool({ kind: 'format-painter' });
    useStore.setState({ undoStack: [], redoStack: [], dirty: false });
    const svg = await renderEditor();
    emulatePointerCapture(svg);

    hit = host.querySelector('[data-node-id="node-a"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 40)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 10, 10, 40)));

    expect(useStore.getState().activeTool).toMatchObject({
      kind: 'format-painter',
      snapshot: { sourceKind: 'node' },
    });
    expect(useStore.getState().selection).toEqual({ source: 'view', ids: ['node-b'] });

    hit = host.querySelector('[data-node-id="node-b"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 200, 20, 41)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 200, 20, 41)));

    expect(currentModel().nodes['node-b']).toMatchObject({
      fillColor: '#123456',
      lineColor: '#654321',
    });
    expect(useStore.getState().selection).toEqual({ source: 'view', ids: ['node-b'] });
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Apply Format');
  });

  it('keeps a sticky Format Painter snapshot while switching views in one model', async () => {
    const targetViewId = addView('Painter target');
    const targetId = addNoteToView(
      targetViewId,
      targetViewId,
      { x: 20, y: 20, width: 100, height: 50 },
      'Target',
    );
    setNodeStyle(['node-a'], { fillColor: '#abcdef' });
    setActiveTool({ kind: 'format-painter', sticky: true });
    let svg = await renderEditor();
    emulatePointerCapture(svg);
    hit = host.querySelector('[data-node-id="node-a"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 42)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 10, 10, 42)));

    svg = await renderEditor(false, targetViewId);
    emulatePointerCapture(svg);
    hit = host.querySelector(`[data-node-id="${targetId}"]`)!;
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 20, 20, 43)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 20, 20, 43)));

    expect(currentModel().nodes[targetId].fillColor).toBe('#abcdef');
    expect(useStore.getState().activeTool).toMatchObject({
      kind: 'format-painter',
      sticky: true,
      snapshot: { sourceKind: 'node' },
    });
  });

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

  it('clears transient alignment guides when the model changes mid-gesture', async () => {
    const svg = await renderEditor();
    emulatePointerCapture(svg);
    hit = host.querySelector('[data-node-id="node-a"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 48)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 110, 10, 48)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 110, 10, 48)));
    expect(Boolean(svg.querySelector('.alignment-guide'))).toBe(true);

    await act(async () => renameItem('node-c', 'External model change'));

    expect(Boolean(svg.querySelector('.alignment-guide'))).toBe(false);
  });

  it.each(['delete', 'undo'] as const)(
    'cancels a move after an intervening %s and leaves the next gesture clean',
    async (mutation) => {
      if (mutation === 'undo') renameItem('node-c', 'Changed before drag');
      const svg = await renderEditor();
      emulatePointerCapture(svg);
      hit = host.querySelector('[data-node-id="node-a"]')!;

      await act(async () => svg.dispatchEvent(pointer('pointerdown', 10, 10, 50)));
      await act(async () => svg.dispatchEvent(pointer('pointermove', 60, 70, 50)));
      await act(async () => {
        if (mutation === 'delete') deleteViewObjects(['node-a']);
        else undo();
      });
      const afterMutation = currentModel();
      const afterMutationSnapshot = structuredClone(afterMutation);
      const undoLabels = useStore.getState().undoStack.map((transaction) => transaction.label);
      const redoLabels = useStore.getState().redoStack.map((transaction) => transaction.label);

      await act(async () => svg.dispatchEvent(pointer('pointerup', 60, 70, 50)));

      expect(currentModel()).toBe(afterMutation);
      expect(currentModel()).toEqual(afterMutationSnapshot);
      expect(useStore.getState().undoStack.map((transaction) => transaction.label)).toEqual(undoLabels);
      expect(useStore.getState().redoStack.map((transaction) => transaction.label)).toEqual(redoLabels);

      const nodeBBefore = structuredClone(currentModel().nodes['node-b'].bounds);
      hit = host.querySelector('[data-node-id="node-b"]')!;
      await act(async () => svg.dispatchEvent(pointer('pointerdown', 210, 10, 51)));
      await act(async () => svg.dispatchEvent(pointer('pointermove', 250, 60, 51)));
      await act(async () => svg.dispatchEvent(pointer('pointerup', 250, 60, 51)));

      expect(currentModel().nodes['node-b'].bounds).not.toEqual(nodeBBefore);
      expect(useStore.getState().undoStack.at(-1)?.label).toBe('Move');
    },
  );

  it.each(['delete', 'undo'] as const)(
    'cancels a resize after an intervening %s and leaves the next gesture clean',
    async (mutation) => {
      if (mutation === 'undo') renameItem('node-c', 'Changed before drag');
      setSelection('view', ['node-a']);
      const svg = await renderEditor();
      emulatePointerCapture(svg);
      hit = host.querySelector('[data-handle="se"][data-handle-node="node-a"]')!;

      await act(async () => svg.dispatchEvent(pointer('pointerdown', 100, 40, 60)));
      await act(async () => svg.dispatchEvent(pointer('pointermove', 140, 80, 60)));
      await act(async () => {
        if (mutation === 'delete') deleteViewObjects(['node-a']);
        else undo();
      });
      const afterMutation = currentModel();
      const afterMutationSnapshot = structuredClone(afterMutation);
      const undoLabels = useStore.getState().undoStack.map((transaction) => transaction.label);
      const redoLabels = useStore.getState().redoStack.map((transaction) => transaction.label);

      await act(async () => svg.dispatchEvent(pointer('pointerup', 140, 80, 60)));

      expect(currentModel()).toBe(afterMutation);
      expect(currentModel()).toEqual(afterMutationSnapshot);
      expect(useStore.getState().undoStack.map((transaction) => transaction.label)).toEqual(undoLabels);
      expect(useStore.getState().redoStack.map((transaction) => transaction.label)).toEqual(redoLabels);

      await act(async () => setSelection('view', ['node-b']));
      const nodeBBefore = structuredClone(currentModel().nodes['node-b'].bounds);
      hit = host.querySelector('[data-handle="se"][data-handle-node="node-b"]')!;
      await act(async () => svg.dispatchEvent(pointer('pointerdown', 300, 40, 61)));
      await act(async () => svg.dispatchEvent(pointer('pointermove', 330, 70, 61)));
      await act(async () => svg.dispatchEvent(pointer('pointerup', 330, 70, 61)));

      expect(currentModel().nodes['node-b'].bounds).not.toEqual(nodeBBefore);
      expect(useStore.getState().undoStack.at(-1)?.label).toBe('Move');
    },
  );

  it('updates click-click connector feedback between pointer gestures and clears it on leave', async () => {
    const svg = await renderEditor();
    emulatePointerCapture(svg);
    const initialConnectionIds = new Set(Object.keys(currentModel().connections));
    await act(async () => setActiveTool({ kind: 'create-plain-connection' }));
    hit = host.querySelector('[data-node-id="node-a"]')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 50, 20, 30)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 50, 20, 30)));

    const pending = svg.querySelector<SVGLineElement>('line[stroke-dasharray="5 3"]')!;
    expect(pending).not.toBeNull();
    const sourceX = pending.getAttribute('x1');
    const initialTargetX = pending.getAttribute('x2');
    hit = host.querySelector('[data-node-id="node-b"]')!;
    await act(async () => svg.dispatchEvent(pointer('pointermove', 250, 20, 30)));

    expect(pending.getAttribute('x2')).not.toBe(initialTargetX);
    expect(hit.querySelector('rect[stroke="#1d9e46"]')).not.toBeNull();

    await act(async () => svg.dispatchEvent(pointer('pointerout', 250, 20, 30)));
    expect(pending.getAttribute('x2')).toBe(sourceX);
    expect(hit.querySelector('rect[stroke="#1d9e46"]')).toBeNull();

    await act(async () => svg.dispatchEvent(pointer('pointermove', 250, 20, 30)));
    await act(async () => svg.dispatchEvent(pointer('pointerdown', 250, 20, 30)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 250, 20, 30)));

    expect(Object.values(currentModel().connections).find((connection) => (
      !initialConnectionIds.has(connection.id)
    ))).toMatchObject({ sourceId: 'node-a', targetId: 'node-b' });
  });
});

describe('read-only view pointer cancellation', () => {
  it('clears middle-button pan on lost capture without recursion and accepts the next pan', async () => {
    const svg = await renderEditor(true);
    const capture = emulatePointerCapture(svg);
    const viewportGroup = svg.querySelector<SVGGElement>(':scope > g')!;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 100, 100, 40, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 140, 150, 40, 1)));
    const beforeLostCapture = viewportGroup.getAttribute('transform');
    await act(async () => svg.dispatchEvent(pointer('lostpointercapture', 140, 150, 40, 1)));

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.captured.size).toBe(0);
    await act(async () => svg.dispatchEvent(pointer('pointermove', 180, 190, 40, 1)));
    expect(viewportGroup.getAttribute('transform')).toBe(beforeLostCapture);

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 180, 190, 41, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 200, 220, 41, 1)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 200, 220, 41, 1)));
    expect(viewportGroup.getAttribute('transform')).not.toBe(beforeLostCapture);
  });
});
