import { describe, expect, it } from 'vitest';
import * as geometry from '../src/canvas/geometry';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import * as ops from '../src/model/ops';
import { attachConnection, attachNode } from '../src/model/ops/draft';
import {
  createModelStore,
  redo,
  setActiveModelStore,
  undo,
  type ModelStore,
} from '../src/model/store';
import type { Bounds, ModelState } from '../src/model/types';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  type AppSettings,
} from '../src/settings/app-settings';
import { memoryKeyValueStore } from '../src/persistence/keyval';
import { JView } from '../src/scripting/jarchi/wrappers';

type AnalyzeNestingChange = (
  model: ModelState,
  input: {
    viewId: string;
    trigger: 'palette' | 'tree' | 'move';
    entries: Array<Record<string, unknown>>;
  },
  settings?: AppSettings,
) => {
  children: Array<{
    childNodeId: string;
    candidates: Array<{
      id: string;
      direction: 'normal' | 'reverse';
      relationshipType: string;
      sourceElementId: string;
      targetElementId: string;
    }>;
    reusableRelationships: Array<{ relationshipId: string }>;
    missingOccurrences: Array<{ relationshipId: string; sourceNodeId: string; targetNodeId: string }>;
  }>;
  missingOccurrences: Array<{
    connectionId: string;
    relationshipId: string;
    sourceNodeId: string;
    targetNodeId: string;
  }>;
  visibilityChanges: Array<{ connectionId: string; before: boolean; after: boolean }>;
};

type ApplyNestingChange = (
  plan: ReturnType<AnalyzeNestingChange>,
  selections?: Record<string, string | null>,
  store?: ModelStore,
) => { nodeIds: string[]; relationshipIds: string[]; connectionIds: string[] };

type IsConnectionHiddenByNesting = (
  model: ModelState,
  connectionId: string,
  settings?: AppSettings,
) => boolean;

const analyzeNestingChange = (ops as typeof ops & {
  analyzeNestingChange?: AnalyzeNestingChange;
}).analyzeNestingChange;
const applyNestingChange = (ops as typeof ops & {
  applyNestingChange?: ApplyNestingChange;
}).applyNestingChange;
const isConnectionHiddenByNesting = (ops as typeof ops & {
  isConnectionHiddenByNesting?: IsConnectionHiddenByNesting;
}).isConnectionHiddenByNesting;

const ARM_BITS = {
  CompositionRelationship: 1 << 9,
  AggregationRelationship: 1 << 8,
  AccessRelationship: 1 << 1,
  AssignmentRelationship: 1 << 7,
  RealizationRelationship: 1 << 5,
  ServingRelationship: 1 << 2,
  InfluenceRelationship: 1 << 10,
  SpecializationRelationship: 1 << 6,
  AssociationRelationship: 1 << 0,
  TriggeringRelationship: 1 << 4,
  FlowRelationship: 1 << 3,
} as const;

const BOUNDS: Bounds = { x: 20, y: 20, width: 120, height: 55 };

function makeStore(name = 'ARM'): ModelStore {
  return createModelStore({ model: createEmptyModel(name) });
}

function addElementTo(
  store: ModelStore,
  type: Parameters<typeof addElement>[0],
  name: string,
): string {
  return addElement(type, name, undefined, store);
}

function addViewTo(store: ModelStore, name = 'View'): string {
  return addView(name, undefined, store);
}

function addNodeTo(
  store: ModelStore,
  viewId: string,
  elementId: string,
  parentId: string,
  bounds: Bounds,
): string {
  return addElementNodeToView(viewId, elementId, parentId, bounds, false, {}, store);
}

function requireArmFunctions(): {
  analyze: AnalyzeNestingChange;
  apply: ApplyNestingChange;
} | null {
  expect(analyzeNestingChange, 'analyzeNestingChange must be exported from model ops').toBeTypeOf(
    'function',
  );
  expect(applyNestingChange, 'applyNestingChange must be exported from model ops').toBeTypeOf(
    'function',
  );
  if (!analyzeNestingChange || !applyNestingChange) return null;
  return { analyze: analyzeNestingChange, apply: applyNestingChange };
}

function moveInput(viewId: string, childNodeId: string, parentId: string, bounds = BOUNDS) {
  return {
    viewId,
    trigger: 'move' as const,
    entries: [{ kind: 'move', nodeId: childNodeId, parentId, bounds }],
  };
}

