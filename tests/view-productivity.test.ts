import { describe, expect, it } from 'vitest';
import {
  addElement,
  addElementNodeToView,
  addGroupToView,
  addImageToView,
  addLegendToView,
  addNoteToView,
  addRefNodeToView,
  addView,
  applyFormatPainterSnapshot,
  captureDiagramStyleSnapshot,
  createEmptyModel,
  createElementOnView,
  createPlainConnectionOnView,
  createRelationshipOnView,
  deleteViewObjectsKeepingChildren,
  reorderViewObjects,
  setNodeStyle,
  setPlainConnectionAttributes,
} from '../src/model/ops';
import { createModelStore, redo, undo, type ModelStore } from '../src/model/store';
import {
  computeAbsBounds,
  sameTypeViewObjectIds,
  snapMoveToAlignmentGuides,
  snapResizeToAlignmentGuides,
} from '../src/canvas/view-editor/bounds';

function orderedNotes(count = 4): {
  store: ModelStore;
  viewId: string;
  ids: string[];
} {
  const store = createModelStore({ model: createEmptyModel('View productivity') });
  const viewId = addView('View', undefined, store);
  const ids = Array.from({ length: count }, (_, index) =>
    addNoteToView(
      viewId,
      viewId,
      { x: index * 20, y: 0, width: 10, height: 10 },
      String(index),
      {},
      store,
    ),
  );
  store.setState({ dirty: false, undoStack: [], redoStack: [] });
  return { store, viewId, ids };
}

