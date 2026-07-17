import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addNoteToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel, setSelection } from '../src/model/store';
import {
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { ModelTree } from '../src/ui/ModelTree';
import { useStore } from '../src/ui/store-hooks';

let host: HTMLDivElement;
let root: Root;

function selectedNode(container: ParentNode, nodeId: string): boolean {
  return container.querySelector(
    `[data-node-id="${nodeId}"] > rect[stroke="var(--canvas-selection)"]`,
  ) !== null;
}

function selectedConnection(container: ParentNode, connectionId: string): boolean {
  return container.querySelector(
    `[data-conn-id="${connectionId}"] path[stroke="var(--canvas-selection)"]`,
  ) !== null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  replaceModel(createEmptyModel('Selection synchronization'), null);
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

describe('always-on selection synchronization', () => {
  it('highlights every open-view occurrence without changing the command selection', async () => {
    const customer = addElement('BusinessActor', 'Customer');
    const role = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      customer,
      role,
      'Assignment',
    )!;
    const firstView = addView('First view');
    const secondView = addView('Second view');
    const firstCustomerNode = addElementNodeToView(
      firstView,
      customer,
      firstView,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const firstRoleNode = addElementNodeToView(
      firstView,
      role,
      firstView,
      { x: 220, y: 10, width: 120, height: 55 },
      false,
    );
    const secondCustomerNode = addElementNodeToView(
      secondView,
      customer,
      secondView,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const secondRoleNode = addElementNodeToView(
      secondView,
      role,
      secondView,
      { x: 220, y: 10, width: 120, height: 55 },
      false,
    );
    const firstConnection = addConnectionToView(
      firstView,
      relationshipId,
      firstCustomerNode,
      firstRoleNode,
    );
    const secondConnection = addConnectionToView(
      secondView,
      relationshipId,
      secondCustomerNode,
      secondRoleNode,
    );

    await act(async () => {
      root.render(createElement(
        Fragment,
        null,
        createElement('section', { 'data-editor': 'first' },
          createElement(ViewEditor, { viewId: firstView })),
        createElement('section', { 'data-editor': 'second' },
          createElement(ViewEditor, { viewId: secondView })),
        createElement('section', { 'data-editor': 'readonly' },
          createElement(ViewEditor, { viewId: secondView, readOnly: true })),
      ));
    });

    await act(async () => setSelection('tree', [customer]));
    expect(selectedNode(host.querySelector('[data-editor="first"]')!, firstCustomerNode)).toBe(true);
    expect(selectedNode(host.querySelector('[data-editor="second"]')!, secondCustomerNode)).toBe(true);
    expect(selectedNode(host.querySelector('[data-editor="readonly"]')!, secondCustomerNode)).toBe(true);

    await act(async () => setSelection('view', [firstCustomerNode]));
    expect(selectedNode(host.querySelector('[data-editor="first"]')!, firstCustomerNode)).toBe(true);
    expect(selectedNode(host.querySelector('[data-editor="second"]')!, secondCustomerNode)).toBe(true);
    expect(useStore.getState().selection).toEqual({
      source: 'view',
      ids: [firstCustomerNode],
    });

    await act(async () => setSelection('tree', [relationshipId]));
    expect(selectedConnection(
      host.querySelector('[data-editor="first"]')!,
      firstConnection,
    )).toBe(true);
    expect(selectedConnection(
      host.querySelector('[data-editor="second"]')!,
      secondConnection,
    )).toBe(true);
    expect(selectedConnection(
      host.querySelector('[data-editor="readonly"]')!,
      secondConnection,
    )).toBe(true);
  });

  it('marks the semantic Model Browser row for a canvas selection only', async () => {
    resetWorkspaceForTests();
    const sessionId = addModelSession({
      model: createEmptyModel('Browser synchronization'),
      fileName: null,
    });
    const session = getModelSession(sessionId)!;
    const elementId = addElement('BusinessActor', 'Customer', undefined, session.store);
    const viewId = addView('View', undefined, session.store);
    const nodeId = addElementNodeToView(
      viewId,
      elementId,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
      {},
      session.store,
    );
    const noteId = addNoteToView(
      viewId,
      viewId,
      { x: 10, y: 100, width: 120, height: 55 },
      'Canvas only',
      {},
      session.store,
    );

    await act(async () => root.render(createElement(ModelTree)));
    await act(async () => setSelection('view', [nodeId], session.store));

    const row = host.querySelector<HTMLElement>(`[data-tree-id="${elementId}"]`)!;
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(session.store.getState().selection).toEqual({ source: 'view', ids: [nodeId] });

    await act(async () => setSelection('view', [noteId], session.store));
    expect(row.getAttribute('aria-selected')).toBe('false');
    expect(session.store.getState().selection).toEqual({ source: 'view', ids: [noteId] });
  });
});
