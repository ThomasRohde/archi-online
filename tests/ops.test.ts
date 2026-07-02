import { beforeEach, describe, expect, it } from 'vitest';
import {
  addElement,
  addRelationship,
  addView,
  addElementNodeToView,
  createEmptyModel,
  createRelationshipOnView,
  deleteItems,
  renameItem,
} from '../src/model/ops';
import { redo, replaceModel, runBatch, undo, useStore } from '../src/model/store';

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Test'), null);
});

describe('model ops + undo/redo', () => {
  it('creates elements in the right default folder', () => {
    const id = addElement('BusinessActor');
    const m = model();
    const folder = m.folders[m.elements[id].folderId];
    expect(folder.folderType).toBe('business');
    expect(folder.itemIds).toContain(id);
    const nid = addElement('Node');
    expect(m.folders[model().elements[nid].folderId].folderType).toBe('technology');
  });

  it('creates valid relationships and rejects invalid ones', () => {
    const a = addElement('BusinessActor');
    const b = addElement('BusinessRole');
    const rel = addRelationship('AssignmentRelationship', a, b);
    expect(rel).not.toBeNull();
    expect(model().relationships[rel!].sourceId).toBe(a);
    const bad = addRelationship('AssignmentRelationship', b, a);
    expect(bad).toBeNull();
  });

  it('undo/redo restores state exactly', () => {
    const before = model();
    const id = addElement('Capability', 'Cap 1');
    expect(model().elements[id]).toBeDefined();
    undo();
    expect(model()).toEqual(before);
    redo();
    expect(model().elements[id].name).toBe('Cap 1');
    renameItem(id, 'Cap 2');
    expect(model().elements[id].name).toBe('Cap 2');
    undo();
    expect(model().elements[id].name).toBe('Cap 1');
  });

  it('deleting an element cascades to relationships and view objects', () => {
    const a = addElement('ApplicationComponent');
    const b = addElement('ApplicationService');
    const rel = addRelationship('RealizationRelationship', a, b)!;
    const viewId = addView('V');
    const na = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 });
    const nb = addElementNodeToView(viewId, b, viewId, { x: 200, y: 0, width: 120, height: 55 });
    // adding the second node should have auto-created the connection
    const conns = Object.values(model().connections);
    expect(conns).toHaveLength(1);
    expect(conns[0].relationshipId).toBe(rel);

    deleteItems([a]);
    const m = model();
    expect(m.elements[a]).toBeUndefined();
    expect(m.relationships[rel]).toBeUndefined();
    expect(m.nodes[na]).toBeUndefined();
    expect(m.nodes[nb]).toBeDefined();
    expect(Object.keys(m.connections)).toHaveLength(0);
    expect(m.views[viewId].childIds).toEqual([nb]);

    undo();
    const m2 = model();
    expect(m2.elements[a]).toBeDefined();
    expect(m2.relationships[rel]).toBeDefined();
    expect(m2.nodes[na]).toBeDefined();
    expect(Object.keys(m2.connections)).toHaveLength(1);
  });

  it('creating a relationship on a view creates both concept and connection', () => {
    const viewId = addView('V');
    const a = addElement('BusinessProcess');
    const b = addElement('BusinessObject');
    const na = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 });
    const nb = addElementNodeToView(viewId, b, viewId, { x: 200, y: 0, width: 120, height: 55 });
    const res = createRelationshipOnView('AccessRelationship', viewId, na, nb);
    expect(res).not.toBeNull();
    expect(model().relationships[res!.relationshipId].type).toBe('AccessRelationship');
    expect(model().connections[res!.connectionId].sourceId).toBe(na);
    // invalid direction rejected
    expect(createRelationshipOnView('AccessRelationship', viewId, nb, na)).toBeNull();
  });

  it('runBatch groups multiple ops into one undo step', () => {
    runBatch('script', () => {
      addElement('BusinessActor');
      addElement('BusinessRole');
      addElement('BusinessProcess');
    });
    expect(Object.keys(model().elements)).toHaveLength(3);
    expect(useStore.getState().undoStack).toHaveLength(1);
    undo();
    expect(Object.keys(model().elements)).toHaveLength(0);
  });
});