describe('automatic relationship settings', () => {
  it('uses the exact Desktop Archi ARM defaults and IndexedDB normalization', async () => {
    const expectedNormal =
      ARM_BITS.CompositionRelationship |
      ARM_BITS.AggregationRelationship |
      ARM_BITS.AssignmentRelationship |
      ARM_BITS.SpecializationRelationship |
      ARM_BITS.RealizationRelationship |
      ARM_BITS.AccessRelationship;
    const allRelationships = Object.values(ARM_BITS).reduce((mask, bit) => mask | bit, 0);

    expect(DEFAULT_SETTINGS).toMatchObject({
      useNestedConnections: true,
      createRelationWhenAddingNewElementToContainer: true,
      createRelationWhenAddingModelTreeElementToContainer: true,
      createRelationWhenMovingElementToContainer: true,
      newRelationsTypes: expectedNormal,
      newReverseRelationsTypes: 0,
      hiddenRelationsTypes: allRelationships,
    });

    await expect(
      loadSettings(
        memoryKeyValueStore([
          [
            'archi-online.settings.v1',
            {
              useNestedConnections: false,
              newRelationsTypes: ARM_BITS.AssignmentRelationship,
              newReverseRelationsTypes: ARM_BITS.AccessRelationship,
              hiddenRelationsTypes: ARM_BITS.CompositionRelationship,
            },
          ],
        ]),
      ),
    ).resolves.toMatchObject({
      useNestedConnections: false,
      createRelationWhenAddingNewElementToContainer: true,
      createRelationWhenAddingModelTreeElementToContainer: true,
      createRelationWhenMovingElementToContainer: true,
      newRelationsTypes: ARM_BITS.AssignmentRelationship,
      newReverseRelationsTypes: ARM_BITS.AccessRelationship,
      hiddenRelationsTypes: ARM_BITS.CompositionRelationship,
    });
  });
});

