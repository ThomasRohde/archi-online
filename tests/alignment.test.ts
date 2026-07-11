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
  distributeNodes,
  matchSize,
  type AlignMode,
  type MatchMode,
} from '../src/model/ops';
import { replaceModel, undo } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
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
  // Anchor = the first selected node (index 0): {10,20,100,50}.
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
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 20, y: 100, width: 80, height: 70 },
        { x: 0, y: 220, width: 120, height: 40 },
      ],
    ],
    [
      'right',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 30, y: 100, width: 80, height: 70 },
        { x: -10, y: 220, width: 120, height: 40 },
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
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 10, width: 80, height: 70 },
        { x: 80, y: 25, width: 120, height: 40 },
      ],
    ],
    [
      'bottom',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 0, width: 80, height: 70 },
        { x: 80, y: 30, width: 120, height: 40 },
      ],
    ],
  ])('aligns to the first-selected anchor (%s) in one undoable step', (mode, expected) => {
    const ids = createThreeTopLevelNodes();
    const before = nodeBoundsById(ids);
    const undoDepth = useStore.getState().undoStack.length;

    alignNodes(ids, mode, 'first');

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Align');
    expect(ids.map(nodeBounds)).toEqual(expected);

    undo();
    expect(nodeBoundsById(ids)).toEqual(before);
  });

  it('uses the last-selected node as the anchor when configured', () => {
    const ids = createThreeTopLevelNodes(); // anchor = ids[2]: {80,220,120,40}

    alignNodes(ids, 'left', 'last');

    expect(ids.map((id) => nodeBounds(id).x)).toEqual([80, 80, 80]);
  });

  // Anchor = the first selected node (index 0): width 100, height 50.
  it.each<[MatchMode, Bounds[]]>([
    [
      'width',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 100, width: 100, height: 70 },
        { x: 80, y: 220, width: 100, height: 40 },
      ],
    ],
    [
      'height',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 100, width: 80, height: 50 },
        { x: 80, y: 220, width: 120, height: 50 },
      ],
    ],
    [
      'both',
      [
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 100, width: 100, height: 50 },
        { x: 80, y: 220, width: 100, height: 50 },
      ],
    ],
  ])('matches %s to the anchor dimensions in one undoable step', (mode, expected) => {
    const ids = createThreeTopLevelNodes();
    const before = nodeBoundsById(ids);
    const undoDepth = useStore.getState().undoStack.length;

    matchSize(ids, mode, 'first');

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Match Size');
    expect(ids.map(nodeBounds)).toEqual(expected);

    undo();
    expect(nodeBoundsById(ids)).toEqual(before);
  });

  it('distributes horizontally with equal gaps, keeping the outermost nodes fixed', () => {
    const viewId = addView('Distribute H');
    const a = addActorNode(viewId, { x: 0, y: 10, width: 50, height: 50 });
    const b = addActorNode(viewId, { x: 100, y: 20, width: 50, height: 50 });
    const c = addActorNode(viewId, { x: 300, y: 30, width: 50, height: 50 });
    const before = nodeBoundsById([a, b, c]);
    const undoDepth = useStore.getState().undoStack.length;

    distributeNodes([a, b, c], 'horizontal');

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Distribute');
    expect(nodeBounds(a)).toEqual({ x: 0, y: 10, width: 50, height: 50 });
    expect(nodeBounds(b)).toEqual({ x: 150, y: 20, width: 50, height: 50 });
    expect(nodeBounds(c)).toEqual({ x: 300, y: 30, width: 50, height: 50 });

    undo();
    expect(nodeBoundsById([a, b, c])).toEqual(before);
  });

  it('distributes vertically with equal gaps, keeping the outermost nodes fixed', () => {
    const viewId = addView('Distribute V');
    const a = addActorNode(viewId, { x: 10, y: 0, width: 50, height: 50 });
    const b = addActorNode(viewId, { x: 20, y: 100, width: 50, height: 50 });
    const c = addActorNode(viewId, { x: 30, y: 300, width: 50, height: 50 });

    distributeNodes([a, b, c], 'vertical');

    expect(nodeBounds(a)).toEqual({ x: 10, y: 0, width: 50, height: 50 });
    expect(nodeBounds(b)).toEqual({ x: 20, y: 150, width: 50, height: 50 });
    expect(nodeBounds(c)).toEqual({ x: 30, y: 300, width: 50, height: 50 });
  });

  it('does not distribute fewer than three nodes', () => {
    const viewId = addView('Distribute pair');
    const a = addActorNode(viewId, { x: 0, y: 0, width: 50, height: 50 });
    const b = addActorNode(viewId, { x: 200, y: 0, width: 50, height: 50 });
    const before = nodeBoundsById([a, b]);
    const undoDepth = useStore.getState().undoStack.length;

    distributeNodes([a, b], 'horizontal');

    expect(nodeBoundsById([a, b])).toEqual(before);
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });

  it('skips a nested child when its parent is also selected', () => {
    const viewId = addView('Nested');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 200, height: 120 });
    const childId = addActorNode(viewId, { x: 40, y: 30, width: 60, height: 30 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 360, y: 200, width: 80, height: 40 });
    const childBefore = nodeBounds(childId);

    expect(alignableNodeIds(model(), [parentId, childId, siblingId])).toEqual([parentId, siblingId]);

    // Anchor = parentId (first selected of the filtered set).
    alignNodes([parentId, childId, siblingId], 'center', 'first');

    expect(nodeBounds(parentId)).toEqual({ x: 100, y: 50, width: 200, height: 120 });
    expect(nodeBounds(siblingId)).toEqual({ x: 160, y: 200, width: 80, height: 40 });
    expect(nodeBounds(childId)).toEqual(childBefore);
    expect(absoluteBounds(model(), childId).x).toBe(140);
  });

  it('skips a nested child during match size when its parent is also selected', () => {
    const viewId = addView('Nested Match');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 200, height: 120 });
    const childId = addActorNode(viewId, { x: 40, y: 30, width: 60, height: 30 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 360, y: 200, width: 80, height: 40 });
    const childBefore = nodeBounds(childId);

    // Anchor = parentId (first selected of the filtered set).
    matchSize([parentId, childId, siblingId], 'both', 'first');

    expect(nodeBounds(parentId)).toEqual({ x: 100, y: 50, width: 200, height: 120 });
    expect(nodeBounds(siblingId)).toEqual({ x: 360, y: 200, width: 200, height: 120 });
    expect(nodeBounds(childId)).toEqual(childBefore);
  });

  it('aligns a nested node by absolute coordinates when its parent is not selected', () => {
    const viewId = addView('Nested');
    const parentId = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 300, height: 200 });
    const childId = addActorNode(viewId, { x: 80, y: 90, width: 60, height: 40 }, parentId);
    const siblingId = addNoteToView(viewId, viewId, { x: 120, y: 100, width: 80, height: 60 });

    // Anchor = siblingId (last selected); the nested child aligns to it in
    // absolute view coordinates, then writes back relative to its parent.
    alignNodes([childId, siblingId], 'left', 'last');
    alignNodes([childId, siblingId], 'top', 'last');

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

    // Anchor = elementId (first selected), x = 80.
    alignNodes(ids, 'left', 'first');

    expect(ids.map((id) => nodeBounds(id).x)).toEqual([80, 80, 80, 80]);
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

    alignNodes([actorNodeId, connectionId, 'missing'], 'left', 'first');
    matchSize([actorNodeId, connectionId], 'both', 'first');

    expect(nodeBounds(actorNodeId)).toEqual(before);
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });

  it('does not create undo entries when alignment or size matching changes nothing', () => {
    const viewId = addView('No changes');
    const firstId = addActorNode(viewId, { x: 40, y: 20, width: 100, height: 50 });
    const secondId = addActorNode(viewId, { x: 40, y: 120, width: 100, height: 50 });
    const before = nodeBoundsById([firstId, secondId]);
    const undoDepth = useStore.getState().undoStack.length;

    alignNodes([firstId, secondId], 'left', 'first');
    matchSize([firstId, secondId], 'both', 'first');

    expect(nodeBoundsById([firstId, secondId])).toEqual(before);
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });
});
