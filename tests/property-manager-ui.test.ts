import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capturePropertyManagerSession,
  inspectPropertyUsage,
} from '../src/model/property-manager';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, type ModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
  setModelSessionFileHandle,
} from '../src/model/workspace';
import { PropertiesManagerDialog } from '../src/ui/PropertiesManagerDialog';
import { navigateToPropertyOccurrence } from '../src/ui/property-manager-navigation';
import { onRevealRequest } from '../src/ui/tree-bus';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { Toolbar } from '../src/ui/Toolbar';

function fixture(modelName = 'Property model'): ModelState {
  const model = createEmptyModel(modelName);
  model.info.id = 'shared-model';
  model.info.properties = [
    { key: 'shared', value: 'model value' },
    { key: 'existing', value: 'collision value' },
    { key: '', value: 'blank value' },
  ];
  const business = Object.values(model.folders).find(
    (folder) => folder.folderType === 'business',
  )!;
  const views = Object.values(model.folders).find(
    (folder) => folder.folderType === 'diagrams',
  )!;
  business.properties = [{ key: 'shared', value: 'folder value' }];
  model.elements['shared-object'] = {
    id: 'shared-object',
    kind: 'element',
    type: 'BusinessActor',
    name: 'Actor',
    documentation: '',
    properties: [
      { key: 'shared', value: 'same' },
      { key: 'shared', value: 'same' },
    ],
    profileIds: [],
    folderId: business.id,
  };
  business.itemIds.push('shared-object');
  model.views['view-a'] = {
    id: 'view-a',
    kind: 'view',
    name: 'Working view',
    documentation: '',
    properties: [{ key: 'shared', value: 'view value' }],
    folderId: views.id,
    childIds: ['note-a'],
  };
  views.itemIds.push('view-a');
  model.nodes['note-a'] = {
    id: 'note-a',
    viewId: 'view-a',
    parentId: 'view-a',
    nodeType: 'note',
    content: 'Context',
    properties: [{ key: 'shared', value: 'note value' }],
    bounds: { x: 20, y: 30, width: 120, height: 60 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
  };
  return model;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetWorkspaceForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  resetWorkspaceForTests();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function renderDialog(store: ModelStore, onClose = vi.fn()) {
  await act(async () => root.render(createElement(PropertiesManagerDialog, {
    capture: capturePropertyManagerSession(store),
    onClose,
  })));
  return onClose;
}

async function setInput(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label)!;
}

function selectKey(key: string) {
  const label = key === '' ? '(blank)' : key;
  return document.querySelector<HTMLButtonElement>(
    `button[aria-label^="Inspect property key ${label}"]`,
  )!;
}

describe('global properties manager dialog', () => {
  it('shows ordered usage details and applies a mandatory rename preview in one action', async () => {
    const store = createModelStore({ model: fixture() });
    const onClose = await renderDialog(store);
    const dialog = document.querySelector('[role="dialog"]')!;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect((document.activeElement as HTMLInputElement)?.name).toBe('propertyKeySearch');
    const summary = document.querySelector('table[aria-label="Property key summary"]')!;
    expect(summary.textContent).toContain('shared');
    expect(summary.textContent).toContain('6');
    expect(summary.textContent).toContain('5');
    expect(summary.textContent).toContain('(blank)');
    const details = document.querySelector('table[aria-label="Property occurrence details"]')!;
    expect(details.textContent).toContain('model value');
    expect(details.textContent).toContain('note value');
    expect(button('Apply rename').disabled).toBe(true);

    await act(async () => button('Stage rename').click());
    await setInput('newPropertyKey', 'renamed');
    expect(button('Apply rename').disabled).toBe(true);
    await act(async () => button('Preview').click());

    const preview = document.querySelector('table[aria-label="Property mutation preview"]')!;
    expect(preview.textContent).toContain('model value');
    expect(preview.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(button('Apply rename').disabled).toBe(false);
    await act(async () => button('Apply rename').click());

    expect(inspectPropertyUsage(capturePropertyManagerSession(store)).map((entry) => entry.key))
      .toEqual(['renamed', 'existing', '']);
    expect(store.getState().model!.elements['shared-object'].properties).toEqual([
      { key: 'renamed', value: 'same' },
      { key: 'renamed', value: 'same' },
    ]);
    expect(store.getState().undoStack.at(-1)?.label).toBe('Rename Property Key');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('searches the blank display label without changing exact key identity', async () => {
    await renderDialog(createModelStore({ model: fixture() }));
    await setInput('propertyKeySearch', 'BLANK');

    const rows = document.querySelectorAll('table[aria-label="Property key summary"] tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('(blank)');
    expect(selectKey('')).not.toBeNull();
  });

  it('stages only one operation and requires collision acknowledgement plus a fresh preview', async () => {
    const store = createModelStore({ model: fixture() });
    await renderDialog(store);
    await act(async () => button('Stage rename').click());
    expect(document.querySelector('input[name="newPropertyKey"]')).not.toBeNull();
    await setInput('newPropertyKey', 'existing');
    await act(async () => button('Preview').click());

    expect(document.querySelector('[role="alert"]')?.textContent).toContain('already exists');
    expect(button('Apply rename').disabled).toBe(true);
    const acknowledgement = document.querySelector<HTMLInputElement>(
      'input[aria-label="Acknowledge property key collision"]',
    )!;
    await act(async () => acknowledgement.click());
    expect(document.querySelector('table[aria-label="Property mutation preview"]')).toBeNull();
    expect(button('Apply rename').disabled).toBe(true);
    await act(async () => button('Preview').click());
    expect(button('Apply rename').disabled).toBe(false);

    await act(async () => button('Stage delete').click());
    expect(document.querySelector('input[name="newPropertyKey"]')).toBeNull();
    expect(document.querySelector('table[aria-label="Property mutation preview"]')).toBeNull();
    expect(button('Apply delete').disabled).toBe(true);
  });

  it('previews delete but cancel leaves the model untouched', async () => {
    const store = createModelStore({ model: fixture() });
    const source = store.getState().model;
    const onClose = await renderDialog(store);
    await act(async () => button('Stage delete').click());
    await act(async () => button('Preview').click());
    expect(document.querySelectorAll(
      'table[aria-label="Property mutation preview"] tbody tr',
    )).toHaveLength(6);

    await act(async () => button('Cancel').click());
    expect(store.getState().model).toBe(source);
    expect(store.getState().undoStack).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps inspection, preview, and navigation available read-only while disabling apply', async () => {
    const store = createModelStore({ model: fixture(), readOnly: true });
    await renderDialog(store);
    await act(async () => button('Stage delete').click());
    await act(async () => button('Preview').click());

    expect(document.querySelector('table[aria-label="Property mutation preview"]')).not.toBeNull();
    expect(button('Apply delete').disabled).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Read-only');
    const navigate = document.querySelector<HTMLButtonElement>('.property-manager-navigate')!;
    expect(navigate.disabled).toBe(false);
    await act(async () => navigate.click());
    expect(store.getState().selection.ids).not.toHaveLength(0);
    expect(store.getState().undoStack).toEqual([]);
  });

  it('uses unique contextual names for duplicate occurrence navigation controls', async () => {
    await renderDialog(createModelStore({ model: fixture() }));
    const labels = [...document.querySelectorAll<HTMLButtonElement>('.property-manager-navigate')]
      .map((control) => control.getAttribute('aria-label'));

    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(6);
    expect(labels.every((label) => label?.includes('shared'))).toBe(true);
  });

  it('contains focus and isolates background app shortcuts without consuming native editing keys', async () => {
    const backgroundOperation = vi.fn();
    window.addEventListener('keydown', backgroundOperation);
    try {
      await renderDialog(createModelStore({ model: fixture() }));
      const search = document.querySelector<HTMLInputElement>('input[name="propertyKeySearch"]')!;
      const cancel = button('Cancel');
      expect(document.activeElement).toBe(search);
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey: true, cancelable: true,
      })));
      expect(document.activeElement).toBe(cancel);

      for (const event of [
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 's', ctrlKey: true }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'o', metaKey: true }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true }),
      ]) {
        cancel.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(event.key !== 'Delete');
      }
      expect(backgroundOperation).not.toHaveBeenCalled();

      const nativeUndo = new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'z', ctrlKey: true,
      });
      search.dispatchEvent(nativeUndo);
      expect(nativeUndo.defaultPrevented).toBe(false);
    } finally {
      window.removeEventListener('keydown', backgroundOperation);
    }
  });

  it('invalidates the manager on model or activation changes but not navigation or file metadata', async () => {
    const firstId = addModelSession({ id: 'first', model: fixture(), fileName: null });
    const first = getModelSession(firstId)!;
    const onClose = await renderDialog(first.store);

    await act(async () => first.store.setState({
      selection: { source: 'tree', ids: ['shared-object'] },
      openViewIds: ['view-a'],
      activeViewId: 'view-a',
    }));
    setModelSessionFileHandle(firstId, null);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => first.store.transact('External', (draft) => {
      draft.info.documentation = 'changed';
    }));
    expect(onClose).toHaveBeenCalledOnce();

    onClose.mockClear();
    await act(async () => root.render(createElement(PropertiesManagerDialog, {
      capture: capturePropertyManagerSession(first.store),
      onClose,
    })));
    await act(async () => {
      addModelSession({ id: 'second', model: fixture('Second'), fileName: null });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('global property manager entry points and navigation', () => {
  it('opens from the productivity toolbar and restores focus on close', async () => {
    addModelSession({ id: 'toolbar', model: fixture(), fileName: null });
    await act(async () => root.render(createElement(Toolbar)));
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Manage model properties"]',
    )!;
    expect(trigger).not.toBeNull();
    trigger.focus();
    await act(async () => trigger.click());
    expect((document.activeElement as HTMLInputElement)?.name).toBe('propertyKeySearch');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', cancelable: true,
    })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens from the Properties tab', async () => {
    const id = addModelSession({ id: 'properties-panel', model: fixture(), fileName: null });
    getModelSession(id)!.store.setState({ selection: { source: 'tree', ids: ['shared-object'] } });
    await act(async () => root.render(createElement(PropertiesPanel)));
    await act(async () => button('Properties').click());
    const trigger = button('Manage all model properties');
    expect(trigger).not.toBeNull();
    await act(async () => trigger.click());
    expect(document.querySelector('table[aria-label="Property key summary"]')).not.toBeNull();
  });

  it('keeps the Properties tab entry available when the selected object has no local properties', async () => {
    const model = fixture();
    model.nodes['image-a'] = {
      id: 'image-a',
      viewId: 'view-a',
      parentId: 'view-a',
      nodeType: 'image',
      imagePath: 'images/example.png',
      bounds: { x: 20, y: 30, width: 120, height: 60 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
    };
    model.views['view-a'].childIds.push('image-a');
    const id = addModelSession({ id: 'properties-panel-image', model, fileName: null });
    getModelSession(id)!.store.setState({ selection: { source: 'view', ids: ['image-a'] } });
    await act(async () => root.render(createElement(PropertiesPanel)));
    await act(async () => button('Properties').click());

    expect(button('Manage all model properties')).toBeInstanceOf(HTMLButtonElement);
    expect(host.textContent).toContain('No properties for this selection.');
  });

  it('navigates tree and view occurrences only in the captured session when IDs collide', () => {
    const firstId = addModelSession({ id: 'nav-first', model: fixture('First'), fileName: null });
    addModelSession({ id: 'nav-second', model: fixture('Second'), fileName: null });
    activateModelSession(firstId);
    const first = getModelSession(firstId)!;
    const capture = capturePropertyManagerSession(first.store);
    const usage = inspectPropertyUsage(capture).find((entry) => entry.key === 'shared')!;
    const tree = usage.occurrences.find((entry) => entry.ownerId === 'shared-object')!;
    const note = usage.occurrences.find((entry) => entry.ownerId === 'note-a')!;
    let reveal: { objectId: string; sessionId: string | null } | undefined;
    const unsubscribe = onRevealRequest((objectId, sessionId) => {
      reveal = { objectId, sessionId: sessionId ?? null };
    });

    expect(navigateToPropertyOccurrence(capture, tree.id)).toBe(true);
    expect(first.store.getState().selection).toEqual({ source: 'tree', ids: ['shared-object'] });
    expect(reveal).toEqual({ objectId: 'shared-object', sessionId: firstId });
    expect(navigateToPropertyOccurrence(capture, note.id)).toBe(true);
    expect(first.store.getState().activeViewId).toBe('view-a');
    expect(first.store.getState().selection).toEqual({ source: 'view', ids: ['note-a'] });
    expect(getModelSession('nav-second')!.store.getState().selection.ids).toEqual([]);
    unsubscribe();
  });
});