describe('automatic relationship analysis', () => {
  it('does not offer relationships for an ordinary reposition within the same parent', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, parentNodeId, BOUNDS);
    const undoDepth = store.getState().undoStack.length;

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(
        viewId,
        childNodeId,
        parentNodeId,
        { x: 80, y: 90, width: 120, height: 55 },
      ),
      DEFAULT_SETTINGS,
    );

    expect(plan.children).toHaveLength(0);
    expect(plan.missingOccurrences).toHaveLength(0);
    arm.apply(plan, {}, store);
    expect(store.getState().model!.nodes[childNodeId].bounds).toEqual({
      x: 80,
      y: 90,
      width: 120,
      height: 55,
    });
    expect(Object.keys(store.getState().model!.relationships)).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(undoDepth + 1);
  });

  it('uses only the six default normal candidate-mask types and no reverse candidates', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'Grouping', 'Parent');
    const childElementId = addElementTo(store, 'Grouping', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );

    expect(new Set(plan.children[0].candidates.map((candidate) => candidate.relationshipType))).toEqual(
      new Set([
        'CompositionRelationship',
        'AggregationRelationship',
        'AssignmentRelationship',
        'SpecializationRelationship',
        'RealizationRelationship',
        'AccessRelationship',
      ]),
    );
    expect(plan.children[0].candidates.every((candidate) => candidate.direction === 'normal')).toBe(
      true,
    );
    expect(
      plan.children[0].candidates.find(
        (candidate) => candidate.relationshipType === 'SpecializationRelationship',
      ),
    ).toMatchObject({
      sourceElementId: childElementId,
      targetElementId: parentElementId,
    });
  });

  it('enumerates configured forward and reverse candidates with Specialization child-to-parent semantics', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const settings = {
      ...DEFAULT_SETTINGS,
      newRelationsTypes: ARM_BITS.SpecializationRelationship,
      newReverseRelationsTypes: ARM_BITS.RealizationRelationship,
    } as AppSettings;

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      settings,
    );

    expect(plan.children).toHaveLength(1);
    expect(plan.children[0].candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'normal',
          relationshipType: 'SpecializationRelationship',
          sourceElementId: childElementId,
          targetElementId: parentElementId,
        }),
        expect.objectContaining({
          direction: 'reverse',
          relationshipType: 'RealizationRelationship',
          sourceElementId: childElementId,
          targetElementId: parentElementId,
        }),
      ]),
    );
  });

  it('reuses an existing semantic relationship and plans its missing diagram occurrence', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );

    expect(plan.children[0].reusableRelationships).toEqual([
      expect.objectContaining({ relationshipId }),
    ]);
    expect(plan.children[0].candidates).toHaveLength(0);
    expect(plan.children[0].missingOccurrences).toEqual([
      expect.objectContaining({
        relationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: childNodeId,
      }),
    ]);
  });

  it('reuses Specialization in its stored direction without creating an opposite relationship', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const relationshipId = addRelationship(
      'SpecializationRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );

    expect(plan.children[0].candidates).toHaveLength(0);
    expect(plan.children[0].reusableRelationships).toEqual([
      expect.objectContaining({
        relationshipId,
        relationshipType: 'SpecializationRelationship',
        sourceElementId: parentElementId,
        targetElementId: childElementId,
      }),
    ]);
    expect(plan.children[0].missingOccurrences).toEqual([
      expect.objectContaining({
        relationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: childNodeId,
      }),
    ]);

    arm.apply(plan, {}, store);

    expect(Object.values(store.getState().model!.relationships)).toEqual([
      expect.objectContaining({
        id: relationshipId,
        sourceId: parentElementId,
        targetId: childElementId,
      }),
    ]);
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceId: parentNodeId,
        targetId: childNodeId,
      }),
    );
  });

  it('filters relationship candidates by viewpoint rather than ghosted endpoints and excludes Junction children', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    store.transact('Restrict viewpoint', (draft) => {
      draft.views[viewId].viewpoint = 'application_structure';
    });
    const parentElementId = addElementTo(store, 'BusinessActor', 'Parent');
    const restrictedChildId = addElementTo(store, 'BusinessRole', 'Restricted child');
    const junctionId = addElementTo(store, 'Junction', 'Junction');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const restrictedNodeId = addNodeTo(store, viewId, restrictedChildId, viewId, BOUNDS);
    const junctionNodeId = addNodeTo(
      store,
      viewId,
      junctionId,
      viewId,
      { x: 180, y: 20, width: 15, height: 15 },
    );

    const plan = arm.analyze(
      store.getState().model!,
      {
        viewId,
        trigger: 'move',
        entries: [
          { kind: 'move', nodeId: restrictedNodeId, parentId: parentNodeId, bounds: BOUNDS },
          {
            kind: 'move',
            nodeId: junctionNodeId,
            parentId: parentNodeId,
            bounds: { x: 180, y: 20, width: 15, height: 15 },
          },
        ],
      },
      DEFAULT_SETTINGS,
    );

    expect(plan.children).toHaveLength(1);
    expect(plan.children[0].childNodeId).toBe(restrictedNodeId);
    expect(plan.children[0].candidates).toContainEqual(
      expect.objectContaining({ relationshipType: 'AssignmentRelationship' }),
    );
    expect(plan.children.some((child) => child.childNodeId === junctionNodeId)).toBe(false);
  });

  it('restores an existing occurrence without suppressing candidates for a ghosted child', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    store.transact('Restrict viewpoint', (draft) => {
      draft.views[viewId].viewpoint = 'application_structure';
    });
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'BusinessRole', 'Child');
    const relationshipId = addRelationship(
      'AssociationRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );

    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]).toMatchObject({ childNodeId });
    expect(plan.missingOccurrences).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: childNodeId,
      }),
    );
    arm.apply(plan, {}, store);
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceId: parentNodeId,
        targetId: childNodeId,
      }),
    );
  });

  it('restores an existing occurrence while excluding a Junction child from candidates', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'BusinessProcess', 'Parent');
    const childElementId = addElementTo(store, 'Junction', 'Junction');
    const relationshipId = addRelationship(
      'TriggeringRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(
      store,
      viewId,
      childElementId,
      viewId,
      { x: 20, y: 20, width: 18, height: 18 },
    );

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId, { x: 20, y: 20, width: 18, height: 18 }),
      DEFAULT_SETTINGS,
    );

    expect(plan.children).toHaveLength(0);
    expect(plan.missingOccurrences).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: childNodeId,
      }),
    );
    arm.apply(plan, {}, store);
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceId: parentNodeId,
        targetId: childNodeId,
      }),
    );
  });
});

