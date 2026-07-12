import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addElement,
  addElementNodeToView,
  addImageToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel, setActiveTool } from '../src/model/store';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { useStore } from '../src/ui/store-hooks';

let host: HTMLDivElement;
let root: Root;
let hit: Element;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('Magic Connector UI'), null);
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

function fixture() {
  const viewId = addView('View');
  const actorId = addElement('BusinessActor', 'Actor');
  const roleId = addElement('BusinessRole', 'Role');
  const actorNodeId = addElementNodeToView(
    viewId,
    actorId,
    viewId,
    { x: 20, y: 20, width: 120, height: 55 },
    false,
  );
  const roleNodeId = addElementNodeToView(
    viewId,
    roleId,
    viewId,
    { x: 240, y: 20, width: 120, height: 55 },
    false,
  );
  return { viewId, actorId, roleId, actorNodeId, roleNodeId };
}

async function renderEditor(viewId: string): Promise<SVGSVGElement> {
  await act(async () => root.render(createElement(
    Fragment,
    null,
    createElement(ContextMenuHost),
    createElement(ViewEditor, { viewId }),
  )));
  const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
  Object.defineProperty(svg, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => hit),
  });
  return svg;
}

function pointer(x: number, y: number, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    ...modifiers,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function pointerMove(x: number, y: number) {
  const event = new MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function menuItem(label: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>('.ctx-item')].find(
    (candidate) => candidate.querySelector(':scope > .ctx-label')?.textContent === label,
  );
  expect(item, `menu item ${label}`).toBeDefined();
  return item!;
}

async function openSubmenu(label: string): Promise<void> {
  await act(async () => {
    menuItem(label).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
}

async function choose(label: string): Promise<void> {
  await act(async () => menuItem(label).click());
}

async function startFrom(svg: SVGSVGElement, nodeId: string): Promise<void> {
  hit = host.querySelector(`[data-node-id="${nodeId}"]`)!;
  await act(async () => svg.dispatchEvent(pointer(40, 40)));
}

describe('Magic Connector canvas workflow', () => {
  it('returns a sticky Note tool to Select when an ordinary canvas menu is escaped', async () => {
    const f = fixture();
    setActiveTool({ kind: 'create-note', sticky: true });
    const svg = await renderEditor(f.viewId);
    hit = svg;
    svg.focus();

    await act(async () => svg.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 180,
    })));
    expect(document.querySelector('.ctx-menu')).not.toBeNull();
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    })));

    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
    expect(document.activeElement === svg).toBe(true);
  });

  it('keeps a sticky Note tool active when an ordinary canvas menu is dismissed outside', async () => {
    const f = fixture();
    const outside = document.createElement('button');
    document.body.append(outside);
    setActiveTool({ kind: 'create-note', sticky: true });
    const svg = await renderEditor(f.viewId);
    hit = svg;

    await act(async () => svg.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 180,
    })));
    await act(async () => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    const activeTool = useStore.getState().activeTool;
    outside.remove();

    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(activeTool).toEqual({ kind: 'create-note', sticky: true });
  });

  it('reuses an existing relationship from the forward group and stays one-shot', async () => {
    const f = fixture();
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Carries work',
    )!;
    setActiveTool({ kind: 'magic-connector' });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = host.querySelector(`[data-node-id="${f.roleNodeId}"]`)!;
    await act(async () => svg.dispatchEvent(pointer(260, 40)));
    await openSubmenu('Forward');
    await openSubmenu('Assignment');
    await choose('Reuse Carries work');

    expect(Object.values(useStore.getState().model!.relationships)).toHaveLength(1);
    expect(Object.values(useStore.getState().model!.connections)[0]).toMatchObject({
      relationshipId,
      sourceId: f.actorNodeId,
      targetId: f.roleNodeId,
    });
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
  });

  it('creates a target on empty canvas, selects it, and opens direct naming', async () => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector' });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = svg;
    await act(async () => svg.dispatchEvent(pointer(500, 180)));
    await openSubmenu('Assignment');
    await openSubmenu('Business');
    await choose('Business Role');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const createdNode = Object.values(useStore.getState().model!.nodes).find(
      (node) => node.id !== f.actorNodeId && node.id !== f.roleNodeId,
    );
    expect(createdNode?.nodeType).toBe('element');
    expect(useStore.getState().selection).toEqual({ source: 'view', ids: [createdNode!.id] });
    expect(host.querySelector<HTMLTextAreaElement>('textarea.direct-edit')?.value).toBe('Business Role');
    expect(Object.values(useStore.getState().model!.relationships)).toHaveLength(1);
    expect(Object.values(useStore.getState().model!.connections)).toHaveLength(1);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])('uses element-first polarity while %s is held', async (_key, modifiers) => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector' });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = svg;
    await act(async () => svg.dispatchEvent(pointer(500, 180, modifiers)));

    expect(menuItem('Strategy')).toBeDefined();
    expect([...document.querySelectorAll<HTMLElement>('.ctx-root > .ctx-menu > .ctx-item')]
      .some((item) => item.textContent?.startsWith('Composition'))).toBe(false);
  });

  it('keeps a sticky Magic Connector selected and Escape returns to Select', async () => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector', sticky: true });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = host.querySelector(`[data-node-id="${f.roleNodeId}"]`)!;
    await act(async () => svg.dispatchEvent(pointer(260, 40)));
    await openSubmenu('Forward');
    await openSubmenu('Assignment');
    await choose('New Assignment');

    expect(useStore.getState().activeTool).toEqual({ kind: 'magic-connector', sticky: true });
    await act(async () => svg.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Escape',
    })));
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
  });

  it('dismisses an open sticky Magic menu with Escape and returns to Select', async () => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector', sticky: true });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = host.querySelector(`[data-node-id="${f.roleNodeId}"]`)!;
    await act(async () => svg.dispatchEvent(pointer(260, 40)));
    expect(document.querySelector('.ctx-menu')).not.toBeNull();

    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    })));

    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
    expect(document.activeElement === svg).toBe(true);
  });

  it('keeps sticky Magic active when an open menu is dismissed outside', async () => {
    const f = fixture();
    const outside = document.createElement('button');
    document.body.append(outside);
    setActiveTool({ kind: 'magic-connector', sticky: true });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = host.querySelector(`[data-node-id="${f.roleNodeId}"]`)!;
    await act(async () => svg.dispatchEvent(pointer(260, 40)));
    expect(document.querySelector('.ctx-menu')).not.toBeNull();

    await act(async () => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));

    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(useStore.getState().activeTool).toEqual({ kind: 'magic-connector', sticky: true });
    outside.remove();
  });

  it('treats a non-connectable image as empty canvas without an invalid target cue', async () => {
    const f = fixture();
    const imageId = addImageToView(
      f.viewId,
      f.viewId,
      { x: 420, y: 140, width: 120, height: 80 },
      '',
    );
    setActiveTool({ kind: 'magic-connector' });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = host.querySelector(`[data-node-id="${imageId}"]`)!;
    await act(async () => svg.dispatchEvent(pointerMove(460, 170)));

    const imageNode = host.querySelector(`[data-node-id="${imageId}"]`)!;
    expect([...imageNode.querySelectorAll('rect')].some(
      (rect) => rect.getAttribute('stroke') === '#c43a3a',
    )).toBe(false);

    await act(async () => svg.dispatchEvent(pointer(460, 170)));
    expect(menuItem('Assignment')).toBeDefined();

  });

  it('Escape during direct naming cancels editing and returns a sticky tool to Select', async () => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector', sticky: true });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = svg;
    await act(async () => svg.dispatchEvent(pointer(500, 180)));
    await openSubmenu('Assignment');
    await openSubmenu('Business');
    await choose('Business Role');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const editor = host.querySelector<HTMLTextAreaElement>('textarea.direct-edit')!;

    await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Escape',
    })));

    expect(host.querySelector('textarea.direct-edit')).toBeNull();
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
  });

  it('restores canvas focus after Enter naming so Escape clears a sticky Magic tool', async () => {
    const f = fixture();
    setActiveTool({ kind: 'magic-connector', sticky: true });
    const svg = await renderEditor(f.viewId);
    await startFrom(svg, f.actorNodeId);

    hit = svg;
    await act(async () => svg.dispatchEvent(pointer(500, 180)));
    await openSubmenu('Assignment');
    await openSubmenu('Business');
    await choose('Business Role');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const editor = host.querySelector<HTMLTextAreaElement>('textarea.direct-edit')!;
    editor.value = 'Named target';

    await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    })));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.querySelector('textarea.direct-edit')).toBeNull();
    expect(document.activeElement === svg).toBe(true);
    expect(useStore.getState().activeTool).toEqual({ kind: 'magic-connector', sticky: true });
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    })));
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
    expect(Object.values(useStore.getState().model!.elements).some(
      (element) => element.name === 'Named target',
    )).toBe(true);
  });
});
