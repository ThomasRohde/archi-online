import { beforeEach, describe, expect, it } from 'vitest';
import {
  addNoteToView,
  addRefNodeToView,
  addView,
  createElementOnView,
  createEmptyModel,
  createRelationshipOnView,
  createProfile,
  deleteItems,
  importModelAsset,
  setConceptProfiles,
  setNodeStyle,
} from '../src/model/ops';
import { activateModelSession, addModelSession, getModelSession, resetWorkspaceForTests } from '../src/model/workspace';
import { undo } from '../src/model/store';
import {
  createCanvasTransferBundle,
  createTreeTransferBundle,
  pasteTransferBundle,
} from '../src/model/transfer';
import {
  copyNodes,
  copyTreeItems,
  pasteNodes,
  pasteTreeItems,
} from '../src/canvas/clipboard';

beforeEach(() => resetWorkspaceForTests());

function buildSourceModel() {
  const sessionId = addModelSession({ model: createEmptyModel('Source'), fileName: null });
  activateModelSession(sessionId);
  const viewId = addView('Source View');
  const actor = createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 10, y: 20, width: 120, height: 55 },
    'Customer',
  );
  const service = createElementOnView(
    'BusinessService',
    viewId,
    viewId,
    { x: 220, y: 20, width: 120, height: 55 },
    'Service',
  );
  const relationship = createRelationshipOnView(
    'ServingRelationship',
    viewId,
    service.nodeId,
    actor.nodeId,
  )!;
  return { sessionId, viewId, actor, service, relationship };
}

