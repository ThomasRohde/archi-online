import { buildAnalysisGraph, type AnalysisDirection } from '../analysis-graph';
import {
  ELEMENT_TYPE_MAP,
  type ElementType,
  type RelationshipType,
} from '../metamodel';
import { isAllowedElementInViewpoint } from '../data/viewpoints';
import { newId } from '../id';
import {
  layoutElkGraph,
  type ElkGraph,
  type ElkGraphLayoutResult,
} from '../layout/elk-graph';
import {
  openView,
  transactWithSelection,
  type ModelStore,
} from '../store';
import type {
  DiagramConnection,
  DiagramNode,
  DiagramView,
  ModelState,
} from '../types';
import { defaultFolderId } from './concepts';
import { attachConnection, attachNode } from './draft';
import { compareStableText } from '../stable-order';

export interface GeneratedViewOptions {
  focusIds: readonly string[];
  name: string;
  viewpointId?: string;
  depth: number;
  direction: AnalysisDirection;
  elementTypes?: readonly ElementType[];
  relationshipTypes?: readonly RelationshipType[];
  allInternalRelationships: boolean;
}

export interface GeneratedViewResult {
  viewId: string;
  elementIds: string[];
  relationshipIds: string[];
  nodeIds: string[];
  connectionIds: string[];
  truncated: boolean;
}

