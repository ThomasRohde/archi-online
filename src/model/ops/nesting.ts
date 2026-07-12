import {
  DEFAULT_AUTOMATIC_RELATIONSHIP_SETTINGS,
  isRelationshipTypeInMask,
  relationshipTypesInMask,
  type AutomaticRelationshipSettings,
} from '../automatic-relationships';
import { createConnectionVisibilityResolver } from '../connection-visibility';
import { isAllowedRelationshipInViewpoint } from '../data/viewpoints';
import { newId } from '../id';
import type { ElementType, RelationshipType } from '../metamodel';
import { isAllowedRelationship } from '../rules';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import { getConnectable, type Bounds, type ElementNode, type ModelState, type RefNode } from '../types';
import { defaultFolderId, folderForElementType } from './concepts';
import {
  addMissingRelationshipConnectionsForNode,
  attachConnection,
  attachNode,
} from './draft';
import { applyMoveEntriesToDraft, type MoveEntry } from './movement';
import type { DiagramNodeDefaults } from './view';

export type NestingTrigger = 'palette' | 'tree' | 'move';

export interface MoveNestingEntry {
  kind: 'move';
  nodeId: string;
  parentId: string;
  bounds: Bounds;
}

export interface AddOccurrenceNestingEntry {
  kind: 'add-occurrence';
  nodeId: string;
  elementId: string;
  parentId: string;
  bounds: Bounds;
  defaults?: DiagramNodeDefaults;
}

export interface CreateElementNestingEntry {
  kind: 'create-element';
  nodeId: string;
  elementId: string;
  elementType: ElementType;
  name: string;
  profileIds?: string[];
  parentId: string;
  bounds: Bounds;
  defaults?: DiagramNodeDefaults;
}

export interface AddViewReferenceNestingEntry {
  kind: 'add-view-reference';
  nodeId: string;
  refViewId: string;
  parentId: string;
  bounds: Bounds;
  defaults?: DiagramNodeDefaults;
}

export type NestingEntry =
  | MoveNestingEntry
  | AddOccurrenceNestingEntry
  | CreateElementNestingEntry
  | AddViewReferenceNestingEntry;

export interface NestingChangeInput {
  viewId: string;
  trigger: NestingTrigger;
  entries: NestingEntry[];
}