describe('cross-model transfer', () => {
  it('copies and deduplicates specialization and image assets across models', async () => {
    const source = buildSourceModel();
    const sourceSession = getModelSession(source.sessionId)!;
    const path = await importModelAsset(
      new Uint8Array([1, 2, 3, 4]),
      'actor.png',
      'image/png',
      sourceSession.store,
    );
    const profile = createProfile(
      { name: 'External party', conceptType: 'BusinessActor', imagePath: path },
      sourceSession.store,
    );
    setConceptProfiles(source.actor.elementId, [profile], sourceSession.store);
    setNodeStyle([source.actor.nodeId], { imageSource: 0, imagePosition: 2 }, sourceSession.store);

    const bundle = createTreeTransferBundle(
      source.sessionId,
      sourceSession.store.getState().model!,
      [source.viewId],
    );
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    const target = getModelSession(targetId)!;
    pasteTransferBundle(bundle, target.store, { targetSessionId: targetId });

    const pasted = target.store.getState().model!;
    const pastedActor = Object.values(pasted.elements).find((element) => element.name === 'Customer')!;
    const pastedProfile = pasted.profiles[pastedActor.profileIds[0]];
    expect(pastedProfile).toMatchObject({ name: 'External party', conceptType: 'BusinessActor' });
    expect(Array.from(pasted.assets[pastedProfile.imagePath!].bytes)).toEqual([1, 2, 3, 4]);
    expect(ArrayBuffer.isView(pasted.assets[pastedProfile.imagePath!].bytes)).toBe(true);
  });

  it('copies a whole view with fresh concept, relationship, node, and connection ids in one undo step', () => {
    const source = buildSourceModel();
    const sourceModel = getModelSession(source.sessionId)!.store.getState().model!;
    const bundle = createTreeTransferBundle(source.sessionId, sourceModel, [source.viewId]);
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    const target = getModelSession(targetId)!;

    const [newViewId] = pasteTransferBundle(bundle, target.store, { targetSessionId: targetId });
    const pasted = target.store.getState().model!;

    expect(newViewId).not.toBe(source.viewId);
    expect(Object.keys(pasted.views)).toHaveLength(1);
    expect(Object.keys(pasted.elements)).toHaveLength(2);
    expect(Object.keys(pasted.relationships)).toHaveLength(1);
    expect(Object.keys(pasted.nodes)).toHaveLength(2);
    expect(Object.keys(pasted.connections)).toHaveLength(1);
    expect(pasted.elements[source.actor.elementId]).toBeUndefined();
    expect(pasted.relationships[source.relationship.relationshipId]).toBeUndefined();
    expect(target.store.getState().undoStack).toHaveLength(1);

    const pastedRelationship = Object.values(pasted.relationships)[0];
    expect(pasted.elements[pastedRelationship.sourceId]).toBeDefined();
    expect(pasted.elements[pastedRelationship.targetId]).toBeDefined();
    expect(Object.values(pasted.nodes).every((node) => node.viewId === newViewId)).toBe(true);

    undo(target.store);
    expect(Object.keys(target.store.getState().model!.views)).toHaveLength(0);
    expect(Object.keys(target.store.getState().model!.elements)).toHaveLength(0);
  });

  it('pastes a canvas selection into another model and remaps referenced concepts', () => {
    const source = buildSourceModel();
    const sourceModel = getModelSession(source.sessionId)!.store.getState().model!;
    const bundle = createCanvasTransferBundle(
      source.sessionId,
      sourceModel,
      source.viewId,
      [source.actor.nodeId, source.service.nodeId],
    );
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    activateModelSession(targetId);
    const targetViewId = addView('Target View');
    const target = getModelSession(targetId)!;

    const newNodeIds = pasteTransferBundle(bundle, target.store, {
      targetSessionId: targetId,
      targetViewId,
    });
    const pasted = target.store.getState().model!;

    expect(newNodeIds).toHaveLength(2);
    expect(Object.keys(pasted.elements)).toHaveLength(2);
    expect(Object.keys(pasted.relationships)).toHaveLength(1);
    expect(Object.values(pasted.nodes).every((node) => node.viewId === targetViewId)).toBe(true);
    expect(Object.values(pasted.nodes).every((node) => {
      return node.nodeType !== 'element' || pasted.elements[node.elementId] !== undefined;
    })).toBe(true);
  });

  it('includes referenced views recursively and terminates reference cycles', () => {
    const sourceId = addModelSession({ model: createEmptyModel('Source'), fileName: null });
    activateModelSession(sourceId);
    const firstView = addView('First');
    const secondView = addView('Second');
    addRefNodeToView(firstView, secondView, firstView, { x: 0, y: 0, width: 200, height: 140 });
    addRefNodeToView(secondView, firstView, secondView, { x: 0, y: 0, width: 200, height: 140 });
    const model = getModelSession(sourceId)!.store.getState().model!;

    const bundle = createTreeTransferBundle(sourceId, model, [firstView]);

    expect(bundle.views).toHaveLength(2);
    expect(bundle.nodes).toHaveLength(2);
  });

  it('routes the shared clipboard to explicit source and target sessions', () => {
    const source = buildSourceModel();
    const sourceSession = getModelSession(source.sessionId)!;
    copyNodes(
      [source.actor.nodeId, source.service.nodeId],
      sourceSession.store,
      source.sessionId,
    );
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    activateModelSession(targetId);
    const targetViewId = addView('Target');
    const target = getModelSession(targetId)!;

    expect(pasteNodes(targetViewId, undefined, target.store, targetId)).toHaveLength(2);

    copyTreeItems(sourceSession.store, source.sessionId, [source.viewId]);
    expect(pasteTreeItems(target.store, targetId)).toHaveLength(1);
    expect(Object.keys(target.store.getState().model!.views)).toHaveLength(2);
  });

  it('pastes model-tree elements and views as visuals in another model view', () => {
    const source = buildSourceModel();
    const sourceSession = getModelSession(source.sessionId)!;
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    activateModelSession(targetId);
    const targetViewId = addView('Target View');
    const target = getModelSession(targetId)!;

    copyTreeItems(sourceSession.store, source.sessionId, [source.actor.elementId, source.viewId]);
    const pastedIds = pasteNodes(
      targetViewId,
      { x: 300, y: 180 },
      target.store,
      targetId,
    );
    const pasted = target.store.getState().model!;

    expect(pastedIds).toHaveLength(2);
    expect(pasted.nodes[pastedIds[0]]?.nodeType).toBe('element');
    expect(pasted.nodes[pastedIds[1]]?.nodeType).toBe('ref');
    expect(Object.keys(pasted.views)).toHaveLength(2);
    expect(Object.keys(pasted.elements)).toHaveLength(2);
    expect(Object.keys(pasted.relationships)).toHaveLength(1);
    expect(target.store.getState().undoStack).toHaveLength(2);
  });

  it('pastes a view selection into another model tree without canvas geometry', () => {
    const source = buildSourceModel();
    const sourceSession = getModelSession(source.sessionId)!;
    copyNodes(
      [source.actor.nodeId, source.service.nodeId],
      sourceSession.store,
      source.sessionId,
    );
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    const target = getModelSession(targetId)!;

    const pastedIds = pasteTreeItems(target.store, targetId);
    const pasted = target.store.getState().model!;

    expect(pastedIds).toHaveLength(2);
    expect(Object.keys(pasted.elements)).toHaveLength(2);
    expect(Object.keys(pasted.relationships)).toHaveLength(1);
    expect(Object.keys(pasted.views)).toHaveLength(0);
    expect(Object.keys(pasted.nodes)).toHaveLength(0);
    expect(Object.keys(pasted.connections)).toHaveLength(0);
    expect(target.store.getState().undoStack).toHaveLength(1);
  });

  it('reuses existing concepts when a view selection is pasted into its own model tree', () => {
    const source = buildSourceModel();
    const session = getModelSession(source.sessionId)!;
    copyNodes([source.actor.nodeId], session.store, source.sessionId);
    const beforeUndo = session.store.getState().undoStack.length;

    expect(pasteTreeItems(session.store, source.sessionId)).toEqual([source.actor.elementId]);
    expect(Object.keys(session.store.getState().model!.elements)).toHaveLength(2);
    expect(session.store.getState().undoStack).toHaveLength(beforeUndo);
  });

  it('rejects cross-context paste into a read-only model', () => {
    const source = buildSourceModel();
    const sourceSession = getModelSession(source.sessionId)!;
    copyTreeItems(sourceSession.store, source.sessionId, [source.actor.elementId]);
    const targetId = addModelSession({ model: createEmptyModel('Read only'), fileName: null });
    activateModelSession(targetId);
    const targetViewId = addView('Read-only target');
    const target = getModelSession(targetId)!;
    target.store.setState({ readOnly: true });

    expect(pasteNodes(targetViewId, undefined, target.store, targetId)).toEqual([]);
    expect(Object.keys(target.store.getState().model!.elements)).toHaveLength(0);
  });

  it('keeps same-model view-reference paste visual-only', () => {
    const sessionId = addModelSession({ model: createEmptyModel('Same'), fileName: null });
    activateModelSession(sessionId);
    const firstView = addView('First');
    const secondView = addView('Second');
    createElementOnView(
      'BusinessActor',
      secondView,
      secondView,
      { x: 10, y: 10, width: 120, height: 55 },
      'Nested dependency',
    );
    const refNode = addRefNodeToView(
      firstView,
      secondView,
      firstView,
      { x: 20, y: 20, width: 200, height: 140 },
    );
    const session = getModelSession(sessionId)!;
    const beforeNodes = Object.keys(session.store.getState().model!.nodes).length;
    copyNodes([refNode], session.store, sessionId);

    expect(pasteNodes(firstView, undefined, session.store, sessionId)).toHaveLength(1);
    expect(Object.keys(session.store.getState().model!.nodes)).toHaveLength(beforeNodes + 1);
    expect(Object.keys(session.store.getState().model!.elements)).toHaveLength(1);
  });

  it('creates fresh concepts when canvas objects are pasted into a view that already contains them', () => {
    const source = buildSourceModel();
    const session = getModelSession(source.sessionId)!;
    copyNodes(
      [source.actor.nodeId, source.service.nodeId],
      session.store,
      source.sessionId,
    );
    const undoBefore = session.store.getState().undoStack.length;

    const pastedIds = pasteNodes(
      source.viewId,
      undefined,
      session.store,
      source.sessionId,
    );
    const pasted = session.store.getState().model!;
    const pastedNodes = pastedIds.map((id) => pasted.nodes[id]);
    const pastedElementIds = pastedNodes.flatMap((node) =>
      node?.nodeType === 'element' ? [node.elementId] : [],
    );

    expect(pastedElementIds).toHaveLength(2);
    expect(pastedElementIds).not.toContain(source.actor.elementId);
    expect(pastedElementIds).not.toContain(source.service.elementId);
    expect(Object.keys(pasted.elements)).toHaveLength(4);
    expect(Object.keys(pasted.relationships)).toHaveLength(2);
    const pastedConnection = Object.values(pasted.connections).find(
      (connection) =>
        pastedIds.includes(connection.sourceId) && pastedIds.includes(connection.targetId),
    );
    expect(pastedConnection?.relationshipId).not.toBe(source.relationship.relationshipId);
    expect(session.store.getState().undoStack).toHaveLength(undoBefore + 1);

    undo(session.store);
    expect(Object.keys(session.store.getState().model!.elements)).toHaveLength(2);
    expect(Object.keys(session.store.getState().model!.relationships)).toHaveLength(1);
  });

  it('references existing concepts when canvas objects are pasted into another view without them', () => {
    const source = buildSourceModel();
    const session = getModelSession(source.sessionId)!;
    const targetViewId = addView('Other View');
    copyNodes(
      [source.actor.nodeId, source.service.nodeId],
      session.store,
      source.sessionId,
    );

    const pastedIds = pasteNodes(targetViewId, undefined, session.store, source.sessionId);
    const pasted = session.store.getState().model!;
    const pastedElementIds = pastedIds.flatMap((id) => {
      const node = pasted.nodes[id];
      return node?.nodeType === 'element' ? [node.elementId] : [];
    });

    expect(pastedElementIds.sort()).toEqual(
      [source.actor.elementId, source.service.elementId].sort(),
    );
    expect(Object.keys(pasted.elements)).toHaveLength(2);
    expect(Object.keys(pasted.relationships)).toHaveLength(1);
    const pastedConnection = Object.values(pasted.connections).find(
      (connection) => connection.viewId === targetViewId,
    );
    expect(pastedConnection?.relationshipId).toBe(source.relationship.relationshipId);
  });

  it('supports explicit same-view paste as references', () => {
    const source = buildSourceModel();
    const session = getModelSession(source.sessionId)!;
    copyNodes([source.actor.nodeId], session.store, source.sessionId);

    const [pastedId] = pasteNodes(
      source.viewId,
      undefined,
      session.store,
      source.sessionId,
      'reference',
    );
    const pastedNode = session.store.getState().model!.nodes[pastedId];

    expect(pastedNode.nodeType).toBe('element');
    expect(pastedNode.nodeType === 'element' && pastedNode.elementId).toBe(source.actor.elementId);
    expect(Object.keys(session.store.getState().model!.elements)).toHaveLength(2);
  });

  it.each(['same-view', 'other-view', 'tree'] as const)(
    'recreates concepts deleted after canvas copy when pasting to %s',
    (destination) => {
      const source = buildSourceModel();
      const session = getModelSession(source.sessionId)!;
      const targetViewId = destination === 'other-view' ? addView('Other View') : source.viewId;
      const bundle = createCanvasTransferBundle(
        source.sessionId,
        session.store.getState().model!,
        source.viewId,
        [source.actor.nodeId, source.service.nodeId],
      );
      deleteItems([source.actor.elementId], session.store);

      const pastedIds = pasteTransferBundle(bundle, session.store, {
        targetSessionId: source.sessionId,
        ...(destination === 'tree' ? {} : { targetViewId }),
      });
      const pasted = session.store.getState().model!;

      expect(pastedIds.length).toBeGreaterThan(0);
      if (destination === 'tree') {
        expect(pastedIds).toHaveLength(2);
        expect(pastedIds.every((id) => pasted.elements[id])).toBe(true);
        expect(pastedIds.map((id) => pasted.elements[id].name).sort()).toEqual(
          ['Customer', 'Service'],
        );
      } else {
        const pastedNodes = pastedIds.map((id) => pasted.nodes[id]).filter(Boolean);
        expect(pastedNodes.every((node) => node.nodeType !== 'element' || pasted.elements[node.elementId])).toBe(true);
        for (const connection of Object.values(pasted.connections).filter(
          (item) => item.viewId === targetViewId && pastedIds.includes(item.sourceId),
        )) {
          expect(connection.relationshipId && pasted.relationships[connection.relationshipId]).toBeDefined();
        }
      }
    },
  );

  it('recreates a relationship deleted after copy before pasting into another view', () => {
    const source = buildSourceModel();
    const session = getModelSession(source.sessionId)!;
    const targetViewId = addView('Other View');
    const bundle = createCanvasTransferBundle(
      source.sessionId,
      session.store.getState().model!,
      source.viewId,
      [source.actor.nodeId, source.service.nodeId],
    );
    deleteItems([source.relationship.relationshipId], session.store);

    const pastedIds = pasteTransferBundle(bundle, session.store, {
      targetSessionId: source.sessionId,
      targetViewId,
    });
    const pasted = session.store.getState().model!;
    const pastedConnection = Object.values(pasted.connections).find(
      (item) => item.viewId === targetViewId && pastedIds.includes(item.sourceId),
    );

    expect(pastedConnection?.relationshipId).toBeTruthy();
    expect(pasted.relationships[pastedConnection!.relationshipId!]).toBeDefined();
    expect(pasted.elements[pasted.relationships[pastedConnection!.relationshipId!].sourceId]).toBeDefined();
    expect(pasted.elements[pasted.relationships[pastedConnection!.relationshipId!].targetId]).toBeDefined();
  });

  it('recreates a referenced view deleted after copying its reference node', () => {
    const sessionId = addModelSession({ model: createEmptyModel('References'), fileName: null });
    const sourceViewId = addView('Source');
    const referencedViewId = addView('Referenced');
    createElementOnView(
      'BusinessActor',
      referencedViewId,
      referencedViewId,
      { x: 10, y: 10, width: 120, height: 55 },
      'Dependency',
    );
    const refNodeId = addRefNodeToView(
      sourceViewId,
      referencedViewId,
      sourceViewId,
      { x: 20, y: 20, width: 200, height: 140 },
    );
    const session = getModelSession(sessionId)!;
    const bundle = createCanvasTransferBundle(
      sessionId,
      session.store.getState().model!,
      sourceViewId,
      [refNodeId],
    );
    deleteItems([referencedViewId], session.store);

    const [pastedId] = pasteTransferBundle(bundle, session.store, {
      targetSessionId: sessionId,
      targetViewId: sourceViewId,
    });
    const pasted = session.store.getState().model!;
    const pastedRef = pasted.nodes[pastedId];

    expect(pastedRef?.nodeType).toBe('ref');
    expect(pastedRef?.nodeType === 'ref' && pasted.views[pastedRef.refViewId]).toBeDefined();
    const restoredViewId = pastedRef?.nodeType === 'ref' ? pastedRef.refViewId : '';
    expect(Object.values(pasted.nodes).some((node) => node.viewId === restoredViewId)).toBe(true);
  });

  it('preserves source z-order when selection order is reversed', () => {
    const sessionId = addModelSession({ model: createEmptyModel('Z order'), fileName: null });
    const viewId = addView('View');
    const backId = addNoteToView(viewId, viewId, { x: 10, y: 10, width: 100, height: 60 }, 'Back');
    const frontId = addNoteToView(viewId, viewId, { x: 20, y: 20, width: 100, height: 60 }, 'Front');
    const session = getModelSession(sessionId)!;
    const bundle = createCanvasTransferBundle(
      sessionId,
      session.store.getState().model!,
      viewId,
      [frontId, backId],
    );

    expect(bundle.roots.map((root) => root.id)).toEqual([backId, frontId]);
    const pastedIds = pasteTransferBundle(bundle, session.store, {
      targetSessionId: sessionId,
      targetViewId: viewId,
    });
    const pasted = session.store.getState().model!;
    expect(pasted.views[viewId].childIds.slice(-2)).toEqual(pastedIds);
    expect(pastedIds.map((id) => pasted.nodes[id].nodeType === 'note' && pasted.nodes[id].content))
      .toEqual(['Back', 'Front']);
  });
});
