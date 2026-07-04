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
});
