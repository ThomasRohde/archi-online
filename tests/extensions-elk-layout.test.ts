import { beforeEach, describe, expect, it } from 'vitest';
import { createAppApi } from '../src/extensions/app-api';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addRelationship,
  addView,
  createEmptyModel,
  setConnectionBendpoints,
} from '../src/model/ops';
import { openView, replaceModel, setSelection, useStore } from '../src/model/store';

function model() {
  return useStore.getState().model!;
}

describe('ELK extension layout API', () => {
  beforeEach(() => {
    replaceModel(createEmptyModel('ELK Test'), null);
  });

  it('lays out the whole active view when fewer than two nodes are selected', async () => {
    const viewId = addView('Main');
    const actorId = addElement('BusinessActor', 'Actor');
    const roleId = addElement('BusinessRole', 'Role');
    const actorNodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      roleId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
    );
    openView(viewId);
    setSelection('view', [actorNodeId]);

    const result = await createAppApi('local.elk').layout.elk({ direction: 'right' });

    const nodes = model().nodes;
    expect(result.scope).toBe('view');
    expect(result.nodeCount).toBe(2);
    expect([nodes[actorNodeId].bounds.x, nodes[actorNodeId].bounds.y]).not.toEqual([
      nodes[roleNodeId].bounds.x,
      nodes[roleNodeId].bounds.y,
    ]);
  });

  it('uses selected root nodes and preserves unrelated nodes', async () => {
    const viewId = addView('Main');
    const actorId = addElement('BusinessActor', 'Actor');
    const roleId = addElement('BusinessRole', 'Role');
    const objectId = addElement('BusinessObject', 'Object');
    const actorNodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      roleId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
    );
    const objectNodeId = addElementNodeToView(
      viewId,
      objectId,
      viewId,
      { x: 400, y: 300, width: 120, height: 55 },
      false,
    );
    openView(viewId);
    setSelection('view', [actorNodeId, roleNodeId]);

    const result = await createAppApi('local.elk').layout.elk({ direction: 'down' });

    expect(result.scope).toBe('selection');
    expect(result.nodeCount).toBe(2);
    expect(model().nodes[objectNodeId].bounds).toEqual({
      x: 400,
      y: 300,
      width: 120,
      height: 55,
    });
  });

  it('preserves connection bends when edge routing is preserve', async () => {
    const viewId = addView('Main');
    const actorId = addElement('BusinessActor', 'Actor');
    const roleId = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship('AssignmentRelationship', actorId, roleId)!;
    const actorNodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 0, y: 0, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      roleId,
      viewId,
      { x: 0, y: 120, width: 120, height: 55 },
      false,
    );
    const connectionId = addConnectionToView(viewId, relationshipId, actorNodeId, roleNodeId);
    setConnectionBendpoints(connectionId, [
      { startX: 10, startY: 20, endX: -10, endY: -20 },
    ]);
    openView(viewId);

    await createAppApi('local.elk').layout.elk({ scope: 'view', edgeRouting: 'preserve' });

    expect(model().connections[connectionId].bendpoints).toEqual([
      { startX: 10, startY: 20, endX: -10, endY: -20 },
    ]);
  });

  it('reduces selected children to selected root visuals', async () => {
    const viewId = addView('Main');
    const actorId = addElement('BusinessActor', 'Actor');
    const roleId = addElement('BusinessRole', 'Role');
    const groupId = addGroupToView(viewId, viewId, { x: 10, y: 10, width: 220, height: 120 });
    const childId = addElementNodeToView(
      viewId,
      actorId,
      groupId,
      { x: 20, y: 20, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      roleId,
      viewId,
      { x: 400, y: 10, width: 120, height: 55 },
      false,
    );
    openView(viewId);
    setSelection('view', [groupId, childId, roleNodeId]);

    const result = await createAppApi('local.elk').layout.elk({ direction: 'right' });

    expect(result.scope).toBe('selection');
    expect(result.nodeCount).toBe(2);
  });

  it('anchors the layout to the scope origin and is stable across repeated applies', async () => {
    const viewId = addView('Main');
    const nodeIds: string[] = [];
    let previousElementId: string | null = null;
    for (let i = 0; i < 4; i++) {
      const elementId = addElement('BusinessActor', `A${i}`);
      const nodeId = addElementNodeToView(
        viewId,
        elementId,
        viewId,
        { x: 40 + i * 10, y: 30 + i * 10, width: 120, height: 55 },
        false,
      );
      nodeIds.push(nodeId);
      if (previousElementId) {
        const relId = addRelationship('AssociationRelationship', previousElementId, elementId)!;
        addConnectionToView(viewId, relId, nodeIds[i - 1], nodeId);
      }
      previousElementId = elementId;
    }
    openView(viewId);

    const api = createAppApi('local.elk');
    const boundsOf = () => nodeIds.map((id) => ({ ...model().nodes[id].bounds }));
    const originOf = (bounds: { x: number; y: number }[]) => ({
      x: Math.min(...bounds.map((b) => b.x)),
      y: Math.min(...bounds.map((b) => b.y)),
    });

    const before = boundsOf();
    const startOrigin = originOf(before);

    await api.layout.elk({ scope: 'view', direction: 'right' });
    const first = boundsOf();
    // Top-left of the laid-out cluster stays where it started (no ELK padding offset).
    expect(originOf(first)).toEqual(startOrigin);

    await api.layout.elk({ scope: 'view', direction: 'right' });
    const second = boundsOf();
    // Re-applying with the same options must not drift the diagram.
    expect(second).toEqual(first);
  });
});
