import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addElement, createEmptyModel } from '../src/model/ops';
import { setSelection } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
  useWorkspaceStore,
} from '../src/model/workspace';
import { ModelTree } from '../src/ui/ModelTree';

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
});
