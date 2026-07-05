import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addNoteToView,
  addRefNodeToView,
  addRelationship,
  addView,
  alignNodes,
  alignableNodeIds,
  createEmptyModel,
  matchSize,
  type AlignMode,
  type MatchMode,
} from '../src/model/ops';
import { replaceModel, undo, useStore } from '../src/model/store';
import { absoluteBounds, type Bounds } from '../src/model/types';

function model() {
  return useStore.getState().model!;
}

function nodeBounds(id: string): Bounds {
  return { ...model().nodes[id].bounds };
}

function nodeBoundsById(ids: string[]): Record<string, Bounds> {
  return Object.fromEntries(ids.map((id) => [id, nodeBounds(id)]));
}

function addActorNode(viewId: string, bounds: Bounds, parentId = viewId): string {
  const elementId = addElement('BusinessActor');
  return addElementNodeToView(viewId, elementId, parentId, bounds, false);
}

function createThreeTopLevelNodes(): string[] {
  const viewId = addView('Alignment');
  return [
    addActorNode(viewId, { x: 10, y: 20, width: 100, height: 50 }),
    addActorNode(viewId, { x: 200, y: 100, width: 80, height: 70 }),
    addActorNode(viewId, { x: 80, y: 220, width: 120, height: 40 }),
  ];
}

beforeEach(() => {
  replaceModel(createEmptyModel('Alignment Test'), null);
});

