import { describe, expect, it } from 'vitest';
import * as interactions from '../src/canvas/view-editor/useViewEditorInteractions';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addRelationship,
  addView,
  createEmptyModel,
  setViewpoint,
} from '../src/model/ops';
import * as ops from '../src/model/ops';
import * as rules from '../src/model/rules';
import {
  createModelStore,
  getActiveModelStore,
  setActiveModelStore,
  undo,
  type ModelStore,
} from '../src/model/store';
import type { ElementType, RelationshipType } from '../src/model/metamodel';
import type { Bounds, ModelState } from '../src/model/types';
import type { MenuItem } from '../src/ui/ContextMenu';

type MagicDirection = 'forward' | 'reverse';

interface ExistingRelationshipChoice {
  relationshipId: string;
  name: string;
}

interface ExistingTargetOption {
  direction: MagicDirection;
  relationshipType: RelationshipType;
  sourceElementId: string;
  targetElementId: string;
  sourceNodeId: string;
  targetNodeId: string;
  existingRelationships: ExistingRelationshipChoice[];
}

interface ExistingTargetAnalysis {
  groups: Array<{
    direction: MagicDirection;
    options: ExistingTargetOption[];
  }>;
}

interface TargetCreationPair {
  relationshipType: RelationshipType;
  elementType: ElementType;
}

interface TargetCreationAnalysis {
  pairs: TargetCreationPair[];
}

interface ExistingTargetResult {
  relationshipId: string;
  connectionId: string;
  reused: boolean;
}

interface NewTargetResult {
  elementId: string;
  nodeId: string;
  relationshipId: string;
  connectionId: string;
}

type AnalyzeExistingTarget = (
  model: ModelState,
  input: { viewId: string; sourceNodeId: string; targetNodeId: string },
) => ExistingTargetAnalysis;

type CreateExistingTargetConnection = (
  input: {
    viewId: string;
    sourceNodeId: string;
    targetNodeId: string;
    direction: MagicDirection;
    relationshipType: RelationshipType;
    relationshipId?: string;
  },
  store?: ModelStore,
) => ExistingTargetResult | null;

type AnalyzeTargetCreation = (
  model: ModelState,
  input: { viewId: string; sourceNodeId: string },
) => TargetCreationAnalysis;

type CreateTarget = (
  input: {
    viewId: string;
    sourceNodeId: string;
    parentId: string;
    bounds: Bounds;
    elementType: ElementType;
    relationshipType: RelationshipType;
  },
  store?: ModelStore,
) => NewTargetResult | null;

type EnumerateCandidates = (
  source: { conceptId: string; conceptType: string; nodeId?: string },
  target: { conceptId: string; conceptType: string; nodeId?: string },
  viewpointId?: string,
  relationshipTypes?: readonly RelationshipType[],
) => Array<{
  relationshipType: RelationshipType;
  sourceConceptId: string;
  targetConceptId: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}>;

type BuildExistingMenu = (
  analysis: ExistingTargetAnalysis,
  choose: (option: ExistingTargetOption, relationshipId?: string) => void,
) => MenuItem[];

type BuildTargetMenu = (
  analysis: TargetCreationAnalysis,
  elementFirst: boolean,
  choose: (pair: TargetCreationPair) => void,
) => MenuItem[];

const analyzeExistingTarget = (ops as typeof ops & {
  analyzeMagicConnectionTarget?: AnalyzeExistingTarget;
}).analyzeMagicConnectionTarget;
const createExistingTargetConnection = (ops as typeof ops & {
  createMagicConnectionOnView?: CreateExistingTargetConnection;
}).createMagicConnectionOnView;
const analyzeTargetCreation = (ops as typeof ops & {
  analyzeMagicTargetCreation?: AnalyzeTargetCreation;
}).analyzeMagicTargetCreation;
const createTarget = (ops as typeof ops & {
  createMagicTargetOnView?: CreateTarget;
}).createMagicTargetOnView;
const enumerateCandidates = (rules as typeof rules & {
  enumerateRelationshipCandidates?: EnumerateCandidates;
}).enumerateRelationshipCandidates;
const buildExistingMenu = (interactions as typeof interactions & {
  buildMagicConnectionMenuItems?: BuildExistingMenu;
}).buildMagicConnectionMenuItems;
const buildTargetMenu = (interactions as typeof interactions & {
  buildMagicTargetMenuItems?: BuildTargetMenu;
}).buildMagicTargetMenuItems;

