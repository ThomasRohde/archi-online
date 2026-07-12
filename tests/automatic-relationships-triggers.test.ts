import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addElement,
  addElementNodeToView,
  addGroupToView,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel, setActiveTool, setSelection } from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { AppDialogHost } from '../src/ui/AppDialog';
import { useStore } from '../src/ui/store-hooks';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('ARM triggers'), null);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
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

function model() {
  return useStore.getState().model!;
}

function fixture(childCount = 0) {
  const viewId = addView('View');
  const parentElementId = addElement('ApplicationComponent', 'Parent');
  const parentNodeId = addElementNodeToView(
    viewId,
    parentElementId,
    viewId,
    { x: 0, y: 0, width: 320, height: 280 },
    false,
  );
  const childNodeIds: string[] = [];
  for (let index = 0; index < childCount; index++) {
    const elementId = addElement('ApplicationComponent', `Child ${index + 1}`);
    childNodeIds.push(
      addElementNodeToView(
        viewId,
        elementId,
        viewId,
        { x: 420, y: 20 + index * 90, width: 120, height: 55 },
        false,
      ),
    );
  }
  return { viewId, parentNodeId, childNodeIds };
}

async function renderEditor(viewId: string): Promise<SVGSVGElement> {
  await act(async () => {
    root.render(
      createElement(
        Fragment,
        null,
        createElement(AppDialogHost),
        createElement(ViewEditor, { viewId }),
      ),
    );
  });
  const svg = host.querySelector<SVGSVGElement>('svg.view-svg');
  expect(svg).not.toBeNull();
  Object.defineProperty(svg, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  return svg!;
}

function pointer(type: string, x: number, y: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function applyButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent === 'Apply',
  );
}

describe('automatic relationship UI triggers', () => {
  it('stages palette creation until the chooser applies it atomically', async () => {
    const { viewId, parentNodeId } = fixture();
    const svg = await renderEditor(viewId);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => svg),
    });
    setActiveTool({ kind: 'create-element', type: 'ApplicationComponent' });
    const beforeUndo = useStore.getState().undoStack.length;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 100, 100)));

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(Object.keys(model().elements)).toHaveLength(1);
    expect(Object.keys(model().nodes)).toHaveLength(1);

    await act(async () => {
      applyButton()!.click();
      await Promise.resolve();
    });

    const child = Object.values(model().nodes).find((node) => node.id !== parentNodeId);
    expect(child?.parentId).toBe(parentNodeId);
    expect(Object.keys(model().elements)).toHaveLength(2);
    expect(Object.keys(model().relationships)).toHaveLength(1);
    expect(Object.keys(model().connections)).toHaveLength(1);
    expect(useStore.getState().undoStack).toHaveLength(beforeUndo + 1);
  });

  it('stages a model-tree drop and Cancel leaves the model unchanged', async () => {
    const { viewId } = fixture();
    const treeElementId = addElement('ApplicationComponent', 'Tree Child');
    const svg = await renderEditor(viewId);
    const before = structuredClone(model());
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      clientX: { value: 100 },
      clientY: { value: 100 },
      dataTransfer: {
        value: {
          types: ['application/x-archi-ids'],
          getData: () => JSON.stringify([treeElementId]),
        },
      },
    });

    await act(async () => svg.dispatchEvent(drop));

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(model()).toEqual(before);
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent === 'Cancel',
    );
    await act(async () => {
      cancel!.click();
      await Promise.resolve();
    });
    expect(model()).toEqual(before);
  });

  it('offers one choice per moved child and applies the multi-selection as one undo step', async () => {
    const { viewId, parentNodeId, childNodeIds } = fixture(2);
    setSelection('view', childNodeIds);
    const svg = await renderEditor(viewId);
    const firstChild = host.querySelector(`[data-node-id="${childNodeIds[0]}"]`)!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => firstChild),
    });
    const beforeUndo = useStore.getState().undoStack.length;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 440, 40)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 100, 80)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 90, 80)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 90, 80)));

    expect(document.querySelectorAll('[role="dialog"] select')).toHaveLength(2);
    expect(childNodeIds.map((id) => model().nodes[id].parentId)).toEqual([viewId, viewId]);

    await act(async () => {
      applyButton()!.click();
      await Promise.resolve();
    });

    expect(childNodeIds.map((id) => model().nodes[id].parentId)).toEqual([
      parentNodeId,
      parentNodeId,
    ]);
    expect(Object.keys(model().relationships)).toHaveLength(2);
    expect(useStore.getState().undoStack).toHaveLength(beforeUndo + 1);
  });

  it('keeps an ordinary reposition inside the same parent on the direct move path', async () => {
    const { viewId, parentNodeId } = fixture();
    const childElementId = addElement('ApplicationComponent', 'Nested Child');
    const childNodeId = addElementNodeToView(
      viewId,
      childElementId,
      parentNodeId,
      { x: 20, y: 20, width: 120, height: 55 },
      false,
    );
    setSelection('view', [childNodeId]);
    const svg = await renderEditor(viewId);
    const child = host.querySelector(`[data-node-id="${childNodeId}"]`)!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => child),
    });
    const beforeUndo = useStore.getState().undoStack.length;

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 40, 40)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 80, 80)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 90, 90)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 90, 90)));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(model().nodes[childNodeId].parentId).toBe(parentNodeId);
    expect(model().nodes[childNodeId].bounds).not.toEqual({
      x: 20,
      y: 20,
      width: 120,
      height: 55,
    });
    expect(Object.keys(model().relationships)).toHaveLength(0);
    expect(useStore.getState().undoStack).toHaveLength(beforeUndo + 1);
  });

  it('keeps reparenting into a non-element Group on the direct move path', async () => {
    const viewId = addView('Group View');
    const groupId = addGroupToView(viewId, viewId, {
      x: 0,
      y: 0,
      width: 320,
      height: 260,
    });
    const childElementId = addElement('ApplicationComponent', 'Group Child');
    const childNodeId = addElementNodeToView(
      viewId,
      childElementId,
      viewId,
      { x: 420, y: 20, width: 120, height: 55 },
      false,
    );
    setSelection('view', [childNodeId]);
    const svg = await renderEditor(viewId);
    const child = host.querySelector(`[data-node-id="${childNodeId}"]`)!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => child),
    });

    await act(async () => svg.dispatchEvent(pointer('pointerdown', 440, 40)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 100, 80)));
    await act(async () => svg.dispatchEvent(pointer('pointermove', 90, 80)));
    await act(async () => svg.dispatchEvent(pointer('pointerup', 90, 80)));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(model().nodes[childNodeId].parentId).toBe(groupId);
    expect(Object.keys(model().relationships)).toHaveLength(0);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Move');
  });

  it('keeps a root-level model-tree drop on the direct Add to View path', async () => {
    const viewId = addView('Root Drop');
    const treeElementId = addElement('ApplicationComponent', 'Root Child');
    const svg = await renderEditor(viewId);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      clientX: { value: 100 },
      clientY: { value: 100 },
      dataTransfer: {
        value: {
          types: ['application/x-archi-ids'],
          getData: () => JSON.stringify([treeElementId]),
        },
      },
    });

    await act(async () => {
      svg.dispatchEvent(drop);
      await Promise.resolve();
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(Object.values(model().nodes)).toHaveLength(1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Add to View');
  });
});
