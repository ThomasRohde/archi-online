import { isAllowedElementInViewpoint } from '../data/viewpoints';
import { newId } from '../id';
import {
  ELEMENT_TYPE_NAMES,
  RELATIONSHIP_TYPE_NAMES,
  elementLabel,
  relationshipLabel,
  type ElementType,
  type RelationshipType,
} from '../metamodel';
import { enumerateRelationshipCandidates } from '../rules';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import type { Bounds, ElementNode, ModelState } from '../types';
import { defaultFolderId, folderForElementType } from './concepts';
import { attachConnection, attachNode } from './draft';
import type { DiagramNodeDefaults } from './view';

export type MagicConnectionDirection = 'forward' | 'reverse';

export interface MagicExistingRelationshipChoice {
  relationshipId: string;
  name: string;
}

export interface MagicExistingTargetOption {
  direction: MagicConnectionDirection;
  relationshipType: RelationshipType;
  sourceElementId: string;
  targetElementId: string;
  sourceNodeId: string;
  targetNodeId: string;
  existingRelationships: MagicExistingRelationshipChoice[];
}

export interface MagicExistingTargetGroup {
  direction: MagicConnectionDirection;
  options: MagicExistingTargetOption[];
}

export interface MagicExistingTargetAnalysis {
  groups: MagicExistingTargetGroup[];
}

export interface MagicTargetCreationPair {
  relationshipType: RelationshipType;
  elementType: ElementType;
}

export interface MagicTargetCreationAnalysis {
  pairs: MagicTargetCreationPair[];
}

export interface MagicConnectionOnViewInput {
  viewId: string;
  sourceNodeId: string;
  targetNodeId: string;
  direction: MagicConnectionDirection;
  relationshipType: RelationshipType;
  relationshipId?: string;
}

export interface MagicConnectionOnViewResult {
  relationshipId: string;
  connectionId: string;
  reused: boolean;
}

export interface MagicTargetOnViewInput {
  viewId: string;
  sourceNodeId: string;
  parentId: string;
  bounds: Bounds;
  elementType: ElementType;
  relationshipType: RelationshipType;
  defaults?: DiagramNodeDefaults;
}

export interface MagicTargetOnViewResult {
  elementId: string;
  nodeId: string;
  relationshipId: string;
  connectionId: string;
}

function representedOnPair(
  model: ModelState,
  viewId: string,
  relationshipId: string,
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  return Object.values(model.connections).some(
    (connection) =>
      connection.viewId === viewId &&
      connection.connType === 'relationship' &&
      connection.relationshipId === relationshipId &&
      connection.sourceId === sourceNodeId &&
      connection.targetId === targetNodeId,
  );
}

function optionsForDirection(
  model: ModelState,
  viewId: string,
  direction: MagicConnectionDirection,
  sourceElementId: string,
  sourceType: ElementType,
  sourceNodeId: string,
  targetElementId: string,
  targetType: ElementType,
  targetNodeId: string,
  viewpointId: string | undefined,
): MagicExistingTargetOption[] {
  return enumerateRelationshipCandidates(
    { conceptId: sourceElementId, conceptType: sourceType, nodeId: sourceNodeId },
    { conceptId: targetElementId, conceptType: targetType, nodeId: targetNodeId },
    viewpointId,
    RELATIONSHIP_TYPE_NAMES,
    model,
  ).map((candidate) => ({
    direction,
    relationshipType: candidate.relationshipType,
    sourceElementId,
    targetElementId,
    sourceNodeId,
    targetNodeId,
    existingRelationships: Object.values(model.relationships)
      .filter(
        (relationship) =>
          relationship.type === candidate.relationshipType &&
          relationship.sourceId === sourceElementId &&
          relationship.targetId === targetElementId &&
          !representedOnPair(
            model,
            viewId,
            relationship.id,
            sourceNodeId,
            targetNodeId,
          ),
      )
      .map((relationship) => ({
        relationshipId: relationship.id,
        name: relationship.name,
      })),
  }));
}

