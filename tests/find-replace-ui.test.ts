import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureFindReplaceSession,
  previewFindReplace,
} from '../src/model/find-replace';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, type ModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
  setModelSessionFileHandle,
  workspaceStore,
} from '../src/model/workspace';
import { FindReplaceDialog } from '../src/ui/FindReplaceDialog';
import { navigateToFindReplaceRow } from '../src/ui/find-replace-navigation';
import { onRevealRequest } from '../src/ui/tree-bus';
import { Toolbar } from '../src/ui/Toolbar';

function fixture(modelName = 'Alpha Alpha'): ModelState {
  const model = createEmptyModel(modelName);
  model.info.id = 'shared-model';
  const business = Object.values(model.folders).find((folder) => folder.folderType === 'business')!;
  const views = Object.values(model.folders).find((folder) => folder.folderType === 'diagrams')!;
  model.elements['shared-object'] = {
    id: 'shared-object',
    kind: 'element',
    type: 'BusinessActor',
    name: 'Alpha actor',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: business.id,
  };
  business.itemIds.push('shared-object');
  model.views['view-a'] = {
    id: 'view-a',
    kind: 'view',
    name: 'Working view',
    documentation: '',
    properties: [],
    folderId: views.id,
    childIds: ['note-a'],
  };
  model.views['view-b'] = {
    id: 'view-b',
    kind: 'view',
    name: 'Other view',
    documentation: '',
    properties: [],
    folderId: views.id,
    childIds: [],
  };
  views.itemIds.push('view-a', 'view-b');
  model.nodes['note-a'] = {
    id: 'note-a',
    viewId: 'view-a',
    parentId: 'view-a',
    nodeType: 'note',
    content: 'Alpha note',
    properties: [],
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
  await act(async () => root.render(createElement(FindReplaceDialog, {
    capture: captureFindReplaceSession(store),
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

describe('find and replace dialog', () => {
  it('is accessible, previews selected rows, and applies through one action', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const onClose = await renderDialog(store);
    const dialog = document.querySelector('[role="dialog"]')!;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.querySelector('input[name="find"]')).not.toBeNull();
    expect(document.querySelector('input[name="replace"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[value="model"]')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="searchName"]')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="searchDocumentation"]')?.checked)
      .toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="searchPropertyValues"]')?.checked)
      .toBe(false);
    expect(button('Apply').disabled).toBe(true);

    await setInput('find', 'Alpha');
    await setInput('replace', 'Omega');
    await act(async () => button('Preview').click());

    const table = document.querySelector('table[aria-label="Find and replace preview"]');
    expect(table).not.toBeNull();
    expect(table?.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')?.checked).toBe(true);
    expect(table?.textContent).toContain('Alpha Alpha');
    expect(table?.textContent).toContain('Omega Omega');
    expect(table?.textContent).toContain('2');
    expect(button('Apply').disabled).toBe(false);

    await act(async () => button('Apply').click());
    expect(store.getState().model!.info.name).toBe('Omega Omega');
    expect(store.getState().undoStack.at(-1)?.label).toBe('Find and Replace');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels without preview or mutation', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const source = store.getState().model;
    const onClose = await renderDialog(store);

    await act(async () => button('Cancel').click());

    expect(store.getState().model).toBe(source);
    expect(store.getState().undoStack).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('focuses Find and closes on Escape without mutation', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const onClose = await renderDialog(store);

    expect((document.activeElement as HTMLInputElement)?.name).toBe('find');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledOnce();
    expect(store.getState().undoStack).toEqual([]);
  });

  it('contains keyboard focus within the modal', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    await renderDialog(store);
    const find = document.querySelector<HTMLInputElement>('input[name="find"]')!;
    const previewButton = button('Preview');

    expect(document.activeElement).toBe(find);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    })));
    expect(document.activeElement).toBe(previewButton);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    })));
    expect(document.activeElement).toBe(find);
  });

  it('isolates background shortcuts from dialog action controls', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const backgroundOperation = vi.fn();
    window.addEventListener('keydown', backgroundOperation);
    try {
      await renderDialog(store);
      await setInput('find', 'Alpha');
      await act(async () => button('Preview').click());
      const navigate = document.querySelector<HTMLButtonElement>('.find-replace-navigate')!;
      const shortcuts = [
        { target: button('Preview'), key: 'Delete' },
        { target: button('Cancel'), key: 'd', ctrlKey: true },
        { target: navigate, key: 'z', ctrlKey: true },
        { target: button('Preview'), key: 'o', ctrlKey: true },
        { target: button('Cancel'), key: 's', ctrlKey: true },
      ];

      for (const shortcut of shortcuts) {
        shortcut.target.focus();
        await act(async () => shortcut.target.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: shortcut.key,
          ctrlKey: shortcut.ctrlKey,
        })));
      }

      expect(backgroundOperation).not.toHaveBeenCalled();
      expect(store.getState().undoStack).toEqual([]);
    } finally {
      window.removeEventListener('keydown', backgroundOperation);
    }
  });

  it('prevents app shortcut defaults without consuming native dialog editing keys', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    await renderDialog(store);
    const previewButton = button('Preview');
    const findInput = document.querySelector<HTMLInputElement>('input[name="find"]')!;
    const appShortcuts = [
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 's', ctrlKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'o', metaKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'd', ctrlKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'y', metaKey: true }),
    ];

    for (const event of appShortcuts) {
      previewButton.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }

    const nativeEditingKeys = [
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'y', metaKey: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', ctrlKey: true }),
    ];
    for (const event of nativeEditingKeys) {
      findInput.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
      previewButton.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('gives duplicate property rows unique contextual control names', async () => {
    const model = fixture();
    model.elements['shared-object'].properties = [
      { key: 'tag', value: 'Alpha' },
      { key: 'tag', value: 'Alpha' },
    ];
    await renderDialog(createModelStore({ model, activeViewId: 'view-a' }));
    await setInput('find', 'Alpha');
    await act(async () => document.querySelector<HTMLInputElement>(
      'input[name="searchPropertyValues"]',
    )!.click());
    await act(async () => button('Preview').click());

    const propertyRows = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .filter((row) => row.textContent?.includes('Property: tag'));
    const checkboxLabels = propertyRows.map((row) => row.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!.getAttribute('aria-label'));
    const navigationLabels = propertyRows.map((row) => row.querySelector<HTMLButtonElement>(
      '.find-replace-navigate',
    )!.getAttribute('aria-label'));

    expect(propertyRows).toHaveLength(2);
    expect(new Set(checkboxLabels).size).toBe(2);
    expect(new Set(navigationLabels).size).toBe(2);
    expect(checkboxLabels.every((label) => label?.includes('Property: tag')
      && label.includes('Alpha'))).toBe(true);
    expect(navigationLabels.every((label) => label?.includes('Property: tag')
      && label.includes('Alpha'))).toBe(true);
  });

  it('restores focus to the toolbar action after closing', async () => {
    addModelSession({ id: 'focus-session', model: fixture(), fileName: null });
    await act(async () => root.render(createElement(Toolbar)));
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Find and replace"]',
    )!;
    trigger.focus();

    await act(async () => trigger.click());
    expect((document.activeElement as HTMLInputElement)?.name).toBe('find');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('invalidates preview on criteria, model, and active-view changes', async () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    await renderDialog(store);
    await setInput('find', 'Alpha');
    await act(async () => button('Preview').click());
    expect(document.querySelector('table[aria-label="Find and replace preview"]')).not.toBeNull();

    await setInput('replace', 'Changed');
    expect(document.querySelector('table[aria-label="Find and replace preview"]')).toBeNull();
    expect(button('Apply').disabled).toBe(true);

    await act(async () => button('Preview').click());
    await act(async () => store.transact('External', (draft) => {
      draft.info.documentation = 'External change';
    }));
    expect(document.querySelector('table[aria-label="Find and replace preview"]')).toBeNull();

    await act(async () => button('Preview').click());
    await act(async () => store.setState({ activeViewId: 'view-b' }));
    expect(document.querySelector('table[aria-label="Find and replace preview"]')).toBeNull();
  });

  it('keeps preview and row navigation enabled read-only while disabling Apply', async () => {
    const store = createModelStore({
      model: fixture(),
      activeViewId: 'view-a',
      readOnly: true,
    });
    await renderDialog(store);
    await setInput('find', 'Alpha');
    await act(async () => button('Preview').click());

    expect(document.querySelector('table[aria-label="Find and replace preview"]')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.find-replace-navigate')?.disabled).toBe(false);
    expect(button('Apply').disabled).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Read-only');
  });

  it('keeps the toolbar-opened dialog bound to the session captured on open', async () => {
    const firstId = addModelSession({
      id: 'toolbar-first',
      model: fixture('Alpha first'),
      fileName: null,
    });
    const secondId = addModelSession({
      id: 'toolbar-second',
      model: fixture('Beta second'),
      fileName: null,
    });
    activateModelSession(firstId);
    await act(async () => root.render(createElement(Toolbar)));
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Find and replace"]',
    )!.click());
    activateModelSession(secondId);

    await setInput('find', 'Alpha');
    await setInput('replace', 'Omega');
    await act(async () => button('Preview').click());
    expect(document.querySelector('table[aria-label="Find and replace preview"]')?.textContent)
      .toContain('Alpha first');
    await act(async () => button('Apply').click());

    expect(getModelSession(firstId)!.store.getState().model!.info.name).toBe('Omega first');
    expect(getModelSession(secondId)!.store.getState().model!.info.name).toBe('Beta second');
  });
});

