import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { copyNodes } from '../src/canvas/clipboard';
import { addElement, addView, createElementOnView, createEmptyModel } from '../src/model/ops';
import { ModelStoreProvider, openView, setSelection } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  resetWorkspaceForTests();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function buildInactiveEditor() {
  const sourceId = addModelSession({ model: createEmptyModel('Source'), fileName: null });
  const viewId = addView('Source View');
  const created = createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 10, y: 10, width: 120, height: 55 },
    'Actor',
  );
  const source = getModelSession(sourceId)!;
  setSelection('view', [created.nodeId], source.store);

  const activeId = addModelSession({ model: createEmptyModel('Other active model'), fileName: null });
  const active = getModelSession(activeId)!;
  return { source, active, viewId, nodeId: created.nodeId };
}

async function renderEditor(source: ReturnType<typeof buildInactiveEditor>['source'], viewId: string) {
  await act(async () => root.render(
    createElement(
      ModelStoreProvider,
      {
        store: source.store,
        children: createElement(ViewEditor, { viewId }),
      },
    ),
  ));
  const svg = host.querySelector<SVGSVGElement>('svg.view-svg');
  expect(svg).not.toBeNull();
  return svg!;
}

describe('view keyboard shortcuts', () => {
  it('Delete mutates the view-owning model even when another model is globally active', async () => {
    const fixture = buildInactiveEditor();
    const svg = await renderEditor(fixture.source, fixture.viewId);

    await act(async () => svg.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Delete',
    })));

    expect(fixture.source.store.getState().model!.nodes[fixture.nodeId]).toBeUndefined();
    expect(Object.keys(fixture.active.store.getState().model!.nodes)).toHaveLength(0);
  });

  it('Ctrl+D duplicates in the view-owning model even when another model is globally active', async () => {
    const fixture = buildInactiveEditor();
    const svg = await renderEditor(fixture.source, fixture.viewId);

    await act(async () => svg.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'd',
      ctrlKey: true,
    })));

    expect(Object.keys(fixture.source.store.getState().model!.nodes)).toHaveLength(2);
    expect(Object.keys(fixture.source.store.getState().model!.elements)).toHaveLength(2);
    expect(Object.keys(fixture.active.store.getState().model!.nodes)).toHaveLength(0);
  });

  it('Delete works for the active view when keyboard focus is outside the SVG', async () => {
    const fixture = buildInactiveEditor();
    activateModelSession(fixture.source.id);
    openView(fixture.viewId, fixture.source.store);
    await renderEditor(fixture.source, fixture.viewId);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Delete',
    })));

    expect(fixture.source.store.getState().model!.nodes[fixture.nodeId]).toBeUndefined();
  });

  it('Ctrl+D works for the active view when keyboard focus is outside the SVG', async () => {
    const fixture = buildInactiveEditor();
    activateModelSession(fixture.source.id);
    openView(fixture.viewId, fixture.source.store);
    await renderEditor(fixture.source, fixture.viewId);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'd',
      ctrlKey: true,
    })));

    expect(Object.keys(fixture.source.store.getState().model!.nodes)).toHaveLength(2);
    expect(Object.keys(fixture.source.store.getState().model!.elements)).toHaveLength(2);
  });

  it('drops tree items into the view-owning model without a target pointer activation', async () => {
    const sourceId = addModelSession({ model: createEmptyModel('Drop target'), fileName: null });
    activateModelSession(sourceId);
    const viewId = addView('Target View');
    const elementId = addElement('BusinessActor', 'Twin actor');
    const source = getModelSession(sourceId)!;
    const twinId = addModelSession({
      model: structuredClone(source.store.getState().model!),
      fileName: null,
    });
    const twin = getModelSession(twinId)!;
    const svg = await renderEditor(source, viewId);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      clientX: { value: 100 },
      clientY: { value: 100 },
      dataTransfer: {
        value: {
          types: ['application/x-archi-ids'],
          getData: () => JSON.stringify([elementId]),
        },
      },
    });

    await act(async () => svg.dispatchEvent(drop));

    expect(Object.values(source.store.getState().model!.nodes)).toHaveLength(1);
    expect(Object.values(twin.store.getState().model!.nodes)).toHaveLength(0);
  });

  it('focuses the SVG after an empty-canvas pointerdown so Ctrl+V reaches the view', async () => {
    const fixture = buildInactiveEditor();
    activateModelSession(fixture.source.id);
    openView(fixture.viewId, fixture.source.store);
    copyNodes([fixture.nodeId], fixture.source.store, fixture.source.id);
    const svg = await renderEditor(fixture.source, fixture.viewId);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => svg),
    });
    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 500,
      clientY: 500,
    });
    Object.defineProperties(pointerDown, {
      pointerId: { value: 1 },
    });

    await act(async () => svg.dispatchEvent(pointerDown));

    expect(document.activeElement === svg).toBe(true);
    const before = Object.keys(fixture.source.store.getState().model!.nodes).length;
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'v',
      ctrlKey: true,
    })));
    expect(Object.keys(fixture.source.store.getState().model!.nodes)).toHaveLength(before + 1);

    Reflect.deleteProperty(document, 'elementFromPoint');
    outside.remove();
  });
});
