import { beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { addElement, createEmptyModel, renameItem } from '../src/model/ops';
import {
  redo,
  replaceModel,
  setSelection,
  setActiveTool,
  transact,
  undo,
  useStore,
} from '../src/model/store';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { ViewerShell } from '../src/ui/ViewerShell';

function state() {
  return useStore.getState();
}

describe('read-only store mode', () => {
  beforeEach(() => {
    replaceModel(createEmptyModel('Read Only'), null, false, { readOnly: true });
  });

  it('blocks model transactions and leaves dirty false', () => {
    const before = state().model;

    addElement('BusinessActor');
    transact('Direct test mutation', (draft) => {
      draft.info.name = 'Changed';
    });

    expect(state().model).toBe(before);
    expect(Object.keys(state().model!.elements)).toHaveLength(0);
    expect(state().model!.info.name).toBe('Read Only');
    expect(state().dirty).toBe(false);
    expect(state().undoStack).toHaveLength(0);
  });

  it('blocks undo, redo, and edit tools while still allowing select', () => {
    replaceModel(createEmptyModel('Editable'), null, false);
    const id = addElement('Capability', 'Cap');
    renameItem(id, 'Renamed');
    undo();
    replaceModel(useStore.getState().model, null, false, { readOnly: true });

    undo();
    redo();
    setActiveTool({ kind: 'create-note' });
    setActiveTool({ kind: 'select' });

    expect(state().activeTool).toEqual({ kind: 'select' });
    expect(state().dirty).toBe(false);
  });

  it('can return to editable mode when replacing the model', () => {
    replaceModel(createEmptyModel('Editable copy'), null, true, { readOnly: false });

    addElement('BusinessActor');

    expect(Object.keys(state().model!.elements)).toHaveLength(1);
    expect(state().dirty).toBe(true);
    expect(state().readOnly).toBe(false);
  });
});

describe('read-only UI', () => {
  it('renders selected properties as disabled controls in read-only mode', async () => {
    replaceModel(createEmptyModel('Inspectable'), null, false);
    const id = addElement('BusinessActor', 'Actor');
    replaceModel(state().model, null, false, { readOnly: true });
    setSelection('tree', [id]);

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(PropertiesPanel));
    });

    const nameInput = host.querySelector<HTMLInputElement>('input.prop-input');
    expect(nameInput?.value).toBe('Actor');
    expect(nameInput?.disabled).toBe(true);
    expect(host.textContent).not.toContain('Appearance');

    await act(async () => {
      root.unmount();
    });
  });

  it('exposes a viewer shell component for loaded and error states', () => {
    expect(typeof ViewerShell).toBe('function');
  });
});
