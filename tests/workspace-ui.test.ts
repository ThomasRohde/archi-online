import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addElement, createEmptyModel } from '../src/model/ops';
import { setSelection } from '../src/model/store';
import { useWorkspaceStore } from '../src/ui/store-hooks';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { ModelTree } from '../src/ui/ModelTree';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { requestReveal } from '../src/ui/tree-bus';

let host: HTMLDivElement;
let root: Root;

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
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

describe('multi-model tree', () => {
  it('renders every model root, marks dirty models, and activates a clicked root', async () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null });
    const secondId = addModelSession({
      model: createEmptyModel('Second'),
      fileName: null,
      dirty: true,
    });

    await act(async () => root.render(createElement(ModelTree)));

    expect(host.textContent).toContain('First');
    expect(host.textContent).toContain('Second *');
    expect(useWorkspaceStore.getState().activeSessionId).toBe(secondId);

    const firstRoot = host.querySelector<HTMLElement>(`[data-model-session-id="${firstId}"]`);
    expect(firstRoot).not.toBeNull();
    await act(async () => firstRoot!.click());

    expect(useWorkspaceStore.getState().activeSessionId).toBe(firstId);
  });

  it('deletes from the focused tree owner when a colliding-id session is globally active', async () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null });
    activateModelSession(firstId);
    const elementId = addElement('BusinessActor', 'Twin actor');
    const first = getModelSession(firstId)!;
    const twinModel = structuredClone(first.store.getState().model!);
    const secondId = addModelSession({ model: twinModel, fileName: null });
    const second = getModelSession(secondId)!;
    setSelection('tree', [elementId], first.store);

    await act(async () => root.render(createElement(ModelTree)));
    const firstTree = host.querySelector<HTMLElement>(`[data-model-session-id="${firstId}"]`);
    expect(firstTree).not.toBeNull();
    expect(useWorkspaceStore.getState().activeSessionId).toBe(secondId);

    await act(async () => {
      firstTree!.focus();
      firstTree!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    });

    expect(first.store.getState().model!.elements[elementId]).toBeUndefined();
    expect(second.store.getState().model!.elements[elementId]).toBeDefined();
    expect(first.store.getState().undoStack.at(-1)?.label).toBe('Delete');
    expect(second.store.getState().undoStack).toHaveLength(0);
  });

  it('uses one accessible criteria across roots and isolates colliding item ids by session', async () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null });
    activateModelSession(firstId);
    const elementId = addElement('BusinessActor', 'First only');
    const first = getModelSession(firstId)!;
    const twinModel = structuredClone(first.store.getState().model!);
    twinModel.info.id = 'second-model';
    twinModel.info.name = 'Second';
    twinModel.elements[elementId].name = 'Second only';
    const secondId = addModelSession({ model: twinModel, fileName: null });

    await act(async () => root.render(createElement(ModelTree)));

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]');
    expect(input).not.toBeNull();
    expect(host.querySelectorAll('input[aria-label="Search models"]')).toHaveLength(1);

    await changeInput(input!, 'First only');

    expect(host.querySelector(
      `[data-model-session-id="${firstId}"] [data-tree-id="${elementId}"]`,
    )).not.toBeNull();
    expect(host.querySelector(
      `[data-model-session-id="${secondId}"] [data-tree-id="${elementId}"]`,
    )).toBeNull();
  });

  it('preserves a session selection and prior folder collapse state after filtering clears', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Model'), fileName: null });
    const elementId = addElement('BusinessActor', 'Needle actor');
    const session = getModelSession(sessionId)!;
    const folderId = session.store.getState().model!.elements[elementId].folderId;

    await act(async () => root.render(createElement(ModelTree)));
    const folderRow = host.querySelector<HTMLElement>(`[data-tree-id="${folderId}"]`)!;
    await act(async () => folderRow.click());
    await act(async () => setSelection('tree', [elementId], session.store));
    expect(host.querySelector(`[data-tree-id="${elementId}"]`)).toBeNull();

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
    await changeInput(input, 'Needle actor');
    expect(host.querySelector(`[data-tree-id="${elementId}"]`)).not.toBeNull();
    expect(session.store.getState().selection.ids).toEqual([elementId]);

    await changeInput(input, '');
    expect(host.querySelector(`[data-tree-id="${elementId}"]`)).toBeNull();
    expect(session.store.getState().selection.ids).toEqual([elementId]);
  });

  it('does not change saved folder or model-root expansion while filtering forces matches open', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Model'), fileName: null });
    const elementId = addElement('BusinessActor', 'Needle actor');
    const session = getModelSession(sessionId)!;
    const model = session.store.getState().model!;
    const folderId = model.elements[elementId].folderId;
    await act(async () => root.render(createElement(ModelTree)));

    const query = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
    await changeInput(query, 'Needle actor');
    await act(async () => host.querySelector<HTMLElement>(`[data-tree-id="${folderId}"]`)!.click());
    await act(async () => host.querySelector<HTMLElement>(`[data-tree-id="${model.info.id}"]`)!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await changeInput(query, '');

    expect(host.querySelector(`[data-tree-id="${elementId}"]`)).not.toBeNull();
  });

  it('clears search and reveals an active-session item even when its model root is filtered out', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Model'), fileName: null });
    const elementId = addElement('BusinessActor', 'Reveal me');
    const modelId = getModelSession(sessionId)!.store.getState().model!.info.id;
    await act(async () => root.render(createElement(ModelTree)));
    await act(async () => host.querySelector<HTMLElement>(`[data-tree-id="${modelId}"]`)!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(host.querySelector(`[data-tree-id="${elementId}"]`)).toBeNull();
    const query = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
    await changeInput(query, 'No such item');
    expect(host.querySelector(`[data-model-session-id="${sessionId}"]`)).toBeNull();

    await act(async () => requestReveal(elementId));

    expect(query.value).toBe('');
    expect(host.querySelector(
      `[data-model-session-id="${sessionId}"] [data-tree-id="${elementId}"]`,
    )).not.toBeNull();
  });

  it('aggregates key/profile choices and clears dynamic selections on catalog change but retains types', async () => {
    const firstModel = createEmptyModel('First');
    firstModel.info.properties = [{ key: 'Owner', value: 'Alice' }];
    firstModel.profiles.first = {
      id: 'first', name: 'External Party', conceptType: 'BusinessActor', specialization: true,
    };
    addModelSession({ model: firstModel, fileName: null });

    await act(async () => root.render(createElement(ModelTree)));
    await act(async () => host.querySelector<HTMLElement>('[aria-label="Search options"]')!.click());

    const propertySelect = host.querySelector<HTMLSelectElement>('select[aria-label="Property keys"]')!;
    const profileSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Specializations"]')!;
    const actorType = host.querySelector<HTMLInputElement>('input[aria-label="Business Actor type"]')!;
    expect([...propertySelect.options].map((option) => option.value)).toEqual(['Owner']);
    expect([...profileSelect.options].map((option) => option.textContent)).toEqual([
      'External Party — Business Actor',
    ]);

    await act(async () => {
      propertySelect.options[0].selected = true;
      propertySelect.dispatchEvent(new Event('change', { bubbles: true }));
      profileSelect.options[0].selected = true;
      profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
      actorType.click();
    });
    expect(propertySelect.selectedOptions).toHaveLength(1);
    expect(profileSelect.selectedOptions).toHaveLength(1);
    expect(actorType.checked).toBe(true);

    const secondModel = createEmptyModel('Second');
    secondModel.info.properties = [{ key: 'Status', value: 'Draft' }];
    await act(async () => {
      addModelSession({ model: secondModel, fileName: null });
    });

    const nextPropertySelect = host.querySelector<HTMLSelectElement>('select[aria-label="Property keys"]')!;
    const nextProfileSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Specializations"]')!;
    expect([...nextPropertySelect.options].map((option) => option.value)).toEqual(['Owner', 'Status']);
    expect(nextPropertySelect.selectedOptions).toHaveLength(0);
    expect(nextProfileSelect.selectedOptions).toHaveLength(0);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Business Actor type"]')!.checked)
      .toBe(true);
  });

  it('validates regex accessibly and exposes Reset and Refresh without persisting query/selections', async () => {
    addModelSession({ model: createEmptyModel('Model'), fileName: null });
    await act(async () => root.render(createElement(ModelTree)));
    await act(async () => host.querySelector<HTMLElement>('[aria-label="Search options"]')!.click());

    const query = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
    const regex = host.querySelector<HTMLInputElement>('input[aria-label="Regular Expression"]')!;
    await changeInput(query, '[');
    await act(async () => regex.click());

    expect(query.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/invalid regular expression/i);
    expect(useSettingsStore.getState().settings.treeSearchRegex).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Reset search"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Refresh search"]')).not.toBeNull();

    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Reset search"]')!.click());
    expect(query.value).toBe('[');
    expect(regex.checked).toBe(true);
    expect('treeSearchQuery' in useSettingsStore.getState().settings).toBe(false);
  });

  it('refreshes the current criteria without changing it', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Before'), fileName: null });
    const session = getModelSession(sessionId)!;
    await act(async () => root.render(createElement(ModelTree)));

    const query = host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
    await changeInput(query, 'After');
    expect(host.querySelector(`[data-model-session-id="${sessionId}"]`)).toBeNull();

    // Simulate a model source changed outside a normal store notification; Refresh must re-read it.
    session.store.getState().model!.info.name = 'After';
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh search"]',
    )!.click());

    expect(query.value).toBe('After');
    expect(host.querySelector(`[data-model-session-id="${sessionId}"]`)).not.toBeNull();
  });
});