describe('find and replace navigation', () => {
  it('reveals a tree row in the captured session when object IDs collide', () => {
    const firstId = addModelSession({ id: 'first', model: fixture('First'), fileName: null });
    const secondId = addModelSession({ id: 'second', model: fixture('Second'), fileName: null });
    const first = getModelSession(firstId)!;
    const second = getModelSession(secondId)!;
    const result = previewFindReplace(captureFindReplaceSession(first.store), {
      find: 'Alpha',
      replace: 'Omega',
      scope: 'model',
      searchName: true,
      searchDocumentation: false,
      searchPropertyValues: false,
      matchCase: true,
      useRegex: false,
    });
    const row = result.rows.find((candidate) => candidate.ownerId === 'shared-object')!;
    let reveal: { objectId: string; sessionId: string | null } | undefined;
    const unsubscribe = onRevealRequest((objectId, sessionId) => {
      reveal = { objectId, sessionId: sessionId ?? null };
    });

    expect(navigateToFindReplaceRow(result, row.id)).toBe(true);
    expect(workspaceStore.getState().activeSessionId).toBe(firstId);
    expect(first.store.getState().selection).toEqual({ source: 'tree', ids: ['shared-object'] });
    expect(second.store.getState().selection.ids).toEqual([]);
    expect(reveal).toEqual({ objectId: 'shared-object', sessionId: firstId });
    unsubscribe();
  });

  it('keeps navigation current when only captured-session file metadata changes', () => {
    const sessionId = addModelSession({
      id: 'saved-navigation-session',
      model: fixture('Saved model'),
      fileName: null,
    });
    const session = getModelSession(sessionId)!;
    const result = previewFindReplace(captureFindReplaceSession(session.store), {
      find: 'Alpha',
      replace: 'Omega',
      scope: 'model',
      searchName: true,
      searchDocumentation: false,
      searchPropertyValues: false,
      matchCase: true,
      useRegex: false,
    });
    const row = result.rows.find((candidate) => candidate.ownerId === 'shared-object')!;

    setModelSessionFileHandle(sessionId, null);

    expect(navigateToFindReplaceRow(result, row.id)).toBe(true);
    expect(session.store.getState().selection).toEqual({ source: 'tree', ids: ['shared-object'] });
  });

  it('opens and selects a recursive annotation in its captured view', () => {
    const sessionId = addModelSession({
      id: 'view-session',
      model: fixture('View model'),
      fileName: null,
      activeViewId: 'view-a',
    });
    const session = getModelSession(sessionId)!;
    const result = previewFindReplace(captureFindReplaceSession(session.store), {
      find: 'Alpha',
      replace: 'Omega',
      scope: 'active-view',
      searchName: true,
      searchDocumentation: true,
      searchPropertyValues: false,
      matchCase: true,
      useRegex: false,
    });
    const row = result.rows.find((candidate) => candidate.ownerId === 'note-a')!;

    expect(navigateToFindReplaceRow(result, row.id)).toBe(true);
    expect(session.store.getState().activeViewId).toBe('view-a');
    expect(session.store.getState().openViewIds).toContain('view-a');
    expect(session.store.getState().selection).toEqual({ source: 'view', ids: ['note-a'] });
  });
});