export function analyzeMagicConnectionTarget(
  model: ModelState,
  input: { viewId: string; sourceNodeId: string; targetNodeId: string },
): MagicExistingTargetAnalysis {
  const view = model.views[input.viewId];
  const sourceNode = model.nodes[input.sourceNodeId];
  const targetNode = model.nodes[input.targetNodeId];
  if (
    !view ||
    sourceNode?.nodeType !== 'element' ||
    targetNode?.nodeType !== 'element' ||
    sourceNode.viewId !== input.viewId ||
    targetNode.viewId !== input.viewId
  ) {
    return {
      groups: [
        { direction: 'forward', options: [] },
        { direction: 'reverse', options: [] },
      ],
    };
  }
  const sourceElement = model.elements[sourceNode.elementId];
  const targetElement = model.elements[targetNode.elementId];
  if (!sourceElement || !targetElement) {
    return {
      groups: [
        { direction: 'forward', options: [] },
        { direction: 'reverse', options: [] },
      ],
    };
  }
  return {
    groups: [
      {
        direction: 'forward',
        options: optionsForDirection(
          model,
          input.viewId,
          'forward',
          sourceElement.id,
          sourceElement.type,
          sourceNode.id,
          targetElement.id,
          targetElement.type,
          targetNode.id,
          view.viewpoint,
        ),
      },
      {
        direction: 'reverse',
        options: optionsForDirection(
          model,
          input.viewId,
          'reverse',
          targetElement.id,
          targetElement.type,
          targetNode.id,
          sourceElement.id,
          sourceElement.type,
          sourceNode.id,
          view.viewpoint,
        ),
      },
    ],
  };
}

export function analyzeMagicTargetCreation(
  model: ModelState,
  input: { viewId: string; sourceNodeId: string },
): MagicTargetCreationAnalysis {
  const view = model.views[input.viewId];
  const sourceNode = model.nodes[input.sourceNodeId];
  if (!view || sourceNode?.nodeType !== 'element' || sourceNode.viewId !== input.viewId) {
    return { pairs: [] };
  }
  const sourceElement = model.elements[sourceNode.elementId];
  if (!sourceElement) return { pairs: [] };

  const pairs: MagicTargetCreationPair[] = [];
  for (const relationshipType of RELATIONSHIP_TYPE_NAMES) {
    for (const elementType of ELEMENT_TYPE_NAMES) {
      if (!isAllowedElementInViewpoint(view.viewpoint, elementType)) continue;
      const candidates = enumerateRelationshipCandidates(
        {
          conceptId: sourceElement.id,
          conceptType: sourceElement.type,
          nodeId: sourceNode.id,
        },
        {
          conceptId: `new:${elementType}`,
          conceptType: elementType,
          resolveInstance: false,
        },
        view.viewpoint,
        [relationshipType],
        model,
      );
      if (candidates.length > 0) pairs.push({ relationshipType, elementType });
    }
  }
  return { pairs };
}

