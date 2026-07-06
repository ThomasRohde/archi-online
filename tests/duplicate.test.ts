import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
  duplicateItems,
  duplicateViewObjects,
  setProperties,
} from '../src/model/ops';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { replaceModel, undo, useStore } from '../src/model/store';
import type { Bounds, ElementNode, ModelState } from '../src/model/types';

function model(): ModelState {
  return useStore.getState().model!;
}

const B = (x: number, y: number, w = 100, h = 50): Bounds => ({ x, y, width: w, height: h });

beforeEach(() => {
  replaceModel(createEmptyModel('Duplicate Test'), null);
});

describe('duplicateItems — element', () => {
  it('copies with " (copy)" name, same folder, deep-copied properties', () => {
    const id = addElement('BusinessActor', 'Customer');
    setProperties(id, [{ key: 'k', value: 'v' }]);
    const original = model().elements[id];
    const folderId = original.folderId;

    const [copyId] = duplicateItems([id]);

    const copy = model().elements[copyId];
    expect(copyId).not.toBe(id);
    expect(copy.name).toBe('Customer (copy)');
    expect(copy.type).toBe('BusinessActor');
    expect(copy.documentation).toBe(original.documentation);
    expect(copy.folderId).toBe(folderId);
    expect(model().folders[folderId].itemIds).toContain(copyId);

    // Deep copy: distinct array and property objects, equal content.
    expect(copy.properties).not.toBe(original.properties);
    expect(copy.properties[0]).not.toBe(original.properties[0]);
    expect(copy.properties).toEqual([{ key: 'k', value: 'v' }]);
  });

  it('does not copy relationships pointing at the element', () => {
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessRole', 'B');
    addRelationship('AssociationRelationship', a, b);
    const relCountBefore = Object.keys(model().relationships).length;

    const [copyId] = duplicateItems([a]);

    expect(Object.keys(model().relationships)).toHaveLength(relCountBefore);
    expect(
      Object.values(model().relationships).some(
        (r) => r.sourceId === copyId || r.targetId === copyId,
      ),
    ).toBe(false);
  });
});

/** Build a view with two top-level element nodes, one nested child, and one
 *  connection between the two top-level nodes. Returns ids for assertions. */
function buildViewWithContent(name: string) {
  const a = addElement('BusinessActor', 'A');
  const b = addElement('BusinessRole', 'B');
  const c = addElement('BusinessFunction', 'C');
  const rel = addRelationship('AssociationRelationship', a, b)!;
  const viewId = addView(name);
  const nodeA = addElementNodeToView(viewId, a, viewId, B(10, 10), false);
  const nodeB = addElementNodeToView(viewId, b, viewId, B(200, 10), false);
  const nodeC = addElementNodeToView(viewId, c, nodeA, B(5, 5, 40, 20), false);
  const conn = addConnectionToView(viewId, rel, nodeA, nodeB);
  return { a, b, c, rel, viewId, nodeA, nodeB, nodeC, conn };
}

