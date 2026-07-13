import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capturePropertyManagerSession,
  inspectPropertyUsage,
} from '../src/model/property-manager';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, replaceModel, type ModelStore } from '../src/model/store';
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

function largeFixture(): ModelState {
  const model = fixture('Large property model');
  model.info.properties = [
    ...Array.from({ length: 135 }, (_, index) => ({
      key: 'bulk-key',
      value: `bulk value ${index + 1}`,
    })),
    ...Array.from({ length: 125 }, (_, index) => ({
      key: `unique-${String(index).padStart(3, '0')}`,
      value: `unique value ${index}`,
    })),
  ];
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

  it('distinguishes empty, literal sentinel, and whitespace keys through exact deletion', async () => {
    const model = fixture();
    model.info.properties = [
      { key: '', value: 'empty-key value' },
      { key: '(blank)', value: 'literal-key value' },
      { key: ' ', value: 'space-key value' },
    ];
    const store = createModelStore({ model });
    await renderDialog(store);
    const keyButtons = [...document.querySelectorAll<HTMLButtonElement>(
      'table[aria-label="Property key summary"] tbody button',
    )];

    expect(keyButtons.map((control) => control.textContent)).toEqual([
      '(blank)',
      '"(blank)"',
      '" "',
      'shared',
    ]);
    expect(new Set(keyButtons.slice(0, 3).map((control) => control.getAttribute('aria-label'))).size)
      .toBe(3);

    await act(async () => keyButtons[1].click());
    const details = document.querySelector('table[aria-label="Property occurrence details"]')!;
    expect(details.textContent).toContain('literal-key value');
    expect(details.textContent).not.toContain('empty-key value');
    expect(details.textContent).not.toContain('space-key value');
    await act(async () => button('Stage delete').click());
    await act(async () => button('Preview').click());
    expect(document.querySelectorAll(
      'table[aria-label="Property mutation preview"] tbody tr',
    )).toHaveLength(1);
    await act(async () => button('Apply delete').click());

    expect(store.getState().model!.info.properties).toEqual([
      { key: '', value: 'empty-key value' },
      { key: ' ', value: 'space-key value' },
    ]);
  });

  it('distinguishes value sentinels and lets keyboard users expand long whitespace', async () => {
    const model = fixture();
    const longValue = [
      'Full property value with  two spaces',
      '\tIndented second line',
      'Third line',
      'Fourth line remains available in full',
    ].join('\n');
    model.info.properties = [
      { key: 'values', value: '' },
      { key: 'values', value: '∅' },
      { key: 'values', value: longValue },
    ];
    await renderDialog(createModelStore({ model }));

    const values = [...document.querySelectorAll<HTMLElement>(
      'table[aria-label="Property occurrence details"] .property-manager-value',
    )];
    expect(values.map((value) => value.textContent)).toEqual(['(empty)', '∅', longValue]);
    expect(values[0].getAttribute('aria-label')).toBe('Empty property value');
    expect(values[1].getAttribute('aria-label')).toBe('Property value: ∅');
    expect(values[2].title).toBe(longValue);
    expect(values[2].tabIndex).toBe(0);

    const toggles = [...document.querySelectorAll<HTMLButtonElement>(
      'button.property-manager-value-toggle',
    )];
    expect(toggles).toHaveLength(2);
    expect(toggles.some((toggle) => toggle.getAttribute('aria-controls') === values[0].id))
      .toBe(false);
    expect(toggles.some((toggle) => toggle.getAttribute('aria-controls') === values[1].id))
      .toBe(true);
    const longValueToggle = toggles.find(
      (toggle) => toggle.getAttribute('aria-controls') === values[2].id,
    )!;
    expect(longValueToggle.textContent).toBe('Show full value');
    expect(longValueToggle.getAttribute('aria-expanded')).toBe('false');

    longValueToggle.focus();
    expect(document.activeElement).toBe(longValueToggle);
    await act(async () => longValueToggle.click());
    expect(longValueToggle.getAttribute('aria-expanded')).toBe('true');
    expect(longValueToggle.textContent).toBe('Collapse value');
    expect(values[2].classList.contains('expanded')).toBe(true);
    expect(values[2].textContent).toBe(longValue);

    await act(async () => longValueToggle.click());
    expect(longValueToggle.getAttribute('aria-expanded')).toBe('false');
    expect(values[2].classList.contains('expanded')).toBe(false);
  });

  it('offers a complete-value control for short values that can wrap past three lines', async () => {
    const model = fixture();
    const wrapProneValue = [
      'First short line that can wrap',
      'Second line may also wrap',
      'Third line',
    ].join('\n');
    expect(wrapProneValue.length).toBeLessThan(97);
    model.info.properties = [{ key: 'wrapped', value: wrapProneValue }];
    await renderDialog(createModelStore({ model }));

    const value = document.querySelector<HTMLElement>('.property-manager-value')!;
    const toggle = document.querySelector<HTMLButtonElement>('.property-manager-value-toggle');
    expect(value.textContent).toBe(wrapProneValue);
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('aria-controls')).toBe(value.id);
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');
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

  it('bounds both ledger panes with accessible pagination while search remains global', async () => {
    await renderDialog(createModelStore({ model: largeFixture() }));
    const summaryRows = () => document.querySelectorAll(
      'table[aria-label="Property key summary"] tbody tr',
    );
    const detailRows = () => document.querySelectorAll(
      'table[aria-label="Property occurrence details"] tbody tr',
    );

    expect(summaryRows().length).toBeGreaterThan(1);
    expect(summaryRows().length).toBeLessThanOrEqual(50);
    expect(detailRows().length).toBe(50);
    expect(document.querySelector('[aria-label="Property keys pagination"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Property occurrences pagination"]')).not.toBeNull();
    expect(document.body.textContent).toContain('135');

    await act(async () => document.querySelector<HTMLButtonElement>(
      'button[aria-label="Next property keys page"]',
    )!.click());
    expect(summaryRows().length).toBeLessThanOrEqual(50);
    expect(document.querySelector('[aria-label="Property keys pagination"]')?.textContent)
      .toContain('Page 2');
    await act(async () => document.querySelector<HTMLButtonElement>(
      'button[aria-label="Next property occurrences page"]',
    )!.click());
    expect(detailRows().length).toBeLessThanOrEqual(50);
    expect(document.querySelector('[aria-label="Property occurrences pagination"]')?.textContent)
      .toContain('Page 2');

    await setInput('propertyKeySearch', 'unique-124');
    expect(summaryRows()).toHaveLength(1);
    expect(summaryRows()[0].textContent).toContain('unique-124');
    expect(document.querySelector('[aria-label="Property keys pagination"]')?.textContent)
      .toContain('Page 1 of 1');
  });

  it('previews a bounded detail page but applies every occurrence globally', async () => {
    const store = createModelStore({ model: largeFixture() });
    await renderDialog(store);
    await act(async () => button('Stage rename').click());
    await setInput('newPropertyKey', 'renamed-bulk-key');
    await act(async () => button('Preview').click());

    expect(document.querySelectorAll(
      'table[aria-label="Property mutation preview"] tbody tr',
    )).toHaveLength(50);
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      '135 affected occurrences previewed.',
    );
    await act(async () => button('Apply rename').click());

    expect(store.getState().model!.info.properties.filter(
      (property) => property.key === 'renamed-bulk-key',
    )).toHaveLength(135);
    expect(store.getState().undoStack.at(-1)?.label).toBe('Rename Property Key');
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

  it('closes when replaceModel reuses the mounted manager model object', async () => {
    const model = fixture();
    const store = createModelStore({ model });
    const onClose = await renderDialog(store);

    await act(async () => replaceModel(model, null, false, {}, store));

    expect(onClose).toHaveBeenCalledOnce();
    expect(store.getState().undoStack).toEqual([]);
  });

  it('closes without rendering a ledger when activation changes before mount', async () => {
    const firstId = addModelSession({ id: 'stale-before-activation', model: fixture(), fileName: null });
    const capture = capturePropertyManagerSession(getModelSession(firstId)!.store);
    addModelSession({ id: 'stale-before-activation-other', model: fixture('Other'), fileName: null });
    const onClose = vi.fn();

    await act(async () => root.render(createElement(PropertiesManagerDialog, { capture, onClose })));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes without rendering a ledger when the model changes before mount', async () => {
    const store = createModelStore({ model: fixture() });
    const capture = capturePropertyManagerSession(store);
    replaceModel(fixture('Replacement'), null, false, {}, store);
    const onClose = vi.fn();

    await act(async () => root.render(createElement(PropertiesManagerDialog, { capture, onClose })));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes without rendering a ledger after same-reference replacement before mount', async () => {
    const model = fixture();
    const store = createModelStore({ model });
    const capture = capturePropertyManagerSession(store);
    replaceModel(model, null, false, {}, store);
    const onClose = vi.fn();

    await act(async () => root.render(createElement(PropertiesManagerDialog, { capture, onClose })));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(store.getState().undoStack).toEqual([]);
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