describe('diagram productivity operations', () => {
  it('moves a contiguous selection forward one layer without reordering it', () => {
    const { store, viewId, ids } = orderedNotes();

    reorderViewObjects([ids[1], ids[2]], 'forward', store);

    expect(store.getState().model!.views[viewId].childIds).toEqual([
      ids[0],
      ids[3],
      ids[1],
      ids[2],
    ]);
    expect(store.getState().undoStack.map((transaction) => transaction.label)).toEqual([
      'Bring Forward',
    ]);

    undo(store);
    expect(store.getState().model!.views[viewId].childIds).toEqual(ids);
  });

  it('moves a contiguous selection backward one layer without reordering it', () => {
    const { store, viewId, ids } = orderedNotes();

    reorderViewObjects([ids[1], ids[2]], 'backward', store);

    expect(store.getState().model!.views[viewId].childIds).toEqual([
      ids[1],
      ids[2],
      ids[0],
      ids[3],
    ]);
    expect(store.getState().undoStack.at(-1)?.label).toBe('Send Backward');
  });

  it.each([
    ['front', [0, 2, 1, 3], 'Bring to Front'],
    ['back', [1, 3, 0, 2], 'Send to Back'],
  ] as const)(
    'moves a non-contiguous selection to the %s while preserving relative order',
    (mode, expectedOrder, label) => {
      const { store, viewId, ids } = orderedNotes();

      reorderViewObjects([ids[1], ids[3]], mode, store);

      expect(store.getState().model!.views[viewId].childIds).toEqual(
        expectedOrder.map((index) => ids[index]),
      );
      expect(store.getState().undoStack.at(-1)?.label).toBe(label);
    },
  );

  it('does not add undo history when an ordering command has no effect', () => {
    const { store, ids } = orderedNotes();

    reorderViewObjects([ids[3]], 'front', store);

    expect(store.getState().undoStack).toEqual([]);
    expect(store.getState().dirty).toBe(false);
  });

  it('reorders selected objects in different parents as one action', () => {
    const store = createModelStore({ model: createEmptyModel('Parent ordering') });
    const viewId = addView('View', undefined, store);
    const parentIds = [0, 1].map((index) => addGroupToView(
      viewId,
      viewId,
      { x: index * 300, y: 0, width: 200, height: 200 },
      `Parent ${index}`,
      {},
      store,
    ));
    const childGroups = parentIds.map((parentId) => Array.from({ length: 3 }, (_, index) =>
      addNoteToView(
        viewId,
        parentId,
        { x: index * 20, y: 0, width: 10, height: 10 },
        String(index),
        {},
        store,
      ),
    ));
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    reorderViewObjects([childGroups[0][0], childGroups[1][0]], 'forward', store);

    const model = store.getState().model!;
    for (let index = 0; index < parentIds.length; index++) {
      expect(model.nodes[parentIds[index]].childIds).toEqual([
        childGroups[index][1],
        childGroups[index][0],
        childGroups[index][2],
      ]);
    }
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it('deletes a container while keeping children at their absolute positions', () => {
    const store = createModelStore({ model: createEmptyModel('Keep children') });
    const viewId = addView('View', undefined, store);
    const beforeId = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 0, width: 10, height: 10 },
      'Before',
      {},
      store,
    );
    const parentId = addGroupToView(
      viewId,
      viewId,
      { x: 100, y: 200, width: 200, height: 150 },
      'Parent',
      {},
      store,
    );
    const childId = addNoteToView(
      viewId,
      parentId,
      { x: 10, y: 20, width: 80, height: 40 },
      'Child',
      {},
      store,
    );
    const afterId = addNoteToView(
      viewId,
      viewId,
      { x: 400, y: 0, width: 10, height: 10 },
      'After',
      {},
      store,
    );
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    deleteViewObjectsKeepingChildren([parentId], store);

    const model = store.getState().model!;
    expect(model.nodes[parentId]).toBeUndefined();
    expect(model.nodes[childId]).toMatchObject({
      parentId: viewId,
      bounds: { x: 110, y: 220, width: 80, height: 40 },
    });
    expect(model.views[viewId].childIds).toEqual([beforeId, childId, afterId]);
    expect(store.getState().undoStack.map((transaction) => transaction.label)).toEqual([
      'Delete from View but Keep Children',
    ]);
  });

  it('keeps a nested subtree and its surviving connections through undo and redo', () => {
    const store = createModelStore({ model: createEmptyModel('Nested keep children') });
    const viewId = addView('View', undefined, store);
    const parentId = addGroupToView(
      viewId,
      viewId,
      { x: 100, y: 200, width: 240, height: 180 },
      'Parent',
      {},
      store,
    );
    const nestedId = addGroupToView(
      viewId,
      parentId,
      { x: 10, y: 20, width: 160, height: 100 },
      'Nested',
      {},
      store,
    );
    const childId = addNoteToView(
      viewId,
      nestedId,
      { x: 5, y: 6, width: 80, height: 40 },
      'Child',
      {},
      store,
    );
    const outsideId = addNoteToView(
      viewId,
      viewId,
      { x: 400, y: 100, width: 80, height: 40 },
      'Outside',
      {},
      store,
    );
    const removedConnectionId = createPlainConnectionOnView(
      viewId,
      parentId,
      childId,
      store,
    )!;
    const survivingConnectionId = createPlainConnectionOnView(
      viewId,
      childId,
      outsideId,
      store,
    )!;
    const beforeBounds = computeAbsBounds(store.getState().model!, viewId);
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    deleteViewObjectsKeepingChildren([parentId], store);

    let model = store.getState().model!;
    expect(model.nodes[parentId]).toBeUndefined();
    expect(model.nodes[nestedId]).toMatchObject({
      parentId: viewId,
      bounds: { x: 110, y: 220, width: 160, height: 100 },
    });
    expect(computeAbsBounds(model, viewId).get(childId)).toEqual(beforeBounds.get(childId));
    expect(model.connections[removedConnectionId]).toBeUndefined();
    expect(model.connections[survivingConnectionId]).toBeDefined();
    expect(store.getState().undoStack).toHaveLength(1);

    undo(store);
    model = store.getState().model!;
    expect(model.nodes[parentId]).toBeDefined();
    expect(model.connections[removedConnectionId]).toBeDefined();
    expect(model.connections[survivingConnectionId]).toBeDefined();

    redo(store);
    model = store.getState().model!;
    expect(model.nodes[parentId]).toBeUndefined();
    expect(model.connections[removedConnectionId]).toBeUndefined();
    expect(model.connections[survivingConnectionId]).toBeDefined();
  });

  it('finds the union of matching element and diagram object types in one view', () => {
    const store = createModelStore({ model: createEmptyModel('Same type') });
    const viewId = addView('View', undefined, store);
    const actorA = addElement('BusinessActor', 'A', undefined, store);
    const actorB = addElement('BusinessActor', 'B', undefined, store);
    const role = addElement('BusinessRole', 'Role', undefined, store);
    const actorNodeA = addElementNodeToView(
      viewId,
      actorA,
      viewId,
      { x: 0, y: 0, width: 100, height: 50 },
      false,
      {},
      store,
    );
    const roleNode = addElementNodeToView(
      viewId,
      role,
      viewId,
      { x: 120, y: 0, width: 100, height: 50 },
      false,
      {},
      store,
    );
    const actorNodeB = addElementNodeToView(
      viewId,
      actorB,
      viewId,
      { x: 240, y: 0, width: 100, height: 50 },
      false,
      {},
      store,
    );
    const noteA = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 80, width: 100, height: 50 },
      'A',
      {},
      store,
    );
    const legend = addLegendToView(
      viewId,
      viewId,
      { x: 120, y: 80, width: 100, height: 50 },
      undefined,
      {},
      store,
    )!;
    const noteB = addNoteToView(
      viewId,
      viewId,
      { x: 240, y: 80, width: 100, height: 50 },
      'B',
      {},
      store,
    );

    expect(
      sameTypeViewObjectIds(store.getState().model!, viewId, [actorNodeA, noteA]),
    ).toEqual([actorNodeA, actorNodeB, noteA, noteB]);
    expect(
      sameTypeViewObjectIds(store.getState().model!, viewId, [roleNode, legend]),
    ).toEqual([roleNode, legend]);
  });

  it('keeps every non-element diagram-object category distinct', () => {
    const store = createModelStore({ model: createEmptyModel('Diagram object types') });
    const viewId = addView('View', undefined, store);
    const referencedViewId = addView('Referenced', undefined, store);
    const ids = {
      group: [0, 1].map((index) => addGroupToView(
        viewId,
        viewId,
        { x: index * 100, y: 0, width: 80, height: 60 },
        `Group ${index}`,
        {},
        store,
      )),
      image: [0, 1].map((index) => addImageToView(
        viewId,
        viewId,
        { x: index * 100, y: 100, width: 80, height: 60 },
        `images/${index}.png`,
        {},
        store,
      )),
      ref: [0, 1].map((index) => addRefNodeToView(
        viewId,
        referencedViewId,
        viewId,
        { x: index * 100, y: 200, width: 80, height: 60 },
        {},
        store,
      )),
    };
    const noteEndpoints = [0, 1, 2].map((index) => addNoteToView(
      viewId,
      viewId,
      { x: index * 100, y: 300, width: 80, height: 60 },
      `Note ${index}`,
      {},
      store,
    ));
    const plain = [
      createPlainConnectionOnView(viewId, noteEndpoints[0], noteEndpoints[1], store)!,
      createPlainConnectionOnView(viewId, noteEndpoints[1], noteEndpoints[2], store)!,
    ];
    const relationshipEndpoints = [0, 1].map((index) => ({
      process: createElementOnView(
        'BusinessProcess',
        viewId,
        viewId,
        { x: index * 220, y: 400, width: 90, height: 50 },
        `Process ${index}`,
        {},
        store,
      ),
      object: createElementOnView(
        'BusinessObject',
        viewId,
        viewId,
        { x: index * 220 + 110, y: 400, width: 90, height: 50 },
        `Object ${index}`,
        {},
        store,
      ),
    }));
    const relationships = relationshipEndpoints.map((endpoints) => createRelationshipOnView(
      'AccessRelationship',
      viewId,
      endpoints.process.nodeId,
      endpoints.object.nodeId,
      store,
    )!.connectionId);
    const model = store.getState().model!;

    expect(sameTypeViewObjectIds(model, viewId, [ids.group[0]])).toEqual(ids.group);
    expect(sameTypeViewObjectIds(model, viewId, [ids.image[0]])).toEqual(ids.image);
    expect(sameTypeViewObjectIds(model, viewId, [ids.ref[0]])).toEqual(ids.ref);
    expect(sameTypeViewObjectIds(model, viewId, [plain[0]])).toEqual(plain);
    expect(sameTypeViewObjectIds(model, viewId, [relationships[0]])).toEqual(relationships);
    expect(sameTypeViewObjectIds(model, viewId, [ids.group[0]])).not.toContain(ids.image[0]);
  });

  it('snaps a moved edge to the nearest sibling guide within the screen threshold', () => {
    const store = createModelStore({ model: createEmptyModel('Guides') });
    const viewId = addView('View', undefined, store);
    const movingId = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 0, width: 10, height: 10 },
      'Moving',
      {},
      store,
    );
    addNoteToView(
      viewId,
      viewId,
      { x: 30, y: 20, width: 10, height: 10 },
      'Sibling',
      {},
      store,
    );
    const model = store.getState().model!;

    const result = snapMoveToAlignmentGuides(
      model,
      computeAbsBounds(model, viewId),
      [movingId],
      { x: 19, y: 0 },
      2,
    );

    expect(result.delta).toEqual({ x: 20, y: 0 });
    expect(result.snapped).toEqual({ x: true, y: false });
    expect(result.guides).toEqual([
      { orientation: 'vertical', position: 30, from: 0, to: 30 },
    ]);
  });

  it('snaps the active resize edge without moving the opposite edge', () => {
    const store = createModelStore({ model: createEmptyModel('Resize guides') });
    const viewId = addView('View', undefined, store);
    const resizingId = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 0, width: 10, height: 10 },
      'Resizing',
      {},
      store,
    );
    addNoteToView(
      viewId,
      viewId,
      { x: 30, y: 20, width: 10, height: 10 },
      'Sibling',
      {},
      store,
    );
    const model = store.getState().model!;

    const result = snapResizeToAlignmentGuides(
      model,
      computeAbsBounds(model, viewId),
      resizingId,
      { x: 0, y: 0, width: 29, height: 10 },
      'e',
      2,
      5,
    );

    expect(result.bounds).toEqual({ x: 0, y: 0, width: 30, height: 10 });
    expect(result.snapped).toEqual({ x: true, y: false });
    expect(result.guides[0]).toMatchObject({ orientation: 'vertical', position: 30 });
  });

  it('paints node appearance without copying bounds or content', () => {
    const store = createModelStore({ model: createEmptyModel('Painter') });
    const viewId = addView('View', undefined, store);
    const sourceId = addNoteToView(
      viewId,
      viewId,
      { x: 10, y: 20, width: 100, height: 50 },
      'Source content',
      {},
      store,
    );
    const targetId = addNoteToView(
      viewId,
      viewId,
      { x: 200, y: 220, width: 180, height: 90 },
      'Target content',
      {},
      store,
    );
    setNodeStyle(
      [sourceId],
      {
        fillColor: '#112233',
        lineColor: '#445566',
        fontColor: '#778899',
        alpha: 180,
        gradient: 2,
        textAlignment: 4,
      },
      store,
    );
    store.setState({ dirty: false, undoStack: [], redoStack: [] });
    const snapshot = captureDiagramStyleSnapshot(store.getState().model!, sourceId)!;

    expect(applyFormatPainterSnapshot(targetId, snapshot, store)).toBe(true);

    const target = store.getState().model!.nodes[targetId];
    expect(target).toMatchObject({
      bounds: { x: 200, y: 220, width: 180, height: 90 },
      content: 'Target content',
      fillColor: '#112233',
      lineColor: '#445566',
      fontColor: '#778899',
      alpha: 180,
      gradient: 2,
      textAlignment: 4,
    });
    expect(store.getState().undoStack.map((transaction) => transaction.label)).toEqual([
      'Apply Format',
    ]);
  });

  it('copies plain connection appearance and arrows without topology', () => {
    const store = createModelStore({ model: createEmptyModel('Connection painter') });
    const viewId = addView('View', undefined, store);
    const nodes = Array.from({ length: 4 }, (_, index) => addNoteToView(
      viewId,
      viewId,
      { x: index * 100, y: 0, width: 50, height: 30 },
      String(index),
      {},
      store,
    ));
    const sourceId = createPlainConnectionOnView(viewId, nodes[0], nodes[1], store, 0x15)!;
    const targetId = createPlainConnectionOnView(viewId, nodes[2], nodes[3], store, 0x02)!;
    setNodeStyle(
      [sourceId],
      { lineColor: '#102030', fontColor: '#405060', lineWidth: 3, lineStyle: 2 },
      store,
    );
    setPlainConnectionAttributes(sourceId, { connectionType: 0x15 }, store);
    const targetEndpoints = {
      sourceId: store.getState().model!.connections[targetId].sourceId,
      targetId: store.getState().model!.connections[targetId].targetId,
    };
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    const snapshot = captureDiagramStyleSnapshot(store.getState().model!, sourceId)!;
    expect(applyFormatPainterSnapshot(targetId, snapshot, store)).toBe(true);

    expect(store.getState().model!.connections[targetId]).toMatchObject({
      ...targetEndpoints,
      connectionType: 0x15,
      lineColor: '#102030',
      fontColor: '#405060',
      lineWidth: 3,
      lineStyle: 2,
    });
    expect(store.getState().undoStack.map((transaction) => transaction.label)).toEqual([
      'Apply Format',
    ]);
  });

  it('skips missing custom images while applying the remaining node style', () => {
    const store = createModelStore({ model: createEmptyModel('Missing painter asset') });
    const viewId = addView('View', undefined, store);
    const sourceId = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 0, width: 100, height: 50 },
      'Source',
      {},
      store,
    );
    const targetId = addNoteToView(
      viewId,
      viewId,
      { x: 150, y: 0, width: 100, height: 50 },
      'Target',
      {},
      store,
    );
    setNodeStyle(
      [sourceId],
      { fillColor: '#336699', imagePath: 'images/missing.png', imageSource: 1 },
      store,
    );
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    const snapshot = captureDiagramStyleSnapshot(store.getState().model!, sourceId)!;
    expect(applyFormatPainterSnapshot(targetId, snapshot, store)).toBe(true);

    expect(store.getState().model!.nodes[targetId]).toMatchObject({ fillColor: '#336699' });
    expect(store.getState().model!.nodes[targetId].imagePath).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(1);
    undo(store);
    expect(store.getState().model!.nodes[targetId].fillColor).toBeUndefined();
  });

  it('copies only shared line and typography fields across node and connection targets', () => {
    const store = createModelStore({ model: createEmptyModel('Cross-kind painter') });
    const viewId = addView('View', undefined, store);
    const sourceId = addNoteToView(
      viewId,
      viewId,
      { x: 0, y: 0, width: 100, height: 50 },
      'Source',
      {},
      store,
    );
    const targetNodeId = addNoteToView(
      viewId,
      viewId,
      { x: 150, y: 0, width: 100, height: 50 },
      'Target',
      {},
      store,
    );
    const connectionId = createPlainConnectionOnView(
      viewId,
      sourceId,
      targetNodeId,
      store,
      0x2a,
    )!;
    setNodeStyle(
      [sourceId],
      {
        fillColor: '#abcdef',
        lineColor: '#123456',
        fontColor: '#654321',
        fontStyle: { family: 'Segoe UI', sizePt: 11, bold: true, italic: false },
      },
      store,
    );
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    const snapshot = captureDiagramStyleSnapshot(store.getState().model!, sourceId)!;
    expect(applyFormatPainterSnapshot(connectionId, snapshot, store)).toBe(true);

    expect(store.getState().model!.connections[connectionId]).toMatchObject({
      lineColor: '#123456',
      fontColor: '#654321',
      fontStyle: { family: 'Segoe UI', sizePt: 11, bold: true, italic: false },
      connectionType: 0x2a,
    });
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