describe('automatic relationship apply', () => {
  it.each([
    {
      type: 'CompositionRelationship' as const,
      expectedDirection: 'parent-child' as const,
    },
    {
      type: 'SpecializationRelationship' as const,
      expectedDirection: 'child-parent' as const,
    },
  ])(
    'maps $type to the correct occurrences when parent and child represent the same element',
    ({ type, expectedDirection }) => {
      const arm = requireArmFunctions();
      if (!arm) return;
      const store = makeStore();
      const viewId = addViewTo(store);
      const elementId = addElementTo(store, 'ApplicationComponent', 'Shared');
      const parentNodeId = addNodeTo(
        store,
        viewId,
        elementId,
        viewId,
        { x: 0, y: 0, width: 320, height: 240 },
      );
      const childNodeId = addNodeTo(
        store,
        viewId,
        elementId,
        viewId,
        { x: 420, y: 20, width: 120, height: 55 },
      );
      const settings = {
        ...DEFAULT_SETTINGS,
        newRelationsTypes: ARM_BITS[type],
        newReverseRelationsTypes: 0,
      } as AppSettings;
      const plan = arm.analyze(
        store.getState().model!,
        moveInput(viewId, childNodeId, parentNodeId),
        settings,
      );
      const choice = plan.children[0].candidates[0];

      arm.apply(plan, { [childNodeId]: choice.id }, store);

      expect(Object.values(store.getState().model!.relationships)).toContainEqual(
        expect.objectContaining({ type, sourceId: elementId, targetId: elementId }),
      );
      expect(Object.values(store.getState().model!.connections)).toContainEqual(
        expect.objectContaining(
          expectedDirection === 'parent-child'
            ? { sourceId: parentNodeId, targetId: childNodeId }
            : { sourceId: childNodeId, targetId: parentNodeId },
        ),
      );
    },
  );

  it('creates a palette element, relationship, hidden occurrence, and movement in one undo step', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const undoDepth = store.getState().undoStack.length;
    const input = {
      viewId,
      trigger: 'palette' as const,
      entries: [
        {
          kind: 'create-element',
          nodeId: 'new-node',
          elementId: 'new-element',
          elementType: 'ApplicationComponent',
          name: 'Child',
          profileIds: [],
          parentId: parentNodeId,
          bounds: BOUNDS,
        },
      ],
    };
    const plan = arm.analyze(store.getState().model!, input, DEFAULT_SETTINGS);
    const choice = plan.children[0].candidates[0];

    arm.apply(plan, { 'new-node': choice.id }, store);

    const model = store.getState().model!;
    expect(model.elements['new-element']).toMatchObject({ name: 'Child' });
    expect(model.nodes['new-node']).toMatchObject({ parentId: parentNodeId });
    expect(Object.values(model.relationships)).toContainEqual(
      expect.objectContaining({
        type: choice.relationshipType,
        sourceId: choice.sourceElementId,
        targetId: choice.targetElementId,
      }),
    );
    expect(Object.values(model.connections)).toContainEqual(
      expect.objectContaining({ sourceId: parentNodeId, targetId: 'new-node' }),
    );
    expect(store.getState().undoStack).toHaveLength(undoDepth + 1);

    undo(store);
    expect(store.getState().model!.elements['new-element']).toBeUndefined();
    expect(store.getState().model!.nodes['new-node']).toBeUndefined();
    redo(store);
    expect(store.getState().model!.nodes['new-node']?.parentId).toBe(parentNodeId);
  });

  it('creates a missing tree-drop occurrence and reuses the semantic relationship', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const plan = arm.analyze(
      store.getState().model!,
      {
        viewId,
        trigger: 'tree',
        entries: [
          {
            kind: 'add-occurrence',
            nodeId: 'tree-node',
            elementId: childElementId,
            parentId: parentNodeId,
            bounds: BOUNDS,
          },
        ],
      },
      DEFAULT_SETTINGS,
    );

    arm.apply(plan, {}, store);

    expect(store.getState().model!.nodes['tree-node']?.parentId).toBe(parentNodeId);
    expect(Object.keys(store.getState().model!.relationships)).toEqual([relationshipId]);
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceId: parentNodeId,
        targetId: 'tree-node',
      }),
    );
  });

  it('creates a selected tree-drop relationship only for the chosen parent occurrence', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const chosenParentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const otherParentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 420, y: 0, width: 320, height: 240 },
    );
    const plan = arm.analyze(
      store.getState().model!,
      {
        viewId,
        trigger: 'tree',
        entries: [
          {
            kind: 'add-occurrence',
            nodeId: 'tree-node',
            elementId: childElementId,
            parentId: chosenParentNodeId,
            bounds: BOUNDS,
          },
        ],
      },
      DEFAULT_SETTINGS,
    );
    const choice = plan.children[0].candidates.find(
      (candidate) => candidate.relationshipType === 'CompositionRelationship',
    )!;

    const result = arm.apply(plan, { 'tree-node': choice.id }, store);

    expect(result.relationshipIds).toHaveLength(1);
    const occurrences = Object.values(store.getState().model!.connections).filter(
      (connection) => connection.relationshipId === result.relationshipIds[0],
    );
    expect(occurrences).toEqual([
      expect.objectContaining({ sourceId: chosenParentNodeId, targetId: 'tree-node' }),
    ]);
    expect(occurrences).not.toContainEqual(
      expect.objectContaining({ sourceId: otherParentNodeId, targetId: 'tree-node' }),
    );
  });

  it('creates the missing visible occurrence when an existing nested element is unnested', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, parentNodeId, BOUNDS);
    expect(Object.keys(store.getState().model!.connections)).toHaveLength(0);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, viewId, { x: 380, y: 20, width: 120, height: 55 }),
      DEFAULT_SETTINGS,
    );

    expect(plan.missingOccurrences).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: childNodeId,
      }),
    );
    arm.apply(plan, {}, store);
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId,
        sourceId: parentNodeId,
        targetId: childNodeId,
      }),
    );
  });

  it('does not add another hidden-type occurrence when that visual direction already exists', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const compositionId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const aggregationId = addRelationship(
      'AggregationRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, parentNodeId, BOUNDS);
    addConnectionToView(viewId, compositionId, parentNodeId, childNodeId, store);

    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, viewId, { x: 380, y: 20, width: 120, height: 55 }),
      DEFAULT_SETTINGS,
    );

    expect(plan.missingOccurrences).not.toContainEqual(
      expect.objectContaining({ relationshipId: aggregationId }),
    );
    arm.apply(plan, {}, store);
    expect(
      Object.values(store.getState().model!.connections).filter(
        (connection) => connection.relationshipId === aggregationId,
      ),
    ).toHaveLength(0);
  });

  it('creates a missing occurrence from the nesting parent to a represented relationship', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const firstElementId = addElementTo(store, 'ApplicationComponent', 'First');
    const secondElementId = addElementTo(store, 'ApplicationComponent', 'Second');
    const representedRelationshipId = addRelationship(
      'FlowRelationship',
      firstElementId,
      secondElementId,
      '',
      undefined,
      store,
    )!;
    const parentToRelationshipId = addRelationship(
      'AssociationRelationship',
      parentElementId,
      representedRelationshipId,
      '',
      undefined,
      store,
    )!;
    const relationshipToParentId = addRelationship(
      'AssociationRelationship',
      representedRelationshipId,
      parentElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 360, height: 280 },
    );
    const firstNodeId = addNodeTo(
      store,
      viewId,
      firstElementId,
      viewId,
      { x: 420, y: 20, width: 120, height: 55 },
    );
    const secondNodeId = addNodeTo(
      store,
      viewId,
      secondElementId,
      viewId,
      { x: 420, y: 120, width: 120, height: 55 },
    );
    const representedConnectionId = addConnectionToView(
      viewId,
      representedRelationshipId,
      firstNodeId,
      secondNodeId,
      store,
    );

    const plan = arm.analyze(
      store.getState().model!,
      {
        viewId,
        trigger: 'move',
        entries: [
          { kind: 'move', nodeId: firstNodeId, parentId: parentNodeId, bounds: BOUNDS },
          {
            kind: 'move',
            nodeId: secondNodeId,
            parentId: parentNodeId,
            bounds: { x: 20, y: 120, width: 120, height: 55 },
          },
        ],
      },
      DEFAULT_SETTINGS,
    );

    expect(plan.missingOccurrences).toContainEqual(
      expect.objectContaining({
        relationshipId: parentToRelationshipId,
        sourceNodeId: parentNodeId,
        targetNodeId: representedConnectionId,
      }),
    );
    expect(plan.missingOccurrences).toContainEqual(
      expect.objectContaining({
        relationshipId: relationshipToParentId,
        sourceNodeId: representedConnectionId,
        targetNodeId: parentNodeId,
      }),
    );
    arm.apply(
      plan,
      Object.fromEntries(plan.children.map((child) => [child.childNodeId, null])),
      store,
    );
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId: parentToRelationshipId,
        sourceId: parentNodeId,
        targetId: representedConnectionId,
      }),
    );
    expect(Object.values(store.getState().model!.connections)).toContainEqual(
      expect.objectContaining({
        relationshipId: relationshipToParentId,
        sourceId: representedConnectionId,
        targetId: parentNodeId,
      }),
    );
  });

  it('plans relationship-endpoint closure when a tree drop creates the represented connection', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const firstElementId = addElementTo(store, 'ApplicationComponent', 'First');
    const droppedElementId = addElementTo(store, 'ApplicationComponent', 'Dropped');
    const representedRelationshipId = addRelationship(
      'FlowRelationship',
      firstElementId,
      droppedElementId,
      '',
      undefined,
      store,
    )!;
    const parentToRelationshipId = addRelationship(
      'AssociationRelationship',
      parentElementId,
      representedRelationshipId,
      '',
      undefined,
      store,
    )!;
    const relationshipToParentId = addRelationship(
      'AssociationRelationship',
      representedRelationshipId,
      parentElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 360, height: 280 },
    );
    const firstNodeId = addNodeTo(
      store,
      viewId,
      firstElementId,
      parentNodeId,
      BOUNDS,
    );
    const undoDepth = store.getState().undoStack.length;

    const plan = arm.analyze(
      store.getState().model!,
      {
        viewId,
        trigger: 'tree',
        entries: [
          {
            kind: 'add-occurrence',
            nodeId: 'dropped-node',
            elementId: droppedElementId,
            parentId: parentNodeId,
            bounds: { x: 20, y: 120, width: 120, height: 55 },
          },
        ],
      },
      DEFAULT_SETTINGS,
    );
    const represented = plan.missingOccurrences.find(
      (occurrence) => occurrence.relationshipId === representedRelationshipId,
    );
    const forward = plan.missingOccurrences.find(
      (occurrence) => occurrence.relationshipId === parentToRelationshipId,
    );
    const reverse = plan.missingOccurrences.find(
      (occurrence) => occurrence.relationshipId === relationshipToParentId,
    );

    expect(represented).toMatchObject({ sourceNodeId: firstNodeId, targetNodeId: 'dropped-node' });
    expect(forward).toMatchObject({
      sourceNodeId: parentNodeId,
      targetNodeId: represented?.connectionId,
    });
    expect(reverse).toMatchObject({
      sourceNodeId: represented?.connectionId,
      targetNodeId: parentNodeId,
    });

    arm.apply(plan, { 'dropped-node': null }, store);
    expect(store.getState().model!.connections[represented!.connectionId]).toBeDefined();
    expect(store.getState().model!.connections[forward!.connectionId]).toMatchObject({
      sourceId: parentNodeId,
      targetId: represented!.connectionId,
    });
    expect(store.getState().model!.connections[reverse!.connectionId]).toMatchObject({
      sourceId: represented!.connectionId,
      targetId: parentNodeId,
    });
    expect(store.getState().undoStack).toHaveLength(undoDepth + 1);
  });

  it('rejects a stale move plan when the child occurrence was deleted before apply', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    const choice = plan.children[0].candidates[0];
    ops.deleteViewObjects([childNodeId], store);
    const before = store.getState().model;
    const undoDepth = store.getState().undoStack.length;

    const result = arm.apply(plan, { [childNodeId]: choice.id }, store);

    expect(result).toEqual({ nodeIds: [], relationshipIds: [], connectionIds: [] });
    expect(store.getState().model).toBe(before);
    expect(store.getState().model!.elements[childElementId]).toBeDefined();
    expect(Object.keys(store.getState().model!.relationships)).toHaveLength(0);
    expect(Object.keys(store.getState().model!.connections)).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('rejects a stale move plan when the target parent became a child descendant', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    const choice = plan.children[0].candidates[0];
    store.transact('Make parent a child descendant', (draft) => {
      draft.views[viewId].childIds = draft.views[viewId].childIds.filter(
        (nodeId) => nodeId !== parentNodeId,
      );
      draft.nodes[parentNodeId].parentId = childNodeId;
      draft.nodes[childNodeId].childIds.push(parentNodeId);
    });
    const before = store.getState().model;
    const undoDepth = store.getState().undoStack.length;

    const result = arm.apply(plan, { [childNodeId]: choice.id }, store);

    expect(result).toEqual({ nodeIds: [], relationshipIds: [], connectionIds: [] });
    expect(store.getState().model).toBe(before);
    expect(Object.keys(store.getState().model!.relationships)).toHaveLength(0);
    expect(Object.keys(store.getState().model!.connections)).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('rejects a stale move plan when its reusable relationship was deleted before apply', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    expect(plan.children[0].reusableRelationships).toEqual([
      expect.objectContaining({ relationshipId }),
    ]);
    store.transact('Delete relationship while chooser is open', (draft) => {
      const relationship = draft.relationships[relationshipId];
      draft.folders[relationship.folderId].itemIds = draft.folders[
        relationship.folderId
      ].itemIds.filter((id) => id !== relationshipId);
      delete draft.relationships[relationshipId];
    });
    const before = store.getState().model;
    const undoDepth = store.getState().undoStack.length;

    const result = arm.apply(plan, {}, store);

    expect(result).toEqual({ nodeIds: [], relationshipIds: [], connectionIds: [] });
    expect(store.getState().model).toBe(before);
    expect(store.getState().model!.nodes[childNodeId].parentId).toBe(viewId);
    expect(Object.keys(store.getState().model!.relationships)).toHaveLength(0);
    expect(Object.keys(store.getState().model!.connections)).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('rejects a stale move plan when a planned connection id became occupied', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    );
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    const occupiedId = plan.missingOccurrences[0].connectionId;
    store.transact('Occupy planned connection id', (draft) => {
      attachNode(draft, {
        id: occupiedId,
        viewId,
        parentId: viewId,
        bounds: { x: 500, y: 20, width: 120, height: 80 },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'group',
        name: 'Concurrent group',
        documentation: '',
        properties: [],
      });
    });
    const before = store.getState().model;
    const undoDepth = store.getState().undoStack.length;

    const result = arm.apply(plan, {}, store);

    expect(result).toEqual({ nodeIds: [], relationshipIds: [], connectionIds: [] });
    expect(store.getState().model).toBe(before);
    expect(store.getState().model!.nodes[childNodeId].parentId).toBe(viewId);
    expect(store.getState().model!.nodes[occupiedId]?.nodeType).toBe('group');
    expect(store.getState().model!.connections[occupiedId]).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('rejects a stale selection when another candidate relationship was created after analysis', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    const choice = plan.children[0].candidates.find(
      (candidate) => candidate.relationshipType === 'CompositionRelationship',
    )!;
    const concurrentRelationshipId = addRelationship(
      'AggregationRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const before = store.getState().model;
    const undoDepth = store.getState().undoStack.length;

    const result = arm.apply(plan, { [childNodeId]: choice.id }, store);

    expect(result).toEqual({ nodeIds: [], relationshipIds: [], connectionIds: [] });
    expect(store.getState().model).toBe(before);
    expect(store.getState().model!.nodes[childNodeId].parentId).toBe(viewId);
    expect(Object.keys(store.getState().model!.relationships)).toEqual([
      concurrentRelationshipId,
    ]);
    expect(Object.keys(store.getState().model!.connections)).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('honors read-only mode and mutates only the explicit model store', () => {
    const arm = requireArmFunctions();
    if (!arm) return;
    const editable = makeStore('Editable');
    const other = makeStore('Other');
    const viewId = addViewTo(editable);
    const parentElementId = addElementTo(editable, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(editable, 'ApplicationComponent', 'Child');
    const parentNodeId = addNodeTo(
      editable,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(editable, viewId, childElementId, viewId, BOUNDS);
    const plan = arm.analyze(
      editable.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    const choice = plan.children[0].candidates[0];
    const otherBefore = other.getState().model;

    arm.apply(plan, { [childNodeId]: choice.id }, editable);

    expect(editable.getState().model!.nodes[childNodeId].parentId).toBe(parentNodeId);
    expect(other.getState().model).toBe(otherBefore);

    const readOnly = createModelStore({
      ...editable.getState(),
      model: structuredClone(editable.getState().model!),
      readOnly: true,
      undoStack: [],
      redoStack: [],
      dirty: false,
    });
    const before = readOnly.getState().model;
    arm.apply(plan, { [childNodeId]: choice.id }, readOnly);
    expect(readOnly.getState().model).toBe(before);
    expect(readOnly.getState().dirty).toBe(false);
    expect(readOnly.getState().undoStack).toHaveLength(0);
  });
});

describe('derived nested connection visibility', () => {
  it('hides configured and plain direct nesting, recursively hides dependents, and reveals on unnest', () => {
    const arm = requireArmFunctions();
    expect(
      isConnectionHiddenByNesting,
      'isConnectionHiddenByNesting must be exported from model ops',
    ).toBeTypeOf('function');
    if (!arm || !isConnectionHiddenByNesting) return;
    const store = makeStore();
    const viewId = addViewTo(store);
    const parentElementId = addElementTo(store, 'ApplicationComponent', 'Parent');
    const childElementId = addElementTo(store, 'ApplicationComponent', 'Child');
    const otherElementId = addElementTo(store, 'ApplicationComponent', 'Other');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
      '',
      undefined,
      store,
    )!;
    const parentNodeId = addNodeTo(
      store,
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
    );
    const childNodeId = addNodeTo(store, viewId, childElementId, viewId, BOUNDS);
    const otherNodeId = addNodeTo(
      store,
      viewId,
      otherElementId,
      viewId,
      { x: 440, y: 20, width: 120, height: 55 },
    );
    const relationshipConnectionId = addConnectionToView(
      viewId,
      relationshipId,
      parentNodeId,
      childNodeId,
      store,
    );
    store.transact('Add plain and dependent connections', (draft) => {
      attachConnection(draft, {
        id: 'plain',
        viewId,
        connType: 'plain',
        name: '',
        documentation: '',
        properties: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        sourceId: parentNodeId,
        targetId: childNodeId,
        connectionType: 0,
        bendpoints: [],
      });
      attachConnection(draft, {
        id: 'dependent',
        viewId,
        connType: 'plain',
        name: '',
        documentation: '',
        properties: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        sourceId: relationshipConnectionId,
        targetId: otherNodeId,
        connectionType: 0,
        bendpoints: [],
      });
    });

    const nestPlan = arm.analyze(
      store.getState().model!,
      moveInput(viewId, childNodeId, parentNodeId),
      DEFAULT_SETTINGS,
    );
    arm.apply(nestPlan, {}, store);
    const nested = store.getState().model!;
    const directVisible = (id: string) =>
      !isConnectionHiddenByNesting(nested, id, DEFAULT_SETTINGS);
    const visibilityFactory = (geometry as typeof geometry & {
      createConnectionVisibilityResolver?: typeof geometry.createConnectionVisibilityResolver;
    }).createConnectionVisibilityResolver;
    const isVisible = visibilityFactory(nested, directVisible);

    expect(isVisible(relationshipConnectionId)).toBe(false);
    expect(isVisible('plain')).toBe(false);
    expect(isVisible('dependent')).toBe(false);
    expect(nested.connections[relationshipConnectionId]).toBeDefined();
    expect(nestPlan.visibilityChanges).toContainEqual({
      connectionId: relationshipConnectionId,
      before: true,
      after: false,
    });
    setActiveModelStore(store);
    try {
      const scriptedDependent = new JView(viewId)
        .connections()
        .find((connection) => connection.id === 'dependent')!;
      expect(() => scriptedDependent.absoluteRoute()).not.toThrow();
      expect(() => scriptedDependent.setAbsoluteRoute([{ x: 360, y: 140 }])).not.toThrow();
    } finally {
      setActiveModelStore(null);
    }

    const unnestPlan = arm.analyze(
      nested,
      moveInput(viewId, childNodeId, viewId, { x: 380, y: 20, width: 120, height: 55 }),
      DEFAULT_SETTINGS,
    );
    arm.apply(unnestPlan, {}, store);
    const unnested = store.getState().model!;
    const unnestVisible = geometry.createConnectionVisibilityResolver(
      unnested,
      (id) => !isConnectionHiddenByNesting(unnested, id, DEFAULT_SETTINGS),
    );

    expect(unnestVisible(relationshipConnectionId)).toBe(true);
    expect(unnestVisible('plain')).toBe(true);
    expect(unnestVisible('dependent')).toBe(true);
    expect(unnested.connections[relationshipConnectionId]).toBeDefined();
  });
});
