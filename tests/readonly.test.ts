import { beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
  renameItem,
} from '../src/model/ops';
import {
  redo,
  replaceModel,
  setSelection,
  setActiveTool,
  transact,
  undo,
  useStore,
} from '../src/model/store';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { ViewerShell } from '../src/ui/ViewerShell';

function state() {
  return useStore.getState();
}

function dispatchPointerDown(target: Element): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 40,
    clientY: 40,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
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

  it('selects view nodes and relationships in the read-only viewer', async () => {
    replaceModel(createEmptyModel('Viewer'), null, false);
    const processId = addElement('BusinessProcess', 'Process');
    const objectId = addElement('BusinessObject', 'Object');
    const relationshipId = addRelationship('AccessRelationship', processId, objectId, 'Reads');
    expect(relationshipId).not.toBeNull();
    const viewId = addView('View');
    const sourceNodeId = addElementNodeToView(viewId, processId, viewId, {
      x: 20,
      y: 20,
      width: 120,
      height: 55,
    });
    addElementNodeToView(viewId, objectId, viewId, {
      x: 220,
      y: 20,
      width: 120,
      height: 55,
    });
    const connectionId = Object.values(state().model!.connections).find(
      (conn) => conn.relationshipId === relationshipId,
    )?.id;
    expect(connectionId).toBeDefined();
    replaceModel(state().model, null, false, { readOnly: true });

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(
          'div',
          null,
          createElement(ViewEditor, { viewId, readOnly: true }),
          createElement(PropertiesPanel),
        ),
      );
    });

    const node = host.querySelector(`[data-node-id="${sourceNodeId}"]`);
    expect(node).not.toBeNull();
    await act(async () => {
      dispatchPointerDown(node!);
    });
    expect(state().selection).toEqual({ source: 'view', ids: [sourceNodeId] });
    expect(host.querySelector<HTMLInputElement>('.properties-panel input.prop-input')?.value).toBe(
      'Process',
    );

    const connection = host.querySelector(`[data-conn-id="${connectionId}"]`);
    expect(connection).not.toBeNull();
    await act(async () => {
      dispatchPointerDown(connection!);
    });
    expect(state().selection).toEqual({ source: 'view', ids: [connectionId] });
    expect(host.querySelector<HTMLInputElement>('.properties-panel input.prop-input')?.value).toBe(
      'Reads',
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('exposes a viewer shell component for loaded and error states', () => {
    expect(typeof ViewerShell).toBe('function');
  });
});