export interface NestingRelationshipCandidate {
  id: string;
  direction: 'normal' | 'reverse';
  relationshipType: RelationshipType;
  sourceElementId: string;
  targetElementId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ReusableNestingRelationship {
  relationshipId: string;
  relationshipType: RelationshipType;
  direction: 'normal' | 'reverse';
  sourceElementId: string;
  targetElementId: string;
}

export interface MissingRelationshipOccurrence {
  connectionId: string;
  relationshipId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface NestingChildAnalysis {
  childNodeId: string;
  childElementId: string;
  childLabel: string;
  parentNodeId: string;
  parentElementId: string;
  parentLabel: string;
  candidates: NestingRelationshipCandidate[];
  reusableRelationships: ReusableNestingRelationship[];
  missingOccurrences: MissingRelationshipOccurrence[];
}

export interface NestingVisibilityChange {
  connectionId: string;
  before: boolean;
  after: boolean;
}

export interface NestingDependencyElementState {
  elementId: string;
  elementType: ElementType;
}

export interface NestingDependencyRelationshipState {
  relationshipId: string;
  relationshipType: RelationshipType;
  sourceConceptId: string;
  targetConceptId: string;
}

export interface NestingDependencyNodeState {
  nodeId: string;
  nodeType: ModelState['nodes'][string]['nodeType'];
  representedConceptId: string | null;
  parentId: string;
  childIds: string[];
}

export interface NestingDependencyConnectionState {
  connectionId: string;
  connType: ModelState['connections'][string]['connType'];
  relationshipId: string | null;
  sourceConnectableId: string;
  targetConnectableId: string;
}

export interface NestingDependencyState {
  semanticConceptIds: string[];
  connectableIds: string[];
  elements: NestingDependencyElementState[];
  relationships: NestingDependencyRelationshipState[];
  nodes: NestingDependencyNodeState[];
  connections: NestingDependencyConnectionState[];
}

export interface NestingChangePlan {
  input: NestingChangeInput;
  settings: AutomaticRelationshipSettings;
  children: NestingChildAnalysis[];
  missingOccurrences: MissingRelationshipOccurrence[];
  visibilityChanges: NestingVisibilityChange[];
  dependencyState: NestingDependencyState;
}

export interface NestingApplyResult {
  nodeIds: string[];
  relationshipIds: string[];
  connectionIds: string[];
}

export function isAutomaticRelationshipTriggerEnabled(
  trigger: NestingTrigger,
  settings: AutomaticRelationshipSettings,
): boolean {
  if (!settings.useNestedConnections) return false;
  if (trigger === 'palette') return settings.createRelationWhenAddingNewElementToContainer;
  if (trigger === 'tree') return settings.createRelationWhenAddingModelTreeElementToContainer;
  return settings.createRelationWhenMovingElementToContainer;
}

export function isConnectionHiddenByNesting(
  model: ModelState,
  connectionId: string,
  settings: AutomaticRelationshipSettings = DEFAULT_AUTOMATIC_RELATIONSHIP_SETTINGS,
): boolean {
  if (!settings.useNestedConnections) return false;
  const connection = model.connections[connectionId];
  if (!connection) return false;
  const source = model.nodes[connection.sourceId];
  const target = model.nodes[connection.targetId];
  if (!source || !target) return false;
  const directlyNested = source.parentId === target.id || target.parentId === source.id;
  if (!directlyNested) return false;
  if (connection.connType === 'plain') return true;
  const relationship = connection.relationshipId
    ? model.relationships[connection.relationshipId]
    : undefined;
  return Boolean(
    relationship && isRelationshipTypeInMask(relationship.type, settings.hiddenRelationsTypes),
  );
}

export function createNestedConnectionVisibilityResolver(
  model: ModelState,
  settings: AutomaticRelationshipSettings = DEFAULT_AUTOMATIC_RELATIONSHIP_SETTINGS,
): (connectionId: string) => boolean {
  return createConnectionVisibilityResolver(
    model,
    (connectableId) => !isConnectionHiddenByNesting(model, connectableId, settings),
  );
}

export function analyzeNestingChange(
  model: ModelState,
  input: NestingChangeInput,
  settings: AutomaticRelationshipSettings = DEFAULT_AUTOMATIC_RELATIONSHIP_SETTINGS,
): NestingChangePlan {
  const staged = stageModel(model, input);
  const capturedInput = clone(input);
  const capturedSettings = { ...settings };
  if (!staged) {
    return {
      input: capturedInput,
      settings: capturedSettings,
      children: [],
      missingOccurrences: [],
      visibilityChanges: [],
      dependencyState: emptyDependencyState(),
    };
  }

  const triggerEnabled = isAutomaticRelationshipTriggerEnabled(input.trigger, settings);
  const children = triggerEnabled
    ? analyzeChildren(model, staged, input, settings)
    : [];
  const newParentMissingOccurrences = triggerEnabled
    ? [
        ...children.flatMap((child) => child.missingOccurrences),
        ...missingOccurrencesForNewParents(
          model,
          staged,
          input,
          settings,
          new Set(children.map((child) => child.childNodeId)),
        ),
      ]
    : [];
  const stagedOccurrences = triggerEnabled
    ? stageNewOccurrenceConnections(
        model,
        staged,
        input,
        newParentMissingOccurrences,
      )
    : { model: staged, missingOccurrences: [] };
  const missingOccurrences = triggerEnabled
    ? uniqueMissingOccurrences([
        ...newParentMissingOccurrences,
        ...missingOccurrencesForOldParents(model, input, settings),
        ...stagedOccurrences.missingOccurrences,
        ...missingRelationshipEndpointOccurrences(model, stagedOccurrences.model, input),
      ])
    : [];
  const beforeVisibility = createNestedConnectionVisibilityResolver(model, settings);
  const afterVisibility = createNestedConnectionVisibilityResolver(staged, settings);
  const visibilityChanges = Object.keys(model.connections).flatMap((connectionId) => {
    const before = beforeVisibility(connectionId);
    const after = afterVisibility(connectionId);
    return before === after ? [] : [{ connectionId, before, after }];
  });
  const dependencyState = triggerEnabled
    ? captureNestingDependencyState(model, staged, input)
    : emptyDependencyState();
  return {
    input: capturedInput,
    settings: capturedSettings,
    children,
    missingOccurrences,
    visibilityChanges,
    dependencyState,
  };
}

export function applyNestingChange(
  plan: NestingChangePlan,
  selections: Record<string, string | null> = {},
  store: ModelStore = getActiveModelStore(),
): NestingApplyResult {
  const result: NestingApplyResult = { nodeIds: [], relationshipIds: [], connectionIds: [] };
  const state = store.getState();
  if (!state.model || state.readOnly) return result;
  const staged = stageModel(state.model, plan.input);
  if (!staged) return result;
  const dependencyStateChanged =
    isAutomaticRelationshipTriggerEnabled(plan.input.trigger, plan.settings) &&
    !dependencyStatesEqual(
      plan.dependencyState,
      captureNestingDependencyState(state.model, staged, plan.input),
    );
  if (
    dependencyStateChanged ||
    !planReferencesAreValid(staged, plan, selections)
  ) {
    return result;
  }

  transact('Automatic Relationship Management', (draft) => {
    const createdNodeIds = applyEntriesToDraft(draft, plan.input);
    result.nodeIds.push(...createdNodeIds);

    for (const child of plan.children) {
      const selectedId = selections[child.childNodeId];
      const candidate = selectedId
        ? child.candidates.find((item) => item.id === selectedId)
        : undefined;
      if (candidate) {
        const relationshipId = newId();
        const folderId = defaultFolderId(draft, 'relations');
        draft.relationships[relationshipId] = {
          id: relationshipId,
          kind: 'relationship',
          type: candidate.relationshipType,
          name: '',
          documentation: '',
          properties: [],
          profileIds: [],
          folderId,
          sourceId: candidate.sourceElementId,
          targetId: candidate.targetElementId,
        };
        draft.folders[folderId].itemIds.push(relationshipId);
        result.relationshipIds.push(relationshipId);
        const connectionId = addRelationshipOccurrence(
          draft,
          plan.input.viewId,
          relationshipId,
          candidate.sourceNodeId,
          candidate.targetNodeId,
        );
        if (connectionId) result.connectionIds.push(connectionId);
      }

    }

    for (const missing of plan.missingOccurrences) {
      const connectionId = addRelationshipOccurrence(
        draft,
        plan.input.viewId,
        missing.relationshipId,
        missing.sourceNodeId,
        missing.targetNodeId,
        missing.connectionId,
      );
      if (connectionId) result.connectionIds.push(connectionId);
    }
  }, store);

  return result;
}

function captureNestingDependencyState(
  original: ModelState,
  staged: ModelState,
  input: NestingChangeInput,
): NestingDependencyState {
  const semanticConceptIds = new Set<string>();
  const connectableIds = new Set<string>();
  const affectedParentNodeIds = new Set<string>();
  for (const entry of input.entries) {
    if (entry.kind === 'add-view-reference') continue;
    const stagedChild = asElementNode(staged.nodes[entry.nodeId]);
    if (!stagedChild) continue;
    if (entry.kind === 'move' && original.nodes[entry.nodeId]?.parentId === entry.parentId) {
      continue;
    }

    const parents = new Map<string, ElementNode>();
    const newParent = asElementNode(staged.nodes[stagedChild.parentId]);
    if (newParent) parents.set(newParent.id, newParent);
    if (entry.kind === 'move') {
      const originalChild = asElementNode(original.nodes[entry.nodeId]);
      const oldParent = originalChild
        ? asElementNode(original.nodes[originalChild.parentId])
        : undefined;
      if (oldParent) parents.set(oldParent.id, oldParent);
    }
    if (parents.size === 0) continue;

    semanticConceptIds.add(stagedChild.elementId);
    connectableIds.add(stagedChild.id);
    for (const parent of parents.values()) {
      semanticConceptIds.add(parent.elementId);
      connectableIds.add(parent.id);
      affectedParentNodeIds.add(parent.id);
    }
  }

  for (const parentNodeId of affectedParentNodeIds) {
    for (const childId of staged.nodes[parentNodeId]?.childIds ?? []) {
      connectableIds.add(childId);
    }
  }

  // Relationship ids are semantic concepts and relationship occurrences are
  // diagram connectables. Expanding both sets to a fixed point preserves
  // relationship-as-endpoint and connection-as-endpoint dependency chains.
  let changed = true;
  while (changed) {
    const beforeSemanticCount = semanticConceptIds.size;
    const beforeConnectableCount = connectableIds.size;

    for (const connectableId of connectableIds) {
      const node = staged.nodes[connectableId];
      if (node?.nodeType === 'element') semanticConceptIds.add(node.elementId);
      const connection = staged.connections[connectableId];
      if (connection?.relationshipId) semanticConceptIds.add(connection.relationshipId);
    }

    for (const relationship of Object.values(staged.relationships)) {
      if (
        !semanticConceptIds.has(relationship.id) &&
        !semanticConceptIds.has(relationship.sourceId) &&
        !semanticConceptIds.has(relationship.targetId)
      ) {
        continue;
      }
      semanticConceptIds.add(relationship.id);
      semanticConceptIds.add(relationship.sourceId);
      semanticConceptIds.add(relationship.targetId);
    }

    for (const node of Object.values(staged.nodes)) {
      if (
        node.viewId === input.viewId &&
        node.nodeType === 'element' &&
        semanticConceptIds.has(node.elementId)
      ) {
        connectableIds.add(node.id);
      }
    }

    for (const connection of Object.values(staged.connections)) {
      if (connection.viewId !== input.viewId) continue;
      const representsDependency = Boolean(
        connection.relationshipId && semanticConceptIds.has(connection.relationshipId),
      );
      const touchesDependency =
        connectableIds.has(connection.id) ||
        connectableIds.has(connection.sourceId) ||
        connectableIds.has(connection.targetId);
      if (!representsDependency && !touchesDependency) continue;
      connectableIds.add(connection.id);
      connectableIds.add(connection.sourceId);
      connectableIds.add(connection.targetId);
      if (connection.relationshipId) semanticConceptIds.add(connection.relationshipId);
    }

    changed =
      semanticConceptIds.size !== beforeSemanticCount ||
      connectableIds.size !== beforeConnectableCount;
  }

  const sortedSemanticConceptIds = [...semanticConceptIds].sort();
  const sortedConnectableIds = [...connectableIds].sort();
  return {
    semanticConceptIds: sortedSemanticConceptIds,
    connectableIds: sortedConnectableIds,
    elements: sortedSemanticConceptIds.flatMap((elementId) => {
      const element = staged.elements[elementId];
      return element ? [{ elementId, elementType: element.type }] : [];
    }),
    relationships: sortedSemanticConceptIds.flatMap((relationshipId) => {
      const relationship = staged.relationships[relationshipId];
      return relationship
        ? [
            {
              relationshipId,
              relationshipType: relationship.type,
              sourceConceptId: relationship.sourceId,
              targetConceptId: relationship.targetId,
            },
          ]
        : [];
    }),
    nodes: sortedConnectableIds.flatMap((nodeId) => {
      const node = staged.nodes[nodeId];
      if (!node || node.viewId !== input.viewId) return [];
      return [
        {
          nodeId,
          nodeType: node.nodeType,
          representedConceptId: node.nodeType === 'element' ? node.elementId : null,
          parentId: node.parentId,
          childIds: [...node.childIds].sort(),
        },
      ];
    }),
    connections: sortedConnectableIds.flatMap((connectionId) => {
      const connection = staged.connections[connectionId];
      if (!connection || connection.viewId !== input.viewId) return [];
      return [
        {
          connectionId,
          connType: connection.connType,
          relationshipId: connection.relationshipId ?? null,
          sourceConnectableId: connection.sourceId,
          targetConnectableId: connection.targetId,
        },
      ];
    }),
  };
}

function asElementNode(node: ModelState['nodes'][string] | undefined): ElementNode | undefined {
  return node?.nodeType === 'element' ? node : undefined;
}

function dependencyStatesEqual(
  expected: NestingDependencyState,
  actual: NestingDependencyState,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function emptyDependencyState(): NestingDependencyState {
  return {
    semanticConceptIds: [],
    connectableIds: [],
    elements: [],
    relationships: [],
    nodes: [],
    connections: [],
  };
}

function planReferencesAreValid(
  model: ModelState,
  plan: NestingChangePlan,
  selections: Record<string, string | null>,
): boolean {
  const representedConcepts = new Map<string, string>();
  for (const node of Object.values(model.nodes)) {
    if (node.viewId === plan.input.viewId && node.nodeType === 'element') {
      representedConcepts.set(node.id, node.elementId);
    }
  }
  for (const connection of Object.values(model.connections)) {
    if (connection.viewId === plan.input.viewId && connection.relationshipId) {
      representedConcepts.set(connection.id, connection.relationshipId);
    }
  }

  for (const child of plan.children) {
    for (const reusable of child.reusableRelationships) {
      const relationship = model.relationships[reusable.relationshipId];
      if (
        !relationship ||
        relationship.type !== reusable.relationshipType ||
        relationship.sourceId !== reusable.sourceElementId ||
        relationship.targetId !== reusable.targetElementId
      ) {
        return false;
      }
    }

    const nowReusable = child.candidates.some((currentCandidate) =>
      Object.values(model.relationships).some(
        (relationship) =>
          relationship.type === currentCandidate.relationshipType &&
          relationshipMatchesCandidate(relationship, currentCandidate),
      ),
    );
    if (nowReusable) return false;

    const selectedId = selections[child.childNodeId];
    if (selectedId === undefined || selectedId === null) continue;
    const candidate = child.candidates.find((item) => item.id === selectedId);
    if (
      !candidate ||
      representedConcepts.get(candidate.sourceNodeId) !== candidate.sourceElementId ||
      representedConcepts.get(candidate.targetNodeId) !== candidate.targetElementId ||
      !model.elements[candidate.sourceElementId] ||
      !model.elements[candidate.targetElementId]
    ) {
      return false;
    }
  }

  for (const missing of plan.missingOccurrences) {
    const relationship = model.relationships[missing.relationshipId];
    if (
      !relationship ||
      Boolean(model.nodes[missing.connectionId] || model.connections[missing.connectionId]) ||
      representedConcepts.has(missing.connectionId) ||
      representedConcepts.get(missing.sourceNodeId) !== relationship.sourceId ||
      representedConcepts.get(missing.targetNodeId) !== relationship.targetId
    ) {
      return false;
    }
    const alreadyExists = Object.values(model.connections).some(
      (connection) =>
        connection.viewId === plan.input.viewId &&
        connection.relationshipId === missing.relationshipId &&
        connection.sourceId === missing.sourceNodeId &&
        connection.targetId === missing.targetNodeId,
    );
    if (alreadyExists) return false;
    representedConcepts.set(missing.connectionId, missing.relationshipId);
  }
  return true;
}

function analyzeChildren(
  original: ModelState,
  staged: ModelState,
  input: NestingChangeInput,
  settings: AutomaticRelationshipSettings,
): NestingChildAnalysis[] {
  const view = staged.views[input.viewId];
  if (!view) return [];
  const children: NestingChildAnalysis[] = [];
  for (const entry of input.entries) {
    if (entry.kind === 'add-view-reference') continue;
    const childNode = staged.nodes[entry.nodeId];
    if (
      entry.kind === 'move' &&
      original.nodes[entry.nodeId]?.parentId === childNode?.parentId
    ) {
      continue;
    }
    const parentNode = childNode ? staged.nodes[childNode.parentId] : undefined;
    if (
      !childNode ||
      childNode.nodeType !== 'element' ||
      !parentNode ||
      parentNode.nodeType !== 'element'
    ) {
      continue;
    }
    const childElement = staged.elements[childNode.elementId];
    const parentElement = staged.elements[parentNode.elementId];
    if (!childElement || !parentElement || childElement.type === 'Junction') continue;
    const allCandidates = enumerateCandidates(
      parentElement.id,
      parentElement.type,
      parentNode.id,
      childElement.id,
      childElement.type,
      childNode.id,
      view.viewpoint,
      settings,
    );
    const reusableRelationships: ReusableNestingRelationship[] = [];
    for (const candidate of allCandidates) {
      for (const relationship of Object.values(staged.relationships)) {
        if (
          relationship.type === candidate.relationshipType &&
          relationshipMatchesCandidate(relationship, candidate) &&
          !reusableRelationships.some((item) => item.relationshipId === relationship.id)
        ) {
          reusableRelationships.push({
            relationshipId: relationship.id,
            relationshipType: relationship.type,
            direction: candidate.direction,
            sourceElementId: relationship.sourceId,
            targetElementId: relationship.targetId,
          });
        }
      }
    }

    const missingOccurrences = missingOccurrencesForPair(
      staged,
      input.viewId,
      parentNode.id,
      parentElement.id,
      childNode.id,
      childElement.id,
      settings,
    );
    children.push({
      childNodeId: childNode.id,
      childElementId: childElement.id,
      childLabel: childElement.name,
      parentNodeId: parentNode.id,
      parentElementId: parentElement.id,
      parentLabel: parentElement.name,
      candidates: reusableRelationships.length > 0 ? [] : allCandidates,
      reusableRelationships,
      missingOccurrences,
    });
  }
  return children;
}

function enumerateCandidates(
  parentElementId: string,
  parentType: ElementType,
  parentNodeId: string,
  childElementId: string,
  childType: ElementType,
  childNodeId: string,
  viewpointId: string | undefined,
  settings: AutomaticRelationshipSettings,
): NestingRelationshipCandidate[] {
  const candidates: NestingRelationshipCandidate[] = [];
  const append = (direction: 'normal' | 'reverse', relationshipType: RelationshipType) => {
    let sourceElementId = direction === 'normal' ? parentElementId : childElementId;
    let targetElementId = direction === 'normal' ? childElementId : parentElementId;
    let sourceNodeId = direction === 'normal' ? parentNodeId : childNodeId;
    let targetNodeId = direction === 'normal' ? childNodeId : parentNodeId;
    let sourceType = direction === 'normal' ? parentType : childType;
    let targetType = direction === 'normal' ? childType : parentType;
    if (relationshipType === 'SpecializationRelationship') {
      [sourceElementId, targetElementId] = [targetElementId, sourceElementId];
      [sourceNodeId, targetNodeId] = [targetNodeId, sourceNodeId];
      [sourceType, targetType] = [targetType, sourceType];
    }
    if (
      !isAllowedRelationshipInViewpoint(viewpointId, relationshipType) ||
      !isAllowedRelationship(relationshipType, sourceType, targetType)
    ) {
      return;
    }
    candidates.push({
      id: `create:${direction}:${relationshipType}`,
      direction,
      relationshipType,
      sourceElementId,
      targetElementId,
      sourceNodeId,
      targetNodeId,
    });
  };
  for (const type of relationshipTypesInMask(settings.newRelationsTypes)) append('normal', type);
  for (const type of relationshipTypesInMask(settings.newReverseRelationsTypes)) append('reverse', type);
  return candidates;
}

function relationshipMatchesCandidate(
  relationship: ModelState['relationships'][string],
  candidate: NestingRelationshipCandidate,
): boolean {
  const exactDirection =
    relationship.sourceId === candidate.sourceElementId &&
    relationship.targetId === candidate.targetElementId;
  if (exactDirection) return true;
  return (
    relationship.type === 'SpecializationRelationship' &&
    relationship.sourceId === candidate.targetElementId &&
    relationship.targetId === candidate.sourceElementId
  );
}

function missingOccurrencesForPair(
  model: ModelState,
  viewId: string,
  parentNodeId: string,
  parentElementId: string,
  childNodeId: string,
  childElementId: string,
  settings: AutomaticRelationshipSettings,
): MissingRelationshipOccurrence[] {
  const missing: MissingRelationshipOccurrence[] = [];
  const relationships = Object.values(model.relationships).filter((relationship) =>
    isRelationshipTypeInMask(relationship.type, settings.hiddenRelationsTypes),
  );
  const relationshipIds = new Set(relationships.map((relationship) => relationship.id));
  const existingDirections = new Set<'normal' | 'reverse'>();
  for (const connection of Object.values(model.connections)) {
    if (connection.viewId !== viewId) continue;
    if (!connection.relationshipId || !relationshipIds.has(connection.relationshipId)) continue;
    if (connection.sourceId === parentNodeId && connection.targetId === childNodeId) {
      existingDirections.add('normal');
    }
    if (connection.sourceId === childNodeId && connection.targetId === parentNodeId) {
      existingDirections.add('reverse');
    }
  }
  for (const relationship of relationships) {
    const normal =
      relationship.sourceId === parentElementId && relationship.targetId === childElementId;
    const reverse =
      relationship.sourceId === childElementId && relationship.targetId === parentElementId;
    if (!normal && !reverse) continue;
    const direction = normal ? 'normal' : 'reverse';
    if (existingDirections.has(direction)) continue;
    const sourceNodeId = normal ? parentNodeId : childNodeId;
    const targetNodeId = normal ? childNodeId : parentNodeId;
    missing.push({
      connectionId: newId(),
      relationshipId: relationship.id,
      sourceNodeId,
      targetNodeId,
    });
  }
  return missing;
}

function missingOccurrencesForNewParents(
  original: ModelState,
  staged: ModelState,
  input: NestingChangeInput,
  settings: AutomaticRelationshipSettings,
  skipChildNodeIds: ReadonlySet<string>,
): MissingRelationshipOccurrence[] {
  const missing: MissingRelationshipOccurrence[] = [];
  for (const entry of input.entries) {
    if (entry.kind === 'add-view-reference' || skipChildNodeIds.has(entry.nodeId)) continue;
    if (entry.kind === 'move' && original.nodes[entry.nodeId]?.parentId === entry.parentId) continue;
    const childNode = staged.nodes[entry.nodeId];
    const parentNode = childNode ? staged.nodes[childNode.parentId] : undefined;
    if (
      !childNode ||
      childNode.nodeType !== 'element' ||
      !parentNode ||
      parentNode.nodeType !== 'element'
    ) {
      continue;
    }
    const childElement = staged.elements[childNode.elementId];
    const parentElement = staged.elements[parentNode.elementId];
    if (!childElement || !parentElement) continue;
    missing.push(
      ...missingOccurrencesForPair(
        staged,
        input.viewId,
        parentNode.id,
        parentElement.id,
        childNode.id,
        childElement.id,
        settings,
      ),
    );
  }
  return missing;
}

function missingOccurrencesForOldParents(
  model: ModelState,
  input: NestingChangeInput,
  settings: AutomaticRelationshipSettings,
): MissingRelationshipOccurrence[] {
  const missing: MissingRelationshipOccurrence[] = [];
  for (const entry of input.entries) {
    if (entry.kind !== 'move') continue;
    const childNode = model.nodes[entry.nodeId];
    if (childNode?.parentId === entry.parentId) continue;
    const oldParent = childNode ? model.nodes[childNode.parentId] : undefined;
    if (
      !childNode ||
      childNode.nodeType !== 'element' ||
      !oldParent ||
      oldParent.nodeType !== 'element'
    ) {
      continue;
    }
    const childElement = model.elements[childNode.elementId];
    const parentElement = model.elements[oldParent.elementId];
    if (!childElement || !parentElement) continue;
    missing.push(
      ...missingOccurrencesForPair(
        model,
        input.viewId,
        oldParent.id,
        parentElement.id,
        childNode.id,
        childElement.id,
        settings,
      ),
    );
  }
  return missing;
}

function uniqueMissingOccurrences(
  occurrences: MissingRelationshipOccurrence[],
): MissingRelationshipOccurrence[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const key = `${occurrence.relationshipId}|${occurrence.sourceNodeId}|${occurrence.targetNodeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingRelationshipEndpointOccurrences(
  original: ModelState,
  model: ModelState,
  input: NestingChangeInput,
): MissingRelationshipOccurrence[] {
  const parentIds = new Set<string>();
  for (const entry of input.entries) {
    if (
      entry.kind === 'move' &&
      original.nodes[entry.nodeId]?.parentId === entry.parentId
    ) {
      continue;
    }
    const node = model.nodes[entry.nodeId];
    const parent = node ? model.nodes[node.parentId] : undefined;
    if (parent?.nodeType === 'element') parentIds.add(parent.id);
  }

  const missing: MissingRelationshipOccurrence[] = [];
  for (const parentNodeId of parentIds) {
    const parentNode = model.nodes[parentNodeId];
    if (!parentNode || parentNode.nodeType !== 'element') continue;
    const directChildren = new Set(parentNode.childIds);
    const representedConnections = Object.values(model.connections).filter(
      (connection) =>
        connection.relationshipId &&
        (directChildren.has(connection.sourceId) || directChildren.has(connection.targetId)),
    );
    for (const representedConnection of representedConnections) {
      const representedRelationshipId = representedConnection.relationshipId!;
      for (const relationship of Object.values(model.relationships)) {
        let sourceNodeId: string | undefined;
        let targetNodeId: string | undefined;
        if (
          relationship.sourceId === parentNode.elementId &&
          relationship.targetId === representedRelationshipId
        ) {
          sourceNodeId = parentNodeId;
          targetNodeId = representedConnection.id;
        } else if (
          relationship.sourceId === representedRelationshipId &&
          relationship.targetId === parentNode.elementId
        ) {
          sourceNodeId = representedConnection.id;
          targetNodeId = parentNodeId;
        }
        if (!sourceNodeId || !targetNodeId) continue;
        const exists = Object.values(model.connections).some(
          (connection) =>
            connection.viewId === input.viewId &&
            connection.relationshipId === relationship.id &&
            connection.sourceId === sourceNodeId &&
            connection.targetId === targetNodeId,
        );
        if (!exists) {
          missing.push({
            connectionId: newId(),
            relationshipId: relationship.id,
            sourceNodeId,
            targetNodeId,
          });
        }
      }
    }
  }
  return missing;
}

function stageNewOccurrenceConnections(
  original: ModelState,
  staged: ModelState,
  input: NestingChangeInput,
  planned: MissingRelationshipOccurrence[],
): { model: ModelState; missingOccurrences: MissingRelationshipOccurrence[] } {
  const withConnections = clone(staged);
  for (const occurrence of planned) {
    addRelationshipOccurrence(
      withConnections,
      input.viewId,
      occurrence.relationshipId,
      occurrence.sourceNodeId,
      occurrence.targetNodeId,
      occurrence.connectionId,
    );
  }
  for (const entry of input.entries) {
    if (entry.kind !== 'create-element' && entry.kind !== 'add-occurrence') continue;
    addMissingRelationshipConnectionsForNode(withConnections, input.viewId, entry.nodeId);
  }
  const missingOccurrences = Object.values(withConnections.connections)
    .filter(
      (connection) =>
        !original.connections[connection.id] &&
        connection.connType === 'relationship' &&
        Boolean(connection.relationshipId),
    )
    .map((connection) => ({
      connectionId: connection.id,
      relationshipId: connection.relationshipId!,
      sourceNodeId: connection.sourceId,
      targetNodeId: connection.targetId,
    }));
  return { model: withConnections, missingOccurrences };
}

function addRelationshipOccurrence(
  draft: ModelState,
  viewId: string,
  relationshipId: string,
  sourceNodeId: string,
  targetNodeId: string,
  preferredId = newId(),
): string | null {
  if (
    !draft.relationships[relationshipId] ||
    !getConnectable(draft, sourceNodeId) ||
    !getConnectable(draft, targetNodeId)
  ) {
    return null;
  }
  const existing = Object.values(draft.connections).find(
    (connection) =>
      connection.viewId === viewId &&
      connection.relationshipId === relationshipId &&
      connection.sourceId === sourceNodeId &&
      connection.targetId === targetNodeId,
  );
  if (existing) return null;
  attachConnection(draft, {
    id: preferredId,
    viewId,
    connType: 'relationship',
    relationshipId,
    name: '',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: sourceNodeId,
    targetId: targetNodeId,
    bendpoints: [],
  });
  return preferredId;
}

function stageModel(model: ModelState, input: NestingChangeInput): ModelState | null {
  const staged = clone(model);
  if (!staged.views[input.viewId]) return null;
  try {
    applyEntriesToDraft(staged, input);
    if (!input.entries.every((entry) => entryAppliedExactly(staged, input.viewId, entry))) {
      return null;
    }
    return staged;
  } catch {
    return null;
  }
}

function entryAppliedExactly(
  model: ModelState,
  viewId: string,
  entry: NestingEntry,
): boolean {
  const node = model.nodes[entry.nodeId];
  if (
    !node ||
    node.viewId !== viewId ||
    node.parentId !== entry.parentId ||
    node.bounds.x !== entry.bounds.x ||
    node.bounds.y !== entry.bounds.y ||
    node.bounds.width !== entry.bounds.width ||
    node.bounds.height !== entry.bounds.height
  ) {
    return false;
  }
  if (entry.parentId === viewId) return true;
  return model.nodes[entry.parentId]?.viewId === viewId;
}

function applyEntriesToDraft(draft: ModelState, input: NestingChangeInput): string[] {
  const moves: MoveEntry[] = [];
  const createdNodeIds: string[] = [];
  for (const entry of input.entries) {
    if (entry.kind === 'move') {
      moves.push({ id: entry.nodeId, parentId: entry.parentId, bounds: { ...entry.bounds } });
      continue;
    }
    if (draft.nodes[entry.nodeId] || draft.connections[entry.nodeId]) {
      throw new Error(`Duplicate diagram object id: ${entry.nodeId}`);
    }
    if (entry.parentId !== input.viewId && !draft.nodes[entry.parentId]) {
      throw new Error(`Missing nesting parent: ${entry.parentId}`);
    }
    if (entry.kind === 'create-element') {
      if (draft.elements[entry.elementId] || draft.relationships[entry.elementId]) {
        throw new Error(`Duplicate concept id: ${entry.elementId}`);
      }
      const folderId = folderForElementType(draft, entry.elementType);
      draft.elements[entry.elementId] = {
        id: entry.elementId,
        kind: 'element',
        type: entry.elementType,
        name: entry.name,
        documentation: '',
        properties: [],
        profileIds: [...(entry.profileIds ?? [])],
        folderId,
        ...(entry.elementType === 'Junction' ? { junctionType: 'and' as const } : {}),
      };
      draft.folders[folderId].itemIds.push(entry.elementId);
      const node: ElementNode = {
        ...entry.defaults,
        id: entry.nodeId,
        viewId: input.viewId,
        parentId: entry.parentId,
        bounds: { ...entry.bounds },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'element',
        elementId: entry.elementId,
      };
      attachNode(draft, node);
    } else if (entry.kind === 'add-occurrence') {
      if (!draft.elements[entry.elementId]) throw new Error(`Missing element: ${entry.elementId}`);
      const node: ElementNode = {
        ...entry.defaults,
        id: entry.nodeId,
        viewId: input.viewId,
        parentId: entry.parentId,
        bounds: { ...entry.bounds },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'element',
        elementId: entry.elementId,
      };
      attachNode(draft, node);
    } else {
      if (!draft.views[entry.refViewId]) throw new Error(`Missing view: ${entry.refViewId}`);
      const node: RefNode = {
        ...entry.defaults,
        id: entry.nodeId,
        viewId: input.viewId,
        parentId: entry.parentId,
        bounds: { ...entry.bounds },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'ref',
        refViewId: entry.refViewId,
      };
      attachNode(draft, node);
    }
    createdNodeIds.push(entry.nodeId);
  }
  applyMoveEntriesToDraft(draft, moves);
  return createdNodeIds;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