const BOUNDS: Bounds = { x: 20, y: 20, width: 120, height: 55 };

function makeStore(name = 'Magic Connector'): ModelStore {
  return createModelStore({ model: createEmptyModel(name) });
}

function fixture(store = makeStore()) {
  const viewId = addView('View', undefined, store);
  const actorId = addElement('BusinessActor', 'Actor', undefined, store);
  const roleId = addElement('BusinessRole', 'Role', undefined, store);
  const actorNodeId = addElementNodeToView(viewId, actorId, viewId, BOUNDS, false, {}, store);
  const roleNodeId = addElementNodeToView(
    viewId,
    roleId,
    viewId,
    { ...BOUNDS, x: 240 },
    false,
    {},
    store,
  );
  return { store, viewId, actorId, roleId, actorNodeId, roleNodeId };
}

function existingInput(f: ReturnType<typeof fixture>) {
  return {
    viewId: f.viewId,
    sourceNodeId: f.actorNodeId,
    targetNodeId: f.roleNodeId,
  };
}

function creationInput(f: ReturnType<typeof fixture>) {
  return { viewId: f.viewId, sourceNodeId: f.actorNodeId };
}

function requireFunction<T extends (...args: never[]) => unknown>(
  value: T | undefined,
  name: string,
): T | null {
  expect(value, `${name} must be exported`).toBeTypeOf('function');
  return value ?? null;
}

describe('shared relationship candidate enumeration', () => {
  it('keeps Archi relationship ordering while applying the shared rules and viewpoint filter', () => {
    const enumerate = requireFunction(enumerateCandidates, 'enumerateRelationshipCandidates');
    if (!enumerate) return;

    const candidates = enumerate(
      { conceptId: 'actor', conceptType: 'BusinessActor', nodeId: 'actor-node' },
      { conceptId: 'role', conceptType: 'BusinessRole', nodeId: 'role-node' },
      'organization',
    );

    expect(candidates.map((candidate) => candidate.relationshipType)).toEqual([
      'AssignmentRelationship',
      'ServingRelationship',
      'TriggeringRelationship',
      'FlowRelationship',
      'AssociationRelationship',
    ]);
    expect(candidates[0]).toMatchObject({
      sourceConceptId: 'actor',
      targetConceptId: 'role',
      sourceNodeId: 'actor-node',
      targetNodeId: 'role-node',
    });
  });
});