interface PreparedGeneratedView extends GeneratedViewResult {
  view: DiagramView;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export type GeneratedViewLayout = (graph: ElkGraph) => Promise<ElkGraphLayoutResult>;

function relationshipOrder(model: ModelState, a: string, b: string): number {
  const left = model.relationships[a];
  const right = model.relationships[b];
  return compareStableText(left.name, right.name)
    || compareStableText(left.type, right.type)
    || compareStableText(a, b);
}

function validateFocus(model: ModelState, options: GeneratedViewOptions): string[] {
  const focusIds = [...new Set(options.focusIds)].filter(
    (id) => Boolean(model.elements[id] || model.relationships[id]),
  );
  if (focusIds.length === 0) throw new Error('Select at least one semantic element or relationship');
  for (const id of focusIds) {
    const element = model.elements[id];
    if (element && !isAllowedElementInViewpoint(options.viewpointId, element.type)) {
      throw new Error(`The selected element is not valid for viewpoint ${options.viewpointId}`);
    }
  }
  return focusIds;
}

async function prepareGeneratedView(
  model: ModelState,
  options: GeneratedViewOptions,
  layout: GeneratedViewLayout,
): Promise<PreparedGeneratedView> {
  const focusIds = validateFocus(model, options);
  const graph = buildAnalysisGraph(model, {
    focusIds,
    depth: options.depth,
    direction: options.direction,
    viewpointId: options.viewpointId,
    elementTypes: options.elementTypes,
    relationshipTypes: options.relationshipTypes,
  });
  const included = new Set(graph.conceptIds);
  const relationshipIds = [...graph.relationshipIds];
  const allowedRelationships = options.relationshipTypes?.length
    ? new Set(options.relationshipTypes)
    : undefined;
  let truncated = graph.truncated;
  if (options.allInternalRelationships) {
    const internal = Object.values(model.relationships)
      .filter((relationship) => (
        included.has(relationship.sourceId)
        && included.has(relationship.targetId)
        && (!allowedRelationships || allowedRelationships.has(relationship.type))
      ))
      .map((relationship) => relationship.id)
      .sort((a, b) => relationshipOrder(model, a, b));
    for (const id of internal) {
      if (relationshipIds.includes(id)) continue;
      if (included.size >= 1_000) {
        truncated = true;
        continue;
      }
      included.add(id);
      relationshipIds.push(id);
    }
  }
  const elementIds = graph.elementIds.filter((id) => included.has(id));
  if (elementIds.length === 0) throw new Error('The generated view has no eligible elements');

  const layoutGraph: ElkGraph = {
    nodes: elementIds.map((id) => {
      const definition = ELEMENT_TYPE_MAP[model.elements[id].type];
      return { id, width: definition.width, height: definition.height };
    }),
    edges: relationshipIds.flatMap((id) => {
      const relationship = model.relationships[id];
      return model.elements[relationship.sourceId] && model.elements[relationship.targetId]
        ? [{ id, sourceId: relationship.sourceId, targetId: relationship.targetId }]
        : [];
    }),
  };
  const placed = await layout(layoutGraph);
  for (const id of elementIds) {
    if (!placed.nodes[id]) throw new Error(`Layout omitted element ${id}`);
  }

  const viewId = newId();
  const view: DiagramView = {
    id: viewId,
    kind: 'view',
    name: options.name.trim() || 'Generated View',
    documentation: '',
    properties: [],
    folderId: defaultFolderId(model, 'diagrams'),
    viewpoint: options.viewpointId || undefined,
    childIds: [],
  };
  const occurrenceByConcept = new Map<string, string>();
  const nodes = elementIds.map((elementId): DiagramNode => {
    const id = newId();
    occurrenceByConcept.set(elementId, id);
    return {
      id,
      viewId,
      parentId: viewId,
      nodeType: 'element',
      elementId,
      bounds: { ...placed.nodes[elementId] },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
    };
  });

  const pending = relationshipIds.filter((id) => {
    const relationship = model.relationships[id];
    return included.has(relationship.sourceId) && included.has(relationship.targetId);
  });
  const connections: DiagramConnection[] = [];
  while (pending.length > 0) {
    let progressed = false;
    for (let index = 0; index < pending.length;) {
      const relationshipId = pending[index];
      const relationship = model.relationships[relationshipId];
      const sourceId = occurrenceByConcept.get(relationship.sourceId);
      const targetId = occurrenceByConcept.get(relationship.targetId);
      if (!sourceId || !targetId) {
        index++;
        continue;
      }
      const id = newId();
      connections.push({
        id,
        viewId,
        connType: 'relationship',
        relationshipId,
        name: '',
        documentation: '',
        properties: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        sourceId,
        targetId,
        bendpoints: [],
      });
      occurrenceByConcept.set(relationshipId, id);
      pending.splice(index, 1);
      progressed = true;
    }
    if (!progressed) {
      throw new Error(`Invalid relationship topology: ${pending.join(', ')}`);
    }
  }
  return {
    viewId,
    view,
    nodes,
    connections,
    elementIds,
    relationshipIds: connections.map((connection) => connection.relationshipId!),
    nodeIds: nodes.map((node) => node.id),
    connectionIds: connections.map((connection) => connection.id),
    truncated,
  };
}

/** Build, validate, and lay out before applying the complete generated view atomically. */
export async function generateViewFor(
  store: ModelStore,
  options: GeneratedViewOptions,
  layout: GeneratedViewLayout = (graph) => layoutElkGraph(graph, { direction: 'right' }),
): Promise<GeneratedViewResult> {
  const before = store.getState();
  if (!before.model) throw new Error('No model is open');
  if (before.readOnly) throw new Error('The model is read-only');
  const model = before.model;
  const modelEpoch = before.modelEpoch;
  const prepared = await prepareGeneratedView(model, options, layout);
  const current = store.getState();
  if (current.model !== model || current.modelEpoch !== modelEpoch) {
    throw new Error('The model changed while the view was being generated');
  }
  transactWithSelection('Generate View', (draft) => {
    draft.views[prepared.view.id] = prepared.view;
    draft.folders[prepared.view.folderId].itemIds.push(prepared.view.id);
    for (const node of prepared.nodes) attachNode(draft, node);
    for (const connection of prepared.connections) attachConnection(draft, connection);
  }, { source: 'tree', ids: [prepared.viewId] }, store);
  if (!store.getState().model?.views[prepared.viewId]) {
    throw new Error('The generated view could not be applied');
  }
  openView(prepared.viewId, store);
  return {
    viewId: prepared.viewId,
    elementIds: prepared.elementIds,
    relationshipIds: prepared.relationshipIds,
    nodeIds: prepared.nodeIds,
    connectionIds: prepared.connectionIds,
    truncated: prepared.truncated,
  };
}
