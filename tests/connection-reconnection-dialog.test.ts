import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import {
  createModelStore,
  type ModelStore,
} from '../src/model/store';
import { AppDialogHost } from '../src/ui/AppDialog';
import * as reconnectionUi from '../src/ui/automatic-relationships';
import { ModelStoreProvider } from '../src/ui/store-hooks';

type RequestReconnection = (
  input: { connectionId: string; end: 'source' | 'target'; endpointId: string },
  store: ModelStore,
) => Promise<unknown | null>;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function fixture(): {
  store: ModelStore;
  connectionId: string;
  newEndpointId: string;
  relationshipId: string;
  otherConnectionId: string;
  newConceptId: string;
} {
  const store = createModelStore({ model: createEmptyModel('Warning'), fileName: null });
  const a = addElement('BusinessActor', 'A', undefined, store);
  const b = addElement('BusinessRole', 'B', undefined, store);
  const c = addElement('BusinessRole', 'C', undefined, store);
  const relationshipId = addRelationship('AssignmentRelationship', a, b, '', undefined, store)!;
  const currentView = addView('Current view', undefined, store);
  const otherView = addView('Other view', undefined, store);
  const a1 = addElementNodeToView(currentView, a, currentView, { x: 0, y: 0, width: 100, height: 40 }, false, {}, store);
  const b1 = addElementNodeToView(currentView, b, currentView, { x: 200, y: 0, width: 100, height: 40 }, false, {}, store);
  const c1 = addElementNodeToView(currentView, c, currentView, { x: 400, y: 0, width: 100, height: 40 }, false, {}, store);
  const a2 = addElementNodeToView(otherView, a, otherView, { x: 0, y: 0, width: 100, height: 40 }, false, {}, store);
  const b2 = addElementNodeToView(otherView, b, otherView, { x: 200, y: 0, width: 100, height: 40 }, false, {}, store);
  const connectionId = addConnectionToView(currentView, relationshipId, a1, b1, store);
  const otherConnectionId = addConnectionToView(otherView, relationshipId, a2, b2, store);
  store.setState({ undoStack: [], redoStack: [], dirty: false });
  return { store, connectionId, newEndpointId: c1, relationshipId, otherConnectionId, newConceptId: c };
}

function requestApi(): RequestReconnection | null {
  const request = (reconnectionUi as typeof reconnectionUi & {
    requestConnectionReconnection?: RequestReconnection;
  }).requestConnectionReconnection;
  expect(request).toBeTypeOf('function');
  return request ?? null;
}

async function renderDialogHost(store: ModelStore): Promise<void> {
  await act(async () => root.render(
    createElement(ModelStoreProvider, {
      store,
      children: createElement(AppDialogHost),
    }),
  ));
}

describe('connection reconnection warning', () => {
  it('lists affected views before mutation and Cancel is atomic', async () => {
    const request = requestApi();
    if (!request) return;
    const { store, connectionId, newEndpointId, otherConnectionId } = fixture();
    await renderDialogHost(store);
    const before = structuredClone(store.getState().model!);
    let result: unknown = undefined;

    await act(async () => {
      void request({ connectionId, end: 'target', endpointId: newEndpointId }, store)
        .then((value) => { result = value; });
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Current view');
    expect(dialog?.textContent).toContain('Other view');
    expect(dialog?.textContent).toContain('remove 1');
    expect(dialog?.textContent).toContain(otherConnectionId);
    expect(store.getState().model).toEqual(before);

    const cancel = [...dialog!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Cancel');
    await act(async () => {
      cancel!.click();
      await Promise.resolve();
    });

    expect(result).toBeNull();
    expect(store.getState().model).toEqual(before);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it('applies an accepted cross-view mutation as one undo step', async () => {
    const request = requestApi();
    if (!request) return;
    const fixtureState = fixture();
    const { store, connectionId, newEndpointId, relationshipId, otherConnectionId, newConceptId } = fixtureState;
    await renderDialogHost(store);
    let result: unknown = null;

    await act(async () => {
      void request({ connectionId, end: 'target', endpointId: newEndpointId }, store)
        .then((value) => { result = value; });
    });
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === 'Reconnect');
    await act(async () => {
      confirm!.click();
      await Promise.resolve();
    });

    expect(result).not.toBeNull();
    expect(store.getState().model!.relationships[relationshipId].targetId).toBe(newConceptId);
    expect(store.getState().model!.connections[otherConnectionId]).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
