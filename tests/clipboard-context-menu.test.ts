import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyNodes, copyTreeItems } from '../src/canvas/clipboard';
import {
  showEmptyCanvasContextMenu,
  showViewObjectContextMenu,
} from '../src/canvas/view-editor/contextMenu';
import { extensionRegistry } from '../src/extensions/registry';
import { addNoteToView, addView, createElementOnView, createEmptyModel } from '../src/model/ops';
import {
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { useSettingsStore } from '../src/settings/app-settings';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { ModelTree } from '../src/ui/ModelTree';

let host: HTMLDivElement;
let root: Root;

function menuLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.ctx-label')].map((item) => item.textContent ?? '');
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  extensionRegistry.clearAll();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.querySelectorAll('.ctx-root').forEach((item) => item.remove());
  host.remove();
  resetWorkspaceForTests();
  extensionRegistry.clearAll();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('clipboard context menus', () => {
  it('offers Copy for a selected view object and Paste on an empty view', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Model'), fileName: null });
    const viewId = addView('View');
    const created = createElementOnView(
      'BusinessActor',
      viewId,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      'Actor',
    );
    const session = getModelSession(sessionId)!;
    const settings = useSettingsStore.getState().settings;
    let contextPayload: unknown;
    extensionRegistry.onEvent('local.audit', 'view.contextMenu', (payload) => {
      contextPayload = payload;
    });

    await act(async () => root.render(createElement(ContextMenuHost)));
    await act(async () => showViewObjectContextMenu({
      clientX: 20,
      clientY: 20,
      viewId,
      id: created.nodeId,
      ids: [created.nodeId],
      model: session.store.getState().model!,
      settings,
      modelStore: session.store,
      sessionId,
      startEdit: () => undefined,
    }));

    expect(menuLabels()).toContain('Copy (Ctrl+C)');

    copyNodes([created.nodeId], session.store, sessionId);
    await act(async () => showEmptyCanvasContextMenu({
      clientX: 30,
      clientY: 30,
      viewId,
      parentId: viewId,
      parentAbs: { x: 0, y: 0 },
      point: { x: 100, y: 100 },
      absBounds: new Map(),
      startEdit: () => undefined,
      settings,
      modelStore: session.store,
      sessionId,
      snap: (value) => value,
      zoomBy: () => undefined,
      zoomTo: () => undefined,
      fitToView: () => undefined,
    }));

    expect(menuLabels()).toContain('Paste (Ctrl+V)');
    expect(menuLabels()).toContain('Paste as Reference');
    expect(document.querySelector('.ctx-item.disabled .ctx-label')?.textContent).not.toBe('Paste (Ctrl+V)');
    const referenceLabel = [...document.querySelectorAll<HTMLElement>('.ctx-label')]
      .find((item) => item.textContent === 'Paste as Reference');
    expect(referenceLabel?.closest('.ctx-item')?.classList.contains('disabled')).toBe(false);
    expect(contextPayload).toMatchObject({
      sessionId,
      modelId: session.store.getState().model!.info.id,
      viewId,
    });
  });

  it('offers Copy on transferable tree items and Paste on model roots and folders', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Model'), fileName: null });
    const viewId = addView('View');
    const created = createElementOnView(
      'BusinessActor',
      viewId,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      'Actor',
    );
    const session = getModelSession(sessionId)!;
    const model = session.store.getState().model!;
    const noteId = addNoteToView(
      viewId,
      viewId,
      { x: 180, y: 10, width: 180, height: 80 },
      'Note',
    );
    copyNodes([noteId], session.store, sessionId);

    await act(async () => root.render(createElement(Fragment, null,
      createElement(ContextMenuHost),
      createElement(ModelTree),
    )));

    copyTreeItems(session.store, sessionId, [created.elementId]);
    await act(async () => root.render(createElement(Fragment, null,
      createElement(ContextMenuHost),
      createElement(ModelTree),
    )));

    const openMenu = async (id: string) => {
      const row = host.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
      expect(row).not.toBeNull();
      await act(async () => row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 40,
        clientY: 40,
      })));
    };

    await openMenu(created.elementId);
    expect(menuLabels()).toContain('Copy (Ctrl+C)');

    await openMenu(model.elements[created.elementId].folderId);
    expect(menuLabels()).toContain('Paste (Ctrl+V)');

    await openMenu(model.info.id);
    expect(menuLabels()).toContain('Paste (Ctrl+V)');
    const pasteLabel = [...document.querySelectorAll<HTMLElement>('.ctx-label')]
      .find((item) => item.textContent === 'Paste (Ctrl+V)');
    expect(pasteLabel?.closest('.ctx-item')?.classList.contains('disabled')).toBe(false);
  });

  it('enables root Paste from clipboard state captured after the tree rendered', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Fresh root menu'), fileName: null });
    const viewId = addView('View');
    const created = createElementOnView(
      'BusinessActor',
      viewId,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      'Actor',
    );
    const noteId = addNoteToView(
      viewId,
      viewId,
      { x: 180, y: 10, width: 180, height: 80 },
      'Not tree-pasteable',
    );
    const session = getModelSession(sessionId)!;
    let treePayload: unknown;
    extensionRegistry.onEvent('local.audit', 'tree.contextMenu', (payload) => {
      treePayload = payload;
    });
    copyNodes([noteId], session.store, sessionId);

    await act(async () => root.render(createElement(Fragment, null,
      createElement(ContextMenuHost),
      createElement(ModelTree),
    )));

    copyTreeItems(session.store, sessionId, [created.elementId]);
    const modelRoot = host.querySelector<HTMLElement>(
      `[data-tree-id="${session.store.getState().model!.info.id}"]`,
    );
    expect(modelRoot).not.toBeNull();
    await act(async () => modelRoot!.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 40,
      clientY: 40,
    })));

    const pasteLabel = [...document.querySelectorAll<HTMLElement>('.ctx-label')]
      .find((item) => item.textContent === 'Paste (Ctrl+V)');
    expect(pasteLabel?.closest('.ctx-item')?.classList.contains('disabled')).toBe(false);
    expect(treePayload).toMatchObject({
      sessionId,
      modelId: session.store.getState().model!.info.id,
      targetId: session.store.getState().model!.info.id,
    });
  });
});