describe('Magic Connector existing targets', () => {
  it('groups forward before reverse candidates in Archi relationship order', () => {
    const analyze = requireFunction(analyzeExistingTarget, 'analyzeMagicConnectionTarget');
    if (!analyze) return;
    const f = fixture();

    const analysis = analyze(f.store.getState().model!, existingInput(f));

    expect(analysis.groups.map((group) => group.direction)).toEqual(['forward', 'reverse']);
    expect(analysis.groups[0].options.map((option) => option.relationshipType)).toEqual([
      'AssignmentRelationship',
      'ServingRelationship',
      'TriggeringRelationship',
      'FlowRelationship',
      'AssociationRelationship',
    ]);
    expect(analysis.groups[1].options.map((option) => option.relationshipType)).toEqual([
      'ServingRelationship',
      'TriggeringRelationship',
      'FlowRelationship',
      'AssociationRelationship',
    ]);
    expect(analysis.groups[1].options[0]).toMatchObject({
      sourceElementId: f.roleId,
      targetElementId: f.actorId,
      sourceNodeId: f.roleNodeId,
      targetNodeId: f.actorNodeId,
    });
  });

  it('offers reusable semantic relationships but suppresses an already represented occurrence', () => {
    const analyze = requireFunction(analyzeExistingTarget, 'analyzeMagicConnectionTarget');
    if (!analyze) return;
    const f = fixture();
    const first = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Existing assignment',
      undefined,
      f.store,
    )!;
    const represented = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Already shown',
      undefined,
      f.store,
    )!;
    addConnectionToView(f.viewId, represented, f.actorNodeId, f.roleNodeId, f.store);

    const option = analyze(f.store.getState().model!, existingInput(f)).groups[0].options.find(
      (candidate) => candidate.relationshipType === 'AssignmentRelationship',
    );

    expect(option?.existingRelationships).toEqual([
      { relationshipId: first, name: 'Existing assignment' },
    ]);
  });

  it('reuses a semantic relationship without creating a duplicate concept', () => {
    const connect = requireFunction(createExistingTargetConnection, 'createMagicConnectionOnView');
    if (!connect) return;
    const f = fixture();
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Reuse me',
      undefined,
      f.store,
    )!;
    const beforeRelationships = Object.keys(f.store.getState().model!.relationships).length;

    const result = connect({
      ...existingInput(f),
      direction: 'forward',
      relationshipType: 'AssignmentRelationship',
      relationshipId,
    }, f.store);

    expect(result).toMatchObject({ relationshipId, reused: true });
    expect(Object.keys(f.store.getState().model!.relationships)).toHaveLength(beforeRelationships);
    expect(f.store.getState().model!.connections[result!.connectionId]).toMatchObject({
      relationshipId,
      sourceId: f.actorNodeId,
      targetId: f.roleNodeId,
    });
  });

  it('creates an explicit New reverse relationship with reversed semantic and visual endpoints', () => {
    const connect = requireFunction(createExistingTargetConnection, 'createMagicConnectionOnView');
    if (!connect) return;
    const f = fixture();

    const result = connect({
      ...existingInput(f),
      direction: 'reverse',
      relationshipType: 'AssociationRelationship',
    }, f.store);

    expect(result?.reused).toBe(false);
    expect(f.store.getState().model!.relationships[result!.relationshipId]).toMatchObject({
      sourceId: f.roleId,
      targetId: f.actorId,
    });
    expect(f.store.getState().model!.connections[result!.connectionId]).toMatchObject({
      sourceId: f.roleNodeId,
      targetId: f.actorNodeId,
    });
  });

  it('rejects duplicate reuse occurrences without adding an undo entry', () => {
    const connect = requireFunction(createExistingTargetConnection, 'createMagicConnectionOnView');
    if (!connect) return;
    const f = fixture();
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Shown',
      undefined,
      f.store,
    )!;
    addConnectionToView(f.viewId, relationshipId, f.actorNodeId, f.roleNodeId, f.store);
    const undoDepth = f.store.getState().undoStack.length;

    const result = connect({
      ...existingInput(f),
      direction: 'forward',
      relationshipType: 'AssignmentRelationship',
      relationshipId,
    }, f.store);

    expect(result).toBeNull();
    expect(f.store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('builds explicit Forward/Reverse groups with reusable choices followed by New', () => {
    const build = requireFunction(buildExistingMenu, 'buildMagicConnectionMenuItems');
    if (!build) return;
    const f = fixture();
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      f.actorId,
      f.roleId,
      'Carries work',
      undefined,
      f.store,
    )!;
    const analyze = requireFunction(analyzeExistingTarget, 'analyzeMagicConnectionTarget');
    if (!analyze) return;

    const menu = build(
      analyze(f.store.getState().model!, existingInput(f)),
      () => undefined,
    );
    const assignment = menuChildren(menu[0]).find((item) => item.label === 'Assignment');

    expect(menu.map((item) => item.label)).toEqual(['Forward', 'Reverse']);
    expect(menuChildren(assignment).filter((item) => !item.separator).map((item) => item.label)).toEqual([
      'Reuse Carries work',
      'New Assignment',
    ]);
    expect(relationshipId).toBeTruthy();
  });

  it.each([
    ['source', 'incoming'],
    ['target', 'outgoing'],
  ] as const)(
    'honors the relationship type already incident to a %s Junction',
    (_side, incidentDirection) => {
      const analyze = requireFunction(analyzeExistingTarget, 'analyzeMagicConnectionTarget');
      if (!analyze) return;
      const store = makeStore();
      const viewId = addView('Junction View', undefined, store);
      const firstId = addElement('BusinessProcess', 'First', undefined, store);
      const junctionId = addElement('Junction', 'Junction', undefined, store);
      const secondId = addElement('BusinessProcess', 'Second', undefined, store);
      const firstNodeId = addElementNodeToView(viewId, firstId, viewId, BOUNDS, false, {}, store);
      const junctionNodeId = addElementNodeToView(
        viewId,
        junctionId,
        viewId,
        { ...BOUNDS, x: 220, width: 18, height: 18 },
        false,
        {},
        store,
      );
      addRelationship(
        'TriggeringRelationship',
        incidentDirection === 'incoming' ? secondId : junctionId,
        incidentDirection === 'incoming' ? junctionId : secondId,
        'Existing trigger',
        undefined,
        store,
      );

      const input = incidentDirection === 'incoming'
        ? { viewId, sourceNodeId: junctionNodeId, targetNodeId: firstNodeId }
        : { viewId, sourceNodeId: firstNodeId, targetNodeId: junctionNodeId };
      const forward = analyze(store.getState().model!, input).groups[0].options;

      expect(forward.map((option) => option.relationshipType)).toEqual([
        'TriggeringRelationship',
      ]);
    },
  );

  it.each([
    ['source'],
    ['target'],
  ] as const)(
    'rejects a %s Junction candidate that is invalid between the far-side concepts',
    (junctionSide) => {
      const analyze = requireFunction(analyzeExistingTarget, 'analyzeMagicConnectionTarget');
      if (!analyze) return;
      const store = makeStore();
      const viewId = addView('Indirect Junction View', undefined, store);
      const resourceId = addElement('Resource', 'Resource', undefined, store);
      const actorId = addElement('BusinessActor', 'Actor', undefined, store);
      const junctionId = addElement('Junction', 'Junction', undefined, store);
      const resourceNodeId = addElementNodeToView(viewId, resourceId, viewId, BOUNDS, false, {}, store);
      const actorNodeId = addElementNodeToView(
        viewId,
        actorId,
        viewId,
        { ...BOUNDS, x: 420 },
        false,
        {},
        store,
      );
      const junctionNodeId = addElementNodeToView(
        viewId,
        junctionId,
        viewId,
        { ...BOUNDS, x: 220, width: 18, height: 18 },
        false,
        {},
        store,
      );
      addRelationship(
        'AssignmentRelationship',
        junctionSide === 'source' ? resourceId : junctionId,
        junctionSide === 'source' ? junctionId : actorId,
        'Existing assignment',
        undefined,
        store,
      );

      const input = junctionSide === 'source'
        ? { viewId, sourceNodeId: junctionNodeId, targetNodeId: actorNodeId }
        : { viewId, sourceNodeId: resourceNodeId, targetNodeId: junctionNodeId };
      const types = analyze(store.getState().model!, input).groups[0].options.map(
        (option) => option.relationshipType,
      );

      expect(types).not.toContain('AssignmentRelationship');
    },
  );
});

