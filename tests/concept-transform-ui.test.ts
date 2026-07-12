import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showViewObjectContextMenu } from '../src/canvas/view-editor/contextMenu';
import {
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
  setDocumentation,
} from '../src/model/ops';
import { createModelStore, setSelection } from '../src/model/store';
import {
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { DEFAULT_SETTINGS } from '../src/settings/app-settings';
import { AppDialogHost } from '../src/ui/AppDialog';
import { ContextMenuHost, type MenuItem } from '../src/ui/ContextMenu';
import { ModelTree } from '../src/ui/ModelTree';
import {
  INVALID_RELATIONSHIPS_CONFIRMATION,
  conceptTransformationMenuItems,
} from '../src/ui/concept-transform-menu';

let host: HTMLDivElement;
let root: Root;

function menuLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.ctx-label')]
    .map((item) => item.textContent ?? '');
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.querySelectorAll('.ctx-root').forEach((item) => item.remove());
  host.remove();
  resetWorkspaceForTests();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('concept transformation context menus', () => {
  it('offers Set Concept Type for canvas concept occurrences', async () => {
    const store = createModelStore({ model: createEmptyModel('Canvas'), fileName: null });
    const actorId = addElement('BusinessActor', 'Actor', undefined, store);
    const viewId = addView('View', undefined, store);
    const nodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
      {},
      store,
    );
    await act(async () => root.render(createElement(ContextMenuHost)));

    await act(async () => showViewObjectContextMenu({
      clientX: 20,
      clientY: 20,
      viewId,
      id: nodeId,
      ids: [nodeId],
      model: store.getState().model!,
      settings: DEFAULT_SETTINGS,
      modelStore: store,
      sessionId: 'canvas-transform',
      startEdit: vi.fn(),
    }));

    expect(menuLabels()).toContain('Set Concept Type');
  });

  it('offers Set Concept Type and inversion for model-tree relationships', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Tree'), fileName: null });
    const session = getModelSession(sessionId)!;
    const actorId = addElement('BusinessActor', 'Actor', undefined, session.store);
    const roleId = addElement('BusinessRole', 'Role', undefined, session.store);
    const relationshipId = addRelationship(
      'AssociationRelationship',
      actorId,
      roleId,
      '',
      undefined,
      session.store,
    )!;
    setSelection('tree', [relationshipId], session.store);
    await act(async () => root.render(createElement(Fragment, null,
      createElement(ContextMenuHost),
      createElement(ModelTree),
    )));
    const row = host.querySelector<HTMLElement>(`[data-tree-id="${relationshipId}"]`);
    expect(row).not.toBeNull();

    await act(async () => row!.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 30,
      clientY: 30,
    })));

    expect(menuLabels()).toContain('Set Concept Type');
    expect(menuLabels()).toContain('Invert Connection Direction');
  });

  it('shows only relationship types legal for the complete final selection', () => {
    const store = createModelStore({ model: createEmptyModel('Legal menu'), fileName: null });
    const actorId = addElement('BusinessActor', 'Actor', undefined, store);
    const roleId = addElement('BusinessRole', 'Role', undefined, store);
    const assignmentId = addRelationship(
      'AssignmentRelationship',
      actorId,
      roleId,
      '',
      undefined,
      store,
    )!;
    const items = conceptTransformationMenuItems(
      store.getState().model!,
      [assignmentId],
      store,
      DEFAULT_SETTINGS,
    );
    const typeMenu = items.find((item) => item.label === 'Set Concept Type')!;
    const labels = typeMenu.children?.map((item) => item.label) ?? [];

    expect(labels).toContain('Association');
    expect(labels).not.toContain('Access');
    expect(items.find((item) => item.label === 'Invert Connection Direction')?.disabled).toBe(true);
  });

  it('omits a relationship type illegal for an unchanged member of the selected set', () => {
    const store = createModelStore({
      model: createEmptyModel('Complete relationship menu state'),
      fileName: null,
    });
    const passiveId = addElement('BusinessObject', 'Passive', undefined, store);
    const actorId = addElement('BusinessActor', 'Actor', undefined, store);
    const roleId = addElement('BusinessRole', 'Role', undefined, store);
    const changeMeId = addRelationship(
      'AssociationRelationship',
      actorId,
      roleId,
      '',
      undefined,
      store,
    )!;
    const model = structuredClone(store.getState().model!);
    const relationsFolderId = model.rootFolderIds.find(
      (id) => model.folders[id]?.folderType === 'relations',
    )!;
    model.relationships['imported-invalid'] = {
      id: 'imported-invalid',
      kind: 'relationship',
      type: 'AssignmentRelationship',
      name: '',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relationsFolderId,
      sourceId: passiveId,
      targetId: roleId,
    };
    model.folders[relationsFolderId].itemIds.push('imported-invalid');
    store.setState({ model });

    const items = conceptTransformationMenuItems(
      model,
      ['imported-invalid', changeMeId],
      store,
      DEFAULT_SETTINGS,
    );
    const typeMenu = items.find((item) => item.label === 'Set Concept Type')!;
    const labels = typeMenu.children?.map((item) => item.label) ?? [];

    expect(labels).not.toContain('Assignment');
    expect(labels).toContain('Association');
  });

  it('does not silently drop a selected Junction from a mixed element transformation', () => {
    const store = createModelStore({ model: createEmptyModel('Mixed Junction'), fileName: null });
    const actorId = addElement('BusinessActor', 'Actor', undefined, store);
    const junctionId = addElement('Junction', 'Junction', undefined, store);

    const items = conceptTransformationMenuItems(
      store.getState().model!,
      [actorId, junctionId],
      store,
      DEFAULT_SETTINGS,
    );

    expect(items.find((item) => item.label === 'Set Concept Type')).toBeUndefined();
  });

  it('previews invalid relationships and mutates only from the Association confirmation', async () => {
    const store = createModelStore({ model: createEmptyModel('Confirm'), fileName: null });
    const actorId = addElement('BusinessActor', 'Actor', undefined, store);
    const roleId = addElement('BusinessRole', 'Role', undefined, store);
    const assignmentId = addRelationship(
      'AssignmentRelationship',
      actorId,
      roleId,
      'Assigned',
      undefined,
      store,
    )!;
    setDocumentation(assignmentId, 'Existing docs', store);
    const before = structuredClone(store.getState().model!);
    await act(async () => root.render(createElement(AppDialogHost)));
    const action = businessObjectAction(conceptTransformationMenuItems(
      store.getState().model!,
      [actorId],
      store,
      { ...DEFAULT_SETTINGS, addDocumentationNoteOnRelationChange: true },
    ));

    await act(async () => {
      action.onClick?.();
      await Promise.resolve();
    });
    expect(document.querySelector('.app-dialog-message')?.textContent).toBe(
      INVALID_RELATIONSHIPS_CONFIRMATION,
    );
    expect(document.querySelector('.app-dialog-details')?.textContent).toContain('Assigned');
    expect(document.querySelector('.app-dialog-btn.primary')?.textContent).toBe(
      'Convert to Association',
    );
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('.app-dialog-btn')]
      .find((button) => button.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    expect(store.getState().model).toEqual(before);

    await act(async () => {
      action.onClick?.();
      await Promise.resolve();
    });
    const confirm = document.querySelector<HTMLButtonElement>('.app-dialog-btn.primary')!;
    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });
    const changed = store.getState().model!;
    expect(Object.values(changed.elements).find((element) => element.name === 'Actor')?.type)
      .toBe('BusinessObject');
    expect(Object.values(changed.relationships)[0]).toMatchObject({
      type: 'AssociationRelationship',
      documentation: '(Changed from Assignment)\n\nExisting docs',
    });
  });
});

function businessObjectAction(items: MenuItem[]): MenuItem {
  const typeMenu = items.find((item) => item.label === 'Set Concept Type');
  const businessMenu = typeMenu?.children?.find((item) => item.label === 'Business');
  const action = businessMenu?.children?.find((item) => item.label === 'Business Object');
  if (!action) throw new Error('Business Object type action is missing');
  return action;
}