describe('alignment ops', () => {
  it.each<[AlignMode, Bounds[]]>([
    [
      'left',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 10, y: 100, width: 80, height: 70 },
        { x: 10, y: 220, width: 120, height: 40 },
      ],
    ],
    [
      'center',
      [
        { x: 95, y: 20, width: 100, height: 50 },
        { x: 105, y: 100, width: 80, height: 70 },
        { x: 85, y: 220, width: 120, height: 40 },
      ],
    ],
    [
      'right',
      [
        { x: 180, y: 20, width: 100, height: 50 },
        { x: 200, y: 100, width: 80, height: 70 },
        { x: 160, y: 220, width: 120, height: 40 },
      ],
    ],
    [
      'top',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 20, width: 80, height: 70 },
        { x: 80, y: 20, width: 120, height: 40 },
      ],
    ],
    [
      'middle',
      [
        { x: 10, y: 115, width: 100, height: 50 },
        { x: 200, y: 105, width: 80, height: 70 },
        { x: 80, y: 120, width: 120, height: 40 },
      ],
    ],
    [
      'bottom',
      [
        { x: 10, y: 210, width: 100, height: 50 },
        { x: 200, y: 190, width: 80, height: 70 },
        { x: 80, y: 220, width: 120, height: 40 },
      ],
    ],
  ])('aligns three top-level nodes to %s in one undoable step', (mode, expected) => {
    const ids = createThreeTopLevelNodes();
    const before = nodeBoundsById(ids);
    const undoDepth = useStore.getState().undoStack.length;

    alignNodes(ids, mode);

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Align');
    expect(ids.map(nodeBounds)).toEqual(expected);

    undo();
    expect(nodeBoundsById(ids)).toEqual(before);
  });

  it.each<[MatchMode, Bounds[]]>([
    [
      'width',
      [
        { x: 10, y: 20, width: 120, height: 50 },
        { x: 200, y: 100, width: 120, height: 70 },
        { x: 80, y: 220, width: 120, height: 40 },
      ],
    ],
    [
      'height',
      [
        { x: 10, y: 20, width: 100, height: 70 },
        { x: 200, y: 100, width: 80, height: 70 },
        { x: 80, y: 220, width: 120, height: 70 },
      ],
    ],
    [
      'both',
      [
        { x: 10, y: 20, width: 120, height: 70 },
        { x: 200, y: 100, width: 120, height: 70 },
        { x: 80, y: 220, width: 120, height: 70 },
      ],
    ],
  ])('matches %s to the largest selected dimensions in one undoable step', (mode, expected) => {
    const ids = createThreeTopLevelNodes();
    const before = nodeBoundsById(ids);
    const undoDepth = useStore.getState().undoStack.length;

    matchSize(ids, mode);

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Match Size');
    expect(ids.map(nodeBounds)).toEqual(expected);

    undo();
    expect(nodeBoundsById(ids)).toEqual(before);
  });

  it('skips a nested child when its parent is also selected', () => {
    const viewId = addView('Nested');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 200, height: 120 });
    const childId = addActorNode(viewId, { x: 40, y: 30, width: 60, height: 30 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 360, y: 200, width: 80, height: 40 });
    const childBefore = nodeBounds(childId);

    expect(alignableNodeIds(model(), [parentId, childId, siblingId])).toEqual([parentId, siblingId]);

    alignNodes([parentId, childId, siblingId], 'center');

    expect(nodeBounds(parentId)).toEqual({ x: 170, y: 50, width: 200, height: 120 });
    expect(nodeBounds(siblingId)).toEqual({ x: 230, y: 200, width: 80, height: 40 });
    expect(nodeBounds(childId)).toEqual(childBefore);
    expect(absoluteBounds(model(), childId).x).toBe(210);
  });

  it('skips a nested child during match size when its parent is also selected', () => {
    const viewId = addView('Nested Match');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 200, height: 120 });
    const childId = addActorNode(viewId, { x: 40, y: 30, width: 60, height: 30 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 360, y: 200, width: 80, height: 40 });
    const childBefore = nodeBounds(childId);

    matchSize([parentId, childId, siblingId], 'both');

    expect(nodeBounds(parentId)).toEqual({ x: 100, y: 50, width: 200, height: 120 });
    expect(nodeBounds(siblingId)).toEqual({ x: 360, y: 200, width: 200, height: 120 });
    expect(nodeBounds(childId)).toEqual(childBefore);
  });

  it('aligns a nested node by absolute coordinates when its parent is not selected', () => {
    const viewId = addView('Nested');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 300, height: 200 });
    const childId = addActorNode(viewId, { x: 80, y: 90, width: 60, height: 40 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 120, y: 100, width: 80, height: 60 });

    alignNodes([childId, siblingId], 'left');
    alignNodes([childId, siblingId], 'top');

    expect(nodeBounds(childId)).toEqual({ x: 20, y: 50, width: 60, height: 40 });
    expect(absoluteBounds(model(), childId)).toEqual({ x: 120, y: 100, width: 60, height: 40 });
    expect(nodeBounds(siblingId)).toEqual({ x: 120, y: 100, width: 80, height: 60 });
  });

  it('accepts element, group, note, and ref nodes', () => {
    const viewId = addView('Mixed');
    const refViewId = addView('Referenced');
    const elementId = addActorNode(viewId, { x: 80, y: 10, width: 100, height: 50 });
    const groupId = addGroupToView(viewId, viewId, { x: 40, y: 80, width: 160, height: 90 });
    const noteId = addNoteToView(viewId, viewId, { x: 120, y: 200, width: 90, height: 70 });
    const refId = addRefNodeToView(viewId, refViewId, viewId, { x: 200, y: 300, width: 110, height: 60 });
    const ids = [elementId, groupId, noteId, refId];

    expect(alignableNodeIds(model(), ids)).toEqual(ids);

    alignNodes(ids, 'left');

    expect(ids.map((id) => nodeBounds(id).x)).toEqual([40, 40, 40, 40]);
  });

  it('ignores connections and leaves single-node effective selections without undo entries', () => {
    const viewId = addView('Connections');
    const actorId = addElement('BusinessActor');
    const roleId = addElement('BusinessRole');
    const relationshipId = addRelationship('AssignmentRelationship', actorId, roleId)!;
    const actorNodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 10, y: 20, width: 100, height: 50 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      roleId,
      viewId,
      { x: 200, y: 20, width: 120, height: 55 },
      false,
    );
    const connectionId = addConnectionToView(viewId, relationshipId, actorNodeId, roleNodeId);
    const before = nodeBounds(actorNodeId);
    const undoDepth = useStore.getState().undoStack.length;

    expect(alignableNodeIds(model(), [actorNodeId, connectionId, 'missing'])).toEqual([actorNodeId]);

    alignNodes([actorNodeId, connectionId, 'missing'], 'left');
    matchSize([actorNodeId, connectionId], 'both');

    expect(nodeBounds(actorNodeId)).toEqual(before);
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });

  it('does not create undo entries when alignment or size matching changes nothing', () => {
    const viewId = addView('No changes');
    const firstId = addActorNode(viewId, { x: 40, y: 20, width: 100, height: 50 });
    const secondId = addActorNode(viewId, { x: 40, y: 120, width: 100, height: 50 });
    const before = nodeBoundsById([firstId, secondId]);
    const undoDepth = useStore.getState().undoStack.length;

    alignNodes([firstId, secondId], 'left');
    matchSize([firstId, secondId], 'both');

    expect(nodeBoundsById([firstId, secondId])).toEqual(before);
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });
});