describe('duplicateItems — view', () => {
  it('deep-copies nodes and connections, preserving concepts and z-order', () => {
    const v1 = buildViewWithContent('V1');
    // A second, independent view whose connection must not be touched.
    const v2 = buildViewWithContent('V2');

    const origView = model().views[v1.viewId];
    const origTopOrder = origView.childIds.map((nid) => (model().nodes[nid] as ElementNode).elementId);

    const [copyId] = duplicateItems([v1.viewId]);
    const m = model();
    const copyView = m.views[copyId];

    // View object copied.
    expect(copyView.name).toBe('V1 (copy)');
    expect(copyView.folderId).toBe(origView.folderId);
    expect(m.folders[origView.folderId].itemIds).toContain(copyId);

    // All three nodes copied with fresh ids.
    const copyNodes = Object.values(m.nodes).filter((n) => n.viewId === copyId);
    expect(copyNodes).toHaveLength(3);
    for (const n of copyNodes) expect(m.nodes[n.id].id).not.toBe(v1.nodeA);
    expect(copyNodes.some((n) => (n as ElementNode).elementId === undefined)).toBe(false);

    // Element nodes keep the SAME referenced concepts (multiset A,B,C).
    const copyElementIds = copyNodes
      .filter((n): n is ElementNode => n.nodeType === 'element')
      .map((n) => n.elementId)
      .sort();
    expect(copyElementIds).toEqual([v1.a, v1.b, v1.c].sort());

    // Z-order of top-level nodes preserved.
    const copyTopOrder = copyView.childIds.map((nid) => (m.nodes[nid] as ElementNode).elementId);
    expect(copyTopOrder).toEqual(origTopOrder);

    // Nesting remapped: the copy of C sits inside the copy of A.
    const copyC = copyNodes.find((n) => (n as ElementNode).elementId === v1.c)!;
    const copyA = copyNodes.find((n) => (n as ElementNode).elementId === v1.a)!;
    expect(copyC.parentId).toBe(copyA.id);
    expect(copyC.viewId).toBe(copyId);

    // Connection remapped: new id + endpoints, same relationship + bendpoints.
    const copyConns = Object.values(m.connections).filter((cn) => cn.viewId === copyId);
    expect(copyConns).toHaveLength(1);
    const copyConn = copyConns[0];
    expect(copyConn.id).not.toBe(v1.conn);
    expect(copyConn.relationshipId).toBe(v1.rel);
    expect(copyConn.sourceId).toBe(copyA.id);
    expect(copyConn.targetId).toBe(
      copyNodes.find((n) => (n as ElementNode).elementId === v1.b)!.id,
    );
    // Endpoints wired both ways.
    expect(m.nodes[copyConn.sourceId].sourceConnectionIds).toContain(copyConn.id);
    expect(m.nodes[copyConn.targetId].targetConnectionIds).toContain(copyConn.id);

    // Original view untouched.
    expect(m.views[v1.viewId].childIds).toEqual(origView.childIds);
    expect(Object.values(m.nodes).filter((n) => n.viewId === v1.viewId)).toHaveLength(3);
    expect(Object.values(m.connections).filter((cn) => cn.viewId === v1.viewId)).toHaveLength(1);

    // The other view's connection was not copied.
    expect(Object.values(m.connections).filter((cn) => cn.viewId === v2.viewId)).toHaveLength(1);
  });
});

describe('duplicateItems — undo and filtering', () => {
  it('is a single undo step that removes every copy', () => {
    const v1 = buildViewWithContent('V1');
    const undoBefore = useStore.getState().undoStack.length;
    const nodeCountBefore = Object.keys(model().nodes).length;
    const connCountBefore = Object.keys(model().connections).length;

    const [copyId] = duplicateItems([v1.viewId]);
    expect(useStore.getState().undoStack).toHaveLength(undoBefore + 1);

    undo();
    const m = model();
    expect(m.views[copyId]).toBeUndefined();
    expect(Object.keys(m.nodes)).toHaveLength(nodeCountBefore);
    expect(Object.keys(m.connections)).toHaveLength(connCountBefore);
  });

  it('ignores relationships and folders and makes no undo entry', () => {
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessRole', 'B');
    const rel = addRelationship('AssociationRelationship', a, b)!;
    const folderId = model().elements[a].folderId;
    const undoBefore = useStore.getState().undoStack.length;

    expect(duplicateItems([rel])).toEqual([]);
    expect(duplicateItems([folderId])).toEqual([]);
    expect(useStore.getState().undoStack).toHaveLength(undoBefore);
  });
});

