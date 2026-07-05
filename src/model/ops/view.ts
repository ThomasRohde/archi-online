import { newId } from '../id';
import { elementLabel, relationshipLabel, type ElementType, type RelationshipType } from '../metamodel';
import { isAllowedRelationship } from '../rules';
import { transact, useStore } from '../store';
import type {
  Bounds,
  ElementNode,
  GroupNode,
  ModelState,
  NoteNode,
} from '../types';
import { defaultFolderId, folderForElementType } from './concepts';
import { attachConnection, attachNode } from './draft';

export interface DiagramNodeDefaults {
  textAlignment?: number;
  textPosition?: number;
  fillColor?: string;
  lineColor?: string;
  fontColor?: string;
  font?: string;
  alpha?: number;
  lineAlpha?: number;
}

/**
 * Archi behaviour: when an element is placed on a view, connections are added
 * for every model relationship between it and elements already on the view.
 */
function addMissingConnections(draft: ModelState, viewId: string, nodeId: string): void {
  const node = draft.nodes[nodeId];
  if (!node || node.nodeType !== 'element') return;
  const elementId = node.elementId;
  const nodesByElement = new Map<string, string[]>();
  for (const n of Object.values(draft.nodes)) {
    if (n.viewId === viewId && n.nodeType === 'element') {
      const list = nodesByElement.get(n.elementId) ?? [];
      list.push(n.id);
      nodesByElement.set(n.elementId, list);
    }
  }
  const connected = new Set(
    Object.values(draft.connections)
      .filter((c) => c.viewId === viewId && c.relationshipId)
      .map((c) => `${c.relationshipId}|${c.sourceId}|${c.targetId}`),
  );
  for (const rel of Object.values(draft.relationships)) {
    const asSource = rel.sourceId === elementId ? nodesByElement.get(rel.targetId) : undefined;
    const asTarget = rel.targetId === elementId ? nodesByElement.get(rel.sourceId) : undefined;
    for (const otherId of asSource ?? []) {
      if (otherId === nodeId && rel.sourceId !== rel.targetId) continue;
      if (!connected.has(`${rel.id}|${nodeId}|${otherId}`)) {
        attachConnection(draft, {
          id: newId(),
          viewId,
          connType: 'relationship',
          relationshipId: rel.id,
          sourceId: nodeId,
          targetId: otherId,
          bendpoints: [],
        });
      }
    }
    for (const otherId of asTarget ?? []) {
      if (otherId === nodeId) continue;
      if (!connected.has(`${rel.id}|${otherId}|${nodeId}`)) {
        attachConnection(draft, {
          id: newId(),
          viewId,
          connType: 'relationship',
          relationshipId: rel.id,
          sourceId: otherId,
          targetId: nodeId,
          bendpoints: [],
        });
      }
    }
  }
}

export function addElementNodeToView(
  viewId: string,
  elementId: string,
  parentId: string,
  bounds: Bounds,
  autoConnect = true,
  defaults: DiagramNodeDefaults = {},
): string {
  const id = newId();
  transact('Add to View', (draft) => {
    if (!draft.views[viewId] || !draft.elements[elementId]) return;
    const node: ElementNode = {
      id,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId,
      ...defaults,
    };
    attachNode(draft, node);
    // UI drops auto-connect existing relationships (Archi preference default);
    // scripted view.add() does not (jArchi semantics).
    if (autoConnect) addMissingConnections(draft, viewId, id);
  });
  return id;
}

/** Palette drop: create a brand-new element and its node in one undo step. */
export function createElementOnView(
  type: ElementType,
  viewId: string,
  parentId: string,
  bounds: Bounds,
  name?: string,
  defaults: DiagramNodeDefaults = {},
): { elementId: string; nodeId: string } {
  const elementId = newId();
  const nodeId = newId();
  transact(`Create ${elementLabel(type)}`, (draft) => {
    const fid = folderForElementType(draft, type);
    draft.elements[elementId] = {
      id: elementId,
      kind: 'element',
      type,
      name: name ?? elementLabel(type),
      documentation: '',
      properties: [],
      folderId: fid,
      ...(type === 'Junction' ? { junctionType: 'and' as const } : {}),
    };
    draft.folders[fid].itemIds.push(elementId);
    const node: ElementNode = {
      id: nodeId,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId,
      ...defaults,
    };
    attachNode(draft, node);
  });
  return { elementId, nodeId };
}

/** Connection tool: create relationship + its connection. Returns null if invalid. */
export function createRelationshipOnView(
  type: RelationshipType,
  viewId: string,
  sourceNodeId: string,
  targetNodeId: string,
): { relationshipId: string; connectionId: string } | null {
  const model = useStore.getState().model;
  if (!model) return null;
  const srcNode = model.nodes[sourceNodeId];
  const tgtNode = model.nodes[targetNodeId];
  if (!srcNode || !tgtNode || srcNode.nodeType !== 'element' || tgtNode.nodeType !== 'element') {
    return null;
  }
  const srcEl = model.elements[srcNode.elementId];
  const tgtEl = model.elements[tgtNode.elementId];
  if (!srcEl || !tgtEl || !isAllowedRelationship(type, srcEl.type, tgtEl.type)) return null;
  const relationshipId = newId();
  const connectionId = newId();
  transact(`Create ${relationshipLabel(type)}`, (draft) => {
    const fid = defaultFolderId(draft, 'relations');
    draft.relationships[relationshipId] = {
      id: relationshipId,
      kind: 'relationship',
      type,
      name: '',
      documentation: '',
      properties: [],
      folderId: fid,
      sourceId: srcEl.id,
      targetId: tgtEl.id,
    };
    draft.folders[fid].itemIds.push(relationshipId);
    attachConnection(draft, {
      id: connectionId,
      viewId,
      connType: 'relationship',
      relationshipId,
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      bendpoints: [],
    });
  });
  return { relationshipId, connectionId };
}

/** Add a connection for an existing relationship between two nodes on a view. */
export function addConnectionToView(
  viewId: string,
  relationshipId: string,
  sourceNodeId: string,
  targetNodeId: string,
): string {
  const id = newId();
  transact('Add Connection', (draft) => {
    if (!draft.relationships[relationshipId]) return;
    attachConnection(draft, {
      id,
      viewId,
      connType: 'relationship',
      relationshipId,
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      bendpoints: [],
    });
  });
  return id;
}

export function addNoteToView(
  viewId: string,
  parentId: string,
  bounds: Bounds,
  content = '',
  defaults: DiagramNodeDefaults = {},
): string {
  const id = newId();
  transact('Create Note', (draft) => {
    const node: NoteNode = {
      id,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      content,
      properties: [],
      ...defaults,
    };
    attachNode(draft, node);
  });
  return id;
}

/** Drop a view from the tree onto a canvas: creates a diagram model reference. */
export function addRefNodeToView(
  viewId: string,
  refViewId: string,
  parentId: string,
  bounds: Bounds,
  defaults: DiagramNodeDefaults = {},
): string {
  const id = newId();
  transact('Add View Reference', (draft) => {
    if (!draft.views[refViewId]) return;
    attachNode(draft, {
      id,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'ref',
      refViewId,
      ...defaults,
    });
  });
  return id;
}

export function addGroupToView(
  viewId: string,
  parentId: string,
  bounds: Bounds,
  name = 'Group',
  defaults: DiagramNodeDefaults = {},
): string {
  const id = newId();
  transact('Create Group', (draft) => {
    const node: GroupNode = {
      id,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'group',
      name,
      documentation: '',
      properties: [],
      ...defaults,
    };
    attachNode(draft, node);
  });
  return id;
}