describe('Magic Connector target creation', () => {
  it('enumerates valid target combinations and filters element types through the viewpoint', () => {
    const analyze = requireFunction(analyzeTargetCreation, 'analyzeMagicTargetCreation');
    if (!analyze) return;
    const f = fixture();
    setViewpoint(f.viewId, 'application_structure', f.store);

    const pairs = analyze(f.store.getState().model!, creationInput(f)).pairs;

    expect(pairs.some((pair) => pair.elementType === 'BusinessRole')).toBe(false);
    expect(pairs).toContainEqual({
      relationshipType: 'AssociationRelationship',
      elementType: 'ApplicationComponent',
    });
  });

  it('builds relationship-first menus by default and element-first menus for Ctrl/Command', () => {
    const analyze = requireFunction(analyzeTargetCreation, 'analyzeMagicTargetCreation');
    const build = requireFunction(buildTargetMenu, 'buildMagicTargetMenuItems');
    if (!analyze || !build) return;
    const f = fixture();
    const analysis = analyze(f.store.getState().model!, creationInput(f));

    const relationshipFirst = build(analysis, false, () => undefined);
    const elementFirst = build(analysis, true, () => undefined);

    expect(relationshipFirst[0].label).toBe('Composition');
    expect(elementFirst.map((item) => item.label).slice(0, 3)).toEqual([
      'Strategy',
      'Business',
      'Application',
    ]);
    const expectedStrategyOrder = [
      'Resource',
      'Capability',
      'Value Stream',
      'Course of Action',
    ];
    expect(
      menuChildren(
        menuChildren(relationshipFirst.find((item) => item.label === 'Association'))
          .find((item) => item.label === 'Strategy'),
      ).map((item) => item.label),
    ).toEqual(expectedStrategyOrder);
    expect(
      menuChildren(elementFirst.find((item) => item.label === 'Strategy'))
        .map((item) => item.label),
    ).toEqual(expectedStrategyOrder);
  });

  it('creates element, node, relationship, and connection atomically and returns every ID', () => {
    const create = requireFunction(createTarget, 'createMagicTargetOnView');
    if (!create) return;
    const f = fixture();
    const undoDepth = f.store.getState().undoStack.length;

    const result = create({
      viewId: f.viewId,
      sourceNodeId: f.actorNodeId,
      parentId: f.viewId,
      bounds: { ...BOUNDS, x: 420 },
      elementType: 'BusinessRole',
      relationshipType: 'AssignmentRelationship',
    }, f.store);

    expect(result).not.toBeNull();
    expect(f.store.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(f.store.getState().model!.elements[result!.elementId]).toMatchObject({
      type: 'BusinessRole',
      name: 'Business Role',
    });
    expect(f.store.getState().model!.nodes[result!.nodeId]).toMatchObject({
      elementId: result!.elementId,
      parentId: f.viewId,
    });
    expect(f.store.getState().model!.relationships[result!.relationshipId]).toMatchObject({
      sourceId: f.actorId,
      targetId: result!.elementId,
    });
    expect(f.store.getState().model!.connections[result!.connectionId]).toMatchObject({
      sourceId: f.actorNodeId,
      targetId: result!.nodeId,
      relationshipId: result!.relationshipId,
    });

    undo(f.store);
    expect(f.store.getState().model!.elements[result!.elementId]).toBeUndefined();
    expect(f.store.getState().model!.nodes[result!.nodeId]).toBeUndefined();
    expect(f.store.getState().model!.relationships[result!.relationshipId]).toBeUndefined();
    expect(f.store.getState().model!.connections[result!.connectionId]).toBeUndefined();
  });

  it('nests a newly created target directly in a Group', () => {
    const create = requireFunction(createTarget, 'createMagicTargetOnView');
    if (!create) return;
    const f = fixture();
    const groupId = addGroupToView(
      f.viewId,
      f.viewId,
      { x: 360, y: 20, width: 320, height: 240 },
      'Target group',
      {},
      f.store,
    );

    const result = create({
      viewId: f.viewId,
      sourceNodeId: f.actorNodeId,
      parentId: groupId,
      bounds: BOUNDS,
      elementType: 'BusinessRole',
      relationshipType: 'AssignmentRelationship',
    }, f.store);

    expect(result).not.toBeNull();
    expect(f.store.getState().model!.nodes[result!.nodeId].parentId).toBe(groupId);
    expect(f.store.getState().model!.nodes[groupId].childIds).toContain(result!.nodeId);
  });

  it('does nothing in read-only stores and never returns phantom IDs', () => {
    const create = requireFunction(createTarget, 'createMagicTargetOnView');
    if (!create) return;
    const f = fixture();
    const before = structuredClone(f.store.getState().model!);
    const undoDepth = f.store.getState().undoStack.length;
    f.store.setState({ readOnly: true });

    const result = create({
      viewId: f.viewId,
      sourceNodeId: f.actorNodeId,
      parentId: f.viewId,
      bounds: BOUNDS,
      elementType: 'BusinessRole',
      relationshipType: 'AssignmentRelationship',
    }, f.store);

    expect(result).toBeNull();
    expect(f.store.getState().model).toEqual(before);
    expect(f.store.getState().undoStack).toHaveLength(undoDepth);
  });

  it('mutates only the explicit store even when another store is globally active', () => {
    const create = requireFunction(createTarget, 'createMagicTargetOnView');
    if (!create) return;
    const target = fixture(makeStore('Target'));
    const active = makeStore('Active');
    const previous = getActiveModelStore();
    setActiveModelStore(active);

    const result = create({
      viewId: target.viewId,
      sourceNodeId: target.actorNodeId,
      parentId: target.viewId,
      bounds: BOUNDS,
      elementType: 'BusinessRole',
      relationshipType: 'AssignmentRelationship',
    }, target.store);

    expect(result).not.toBeNull();
    expect(target.store.getState().model!.elements[result!.elementId]).toBeDefined();
    expect(Object.keys(active.getState().model!.elements)).toHaveLength(0);
    setActiveModelStore(previous);
  });

  it('filters and rejects a new target whose relationship conflicts with an existing source Junction', () => {
    const analyze = requireFunction(analyzeTargetCreation, 'analyzeMagicTargetCreation');
    const create = requireFunction(createTarget, 'createMagicTargetOnView');
    if (!analyze || !create) return;
    const store = makeStore();
    const viewId = addView('Junction View', undefined, store);
    const processId = addElement('BusinessProcess', 'Process', undefined, store);
    const junctionId = addElement('Junction', 'Junction', undefined, store);
    const processNodeId = addElementNodeToView(viewId, processId, viewId, BOUNDS, false, {}, store);
    const junctionNodeId = addElementNodeToView(
      viewId,
      junctionId,
      viewId,
      { ...BOUNDS, x: 220, width: 18, height: 18 },
      false,
      {},
      store,
    );
    addRelationship(
      'TriggeringRelationship',
      processId,
      junctionId,
      'Existing trigger',
      undefined,
      store,
    );
    const undoDepth = store.getState().undoStack.length;

    const analysis = analyze(store.getState().model!, {
      viewId,
      sourceNodeId: junctionNodeId,
    });
    const result = create({
      viewId,
      sourceNodeId: junctionNodeId,
      parentId: viewId,
      bounds: { ...BOUNDS, x: 420 },
      elementType: 'BusinessProcess',
      relationshipType: 'AssignmentRelationship',
    }, store);

    expect(new Set(analysis.pairs.map((pair) => pair.relationshipType))).toEqual(
      new Set(['TriggeringRelationship']),
    );
    expect(result).toBeNull();
    expect(store.getState().undoStack).toHaveLength(undoDepth);
    expect(store.getState().model!.nodes[processNodeId]).toBeDefined();
  });

  it('does not resolve a future target through a colliding imported element ID', () => {
    const analyze = requireFunction(analyzeTargetCreation, 'analyzeMagicTargetCreation');
    if (!analyze) return;
    const f = fixture();
    const junctionId = addElement('Junction', 'Collision Junction', undefined, f.store);
    const upstreamId = addElement('BusinessProcess', 'Upstream', undefined, f.store);
    const model = f.store.getState().model!;
    f.store.setState({
      model: {
        ...model,
        elements: {
          ...model.elements,
          'new:BusinessRole': {
            ...model.elements[junctionId],
            id: 'new:BusinessRole',
          },
        },
      },
    });
    addRelationship(
      'TriggeringRelationship',
      upstreamId,
      'new:BusinessRole',
      'Unrelated collision',
      undefined,
      f.store,
    );

    const pairs = analyze(f.store.getState().model!, creationInput(f)).pairs;

    expect(pairs).toContainEqual({
      relationshipType: 'AssignmentRelationship',
      elementType: 'BusinessRole',
    });
  });
});

function menuChildren(item: MenuItem | undefined): MenuItem[] {
  if (typeof item?.children === 'function') return item.children();
  return item?.children ?? [];
}