describe('duplicateViewObjects', () => {
  it('clones selected node subtrees in place with offset, same view and concepts', () => {
    const v = buildViewWithContent('V1');

    const newIds = duplicateViewObjects(v.viewId, [v.nodeA, v.nodeB], 16);
    const m = model();

    // Two roots duplicated (nodeA carries its nested child nodeC).
    expect(newIds).toHaveLength(2);
    const newA = m.nodes[newIds[0]];
    const newB = m.nodes[newIds[1]];
    expect(newA.viewId).toBe(v.viewId);
    expect(newB.viewId).toBe(v.viewId);

    // Roots offset by 16; concepts (elementId) reused, not new.
    const origA = m.nodes[v.nodeA];
    expect(newA.bounds.x).toBe(origA.bounds.x + 16);
    expect(newA.bounds.y).toBe(origA.bounds.y + 16);
    expect((newA as ElementNode).elementId).toBe(v.a);
    expect((newB as ElementNode).elementId).toBe(v.b);

    // Nested child cloned and re-parented under the new A (not offset itself).
    expect(newA.childIds).toHaveLength(1);
    const newC = m.nodes[newA.childIds[0]];
    expect(newC.parentId).toBe(newA.id);
    expect((newC as ElementNode).elementId).toBe(v.c);
    expect(newC.bounds).toEqual(m.nodes[v.nodeC].bounds);

    // View gained 3 nodes (A, B, C) → 6 total for this view.
    expect(Object.values(m.nodes).filter((n) => n.viewId === v.viewId)).toHaveLength(6);

    // The connection between the two duplicated nodes is copied and remapped.
    const viewConns = Object.values(m.connections).filter((c) => c.viewId === v.viewId);
    expect(viewConns).toHaveLength(2);
    const copyConn = viewConns.find((c) => c.id !== v.conn)!;
    expect(copyConn.relationshipId).toBe(v.rel);
    expect(copyConn.sourceId).toBe(newA.id);
    expect(copyConn.targetId).toBe(newB.id);
    expect(m.nodes[newA.id].sourceConnectionIds).toContain(copyConn.id);
  });

  it('drops a selected child when its parent is also selected (no double copy)', () => {
    const v = buildViewWithContent('V1');
    const newIds = duplicateViewObjects(v.viewId, [v.nodeA, v.nodeC], 16);
    // Only nodeA is a root; nodeC rides along as its child.
    expect(newIds).toHaveLength(1);
    expect(Object.values(model().nodes).filter((n) => n.viewId === v.viewId)).toHaveLength(5);
  });

  it('is one undo step and ignores connection-only selections', () => {
    const v = buildViewWithContent('V1');
    const undoBefore = useStore.getState().undoStack.length;

    expect(duplicateViewObjects(v.viewId, [v.conn], 16)).toEqual([]);
    expect(useStore.getState().undoStack).toHaveLength(undoBefore);

    const nodeCountBefore = Object.keys(model().nodes).length;
    duplicateViewObjects(v.viewId, [v.nodeA, v.nodeB], 16);
    expect(useStore.getState().undoStack).toHaveLength(undoBefore + 1);
    undo();
    expect(Object.keys(model().nodes)).toHaveLength(nodeCountBefore);
  });
});

describe('duplicateItems — archimate round-trip', () => {
  const archisurance = readFileSync(
    join(__dirname, 'fixtures', 'Archisurance.archimate'),
    'utf8',
  );

  it('a duplicated view survives serialize -> parse', () => {
    replaceModel(parseArchimate(archisurance), 'Archisurance.archimate');
    const sourceView = Object.values(model().views).find((v) => v.childIds.length > 0)!;
    const origNodeCount = Object.values(model().nodes).filter(
      (n) => n.viewId === sourceView.id,
    ).length;
    const origConnCount = Object.values(model().connections).filter(
      (c) => c.viewId === sourceView.id,
    ).length;

    const [copyId] = duplicateItems([sourceView.id]);

    const reparsed = parseArchimate(serializeArchimate(model()));
    const copyView = Object.values(reparsed.views).find(
      (v) => v.name === sourceView.name + ' (copy)',
    );
    expect(copyView).toBeDefined();
    expect(copyView!.id).toBe(copyId);
    expect(
      Object.values(reparsed.nodes).filter((n) => n.viewId === copyId),
    ).toHaveLength(origNodeCount);
    expect(
      Object.values(reparsed.connections).filter((c) => c.viewId === copyId),
    ).toHaveLength(origConnCount);
  });
});