export function createMagicConnectionOnView(
  input: MagicConnectionOnViewInput,
  store: ModelStore = getActiveModelStore(),
): MagicConnectionOnViewResult | null {
  const state = store.getState();
  if (!state.model || state.readOnly) return null;
  const analysis = analyzeMagicConnectionTarget(state.model, input);
  const option = analysis.groups
    .find((group) => group.direction === input.direction)
    ?.options.find((candidate) => candidate.relationshipType === input.relationshipType);
  if (!option) return null;
  if (
    input.relationshipId &&
    !option.existingRelationships.some(
      (relationship) => relationship.relationshipId === input.relationshipId,
    )
  ) {
    return null;
  }

  const relationshipId = input.relationshipId ?? newId();
  const connectionId = newId();
  transact(`Create ${relationshipLabel(input.relationshipType)}`, (draft) => {
    if (!input.relationshipId) {
      const folderId = defaultFolderId(draft, 'relations');
      draft.relationships[relationshipId] = {
        id: relationshipId,
        kind: 'relationship',
        type: input.relationshipType,
        name: '',
        documentation: '',
        properties: [],
        profileIds: [],
        folderId,
        sourceId: option.sourceElementId,
        targetId: option.targetElementId,
      };
      draft.folders[folderId].itemIds.push(relationshipId);
    }
    attachConnection(draft, {
      id: connectionId,
      viewId: input.viewId,
      connType: 'relationship',
      relationshipId,
      name: '',
      documentation: '',
      properties: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      sourceId: option.sourceNodeId,
      targetId: option.targetNodeId,
      bendpoints: [],
    });
  }, store);

  const current = store.getState().model;
  if (!current?.relationships[relationshipId] || !current.connections[connectionId]) return null;
  return { relationshipId, connectionId, reused: !!input.relationshipId };
}

function finiteBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

export function createMagicTargetOnView(
  input: MagicTargetOnViewInput,
  store: ModelStore = getActiveModelStore(),
): MagicTargetOnViewResult | null {
  const state = store.getState();
  const model = state.model;
  if (!model || state.readOnly || !finiteBounds(input.bounds)) return null;
  const view = model.views[input.viewId];
  const sourceNode = model.nodes[input.sourceNodeId];
  const sourceElement =
    sourceNode?.nodeType === 'element' ? model.elements[sourceNode.elementId] : undefined;
  if (
    !view ||
    !sourceNode ||
    sourceNode.viewId !== input.viewId ||
    !sourceElement
  ) {
    return null;
  }
  if (input.parentId !== input.viewId) {
    const parent = model.nodes[input.parentId];
    if (parent?.nodeType !== 'group' || parent.viewId !== input.viewId) return null;
  }
  if (
    !analyzeMagicTargetCreation(model, input).pairs.some(
      (pair) =>
        pair.elementType === input.elementType &&
        pair.relationshipType === input.relationshipType,
    )
  ) {
    return null;
  }

  const result: MagicTargetOnViewResult = {
    elementId: newId(),
    nodeId: newId(),
    relationshipId: newId(),
    connectionId: newId(),
  };
  transact('Magic Connector', (draft) => {
    const elementFolderId = folderForElementType(draft, input.elementType);
    draft.elements[result.elementId] = {
      id: result.elementId,
      kind: 'element',
      type: input.elementType,
      name: elementLabel(input.elementType),
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: elementFolderId,
      ...(input.elementType === 'Junction' ? { junctionType: 'and' as const } : {}),
    };
    draft.folders[elementFolderId].itemIds.push(result.elementId);

    const node: ElementNode = {
      id: result.nodeId,
      viewId: input.viewId,
      parentId: input.parentId,
      bounds: input.bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId: result.elementId,
      ...input.defaults,
    };
    attachNode(draft, node);

    const relationshipFolderId = defaultFolderId(draft, 'relations');
    draft.relationships[result.relationshipId] = {
      id: result.relationshipId,
      kind: 'relationship',
      type: input.relationshipType,
      name: '',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relationshipFolderId,
      sourceId: sourceElement.id,
      targetId: result.elementId,
    };
    draft.folders[relationshipFolderId].itemIds.push(result.relationshipId);

    attachConnection(draft, {
      id: result.connectionId,
      viewId: input.viewId,
      connType: 'relationship',
      relationshipId: result.relationshipId,
      name: '',
      documentation: '',
      properties: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      sourceId: sourceNode.id,
      targetId: result.nodeId,
      bendpoints: [],
    });
  }, store);

  const current = store.getState().model;
  if (
    !current?.elements[result.elementId] ||
    !current.nodes[result.nodeId] ||
    !current.relationships[result.relationshipId] ||
    !current.connections[result.connectionId]
  ) {
    return null;
  }
  return result;
}
