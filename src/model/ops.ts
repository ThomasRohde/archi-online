// Model operations. Every mutation goes through transact() so undo/redo,
// UI and scripting all behave uniformly.
import { newId } from './id';
import {
  ELEMENT_TYPE_MAP,
  elementLabel,
  relationshipLabel,
  type ElementType,
  type Layer,
  type RelationshipType,
} from './metamodel';
import { isAllowedRelationship } from './rules';
import { transact, useStore } from './store';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Bounds,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  ElementNode,
  Folder,
  FolderType,
  GroupNode,
  ModelState,
  NoteNode,
  Property,
} from './types';

// ---------------------------------------------------------------- new model

const TOP_FOLDERS: { name: string; type: FolderType }[] = [
  { name: 'Strategy', type: 'strategy' },
  { name: 'Business', type: 'business' },
  { name: 'Application', type: 'application' },
  { name: 'Technology & Physical', type: 'technology' },
  { name: 'Motivation', type: 'motivation' },
  { name: 'Implementation & Migration', type: 'implementation_migration' },
  { name: 'Other', type: 'other' },
  { name: 'Relations', type: 'relations' },
  { name: 'Views', type: 'diagrams' },
];

export function createEmptyModel(name: string): ModelState {
  const state: ModelState = {
    info: { id: newId(), name, documentation: '', properties: [], version: '5.0.0' },
    folders: {},
    rootFolderIds: [],
    elements: {},
    relationships: {},
    views: {},
    nodes: {},
    connections: {},
  };
  for (const f of TOP_FOLDERS) {
    const folder: Folder = {
      id: newId(),
      kind: 'folder',
      name: f.name,
      folderType: f.type,
      documentation: '',
      properties: [],
      parentId: null,
      folderIds: [],
      itemIds: [],
    };
    state.folders[folder.id] = folder;
    state.rootFolderIds.push(folder.id);
  }
  return state;
}

const LAYER_FOLDER: Record<Layer, FolderType> = {
  strategy: 'strategy',
  business: 'business',
  application: 'application',
  technology: 'technology',
  physical: 'technology',
  motivation: 'motivation',
  implementation_migration: 'implementation_migration',
  other: 'other',
};

export function defaultFolderId(state: ModelState, folderType: FolderType): string {
  const id = state.rootFolderIds.find((fid) => state.folders[fid]?.folderType === folderType);
  if (!id) throw new Error(`missing top-level folder ${folderType}`);
  return id;
}

export function folderForElementType(state: ModelState, type: ElementType): string {
  return defaultFolderId(state, LAYER_FOLDER[ELEMENT_TYPE_MAP[type].layer]);
}

// ---------------------------------------------------------------- concepts

export function addElement(
  type: ElementType,
  name?: string,
  folderId?: string,
): string {
  const id = newId();
  transact(`Create ${elementLabel(type)}`, (draft) => {
    const fid = folderId ?? folderForElementType(draft, type);
    const el: ArchimateElement = {
      id,
      kind: 'element',
      type,
      name: name ?? elementLabel(type),
      documentation: '',
      properties: [],
      folderId: fid,
    };
    draft.elements[id] = el;
    draft.folders[fid].itemIds.push(id);
  });
  return id;
}

/** Returns null (no mutation) when the relationship is not allowed. */
export function addRelationship(
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  name = '',
  folderId?: string,
): string | null {
  const model = useStore.getState().model;
  if (!model) return null;
  const src = model.elements[sourceId] ?? model.relationships[sourceId];
  const tgt = model.elements[targetId] ?? model.relationships[targetId];
  if (!src || !tgt || !isAllowedRelationship(type, src.type, tgt.type)) return null;
  const id = newId();
  transact(`Create ${relationshipLabel(type)}`, (draft) => {
    const fid = folderId ?? defaultFolderId(draft, 'relations');
    const rel: ArchimateRelationship = {
      id,
      kind: 'relationship',
      type,
      name,
      documentation: '',
      properties: [],
      folderId: fid,
      sourceId,
      targetId,
    };
    draft.relationships[id] = rel;
    draft.folders[fid].itemIds.push(id);
  });
  return id;
}

export function addView(name = 'Default View', folderId?: string): string {
  const id = newId();
  transact('Create View', (draft) => {
    const fid = folderId ?? defaultFolderId(draft, 'diagrams');
    const view: DiagramView = {
      id,
      kind: 'view',
      name,
      documentation: '',
      properties: [],
      folderId: fid,
      childIds: [],
    };
    draft.views[id] = view;
    draft.folders[fid].itemIds.push(id);
  });
  return id;
}

export function addFolder(parentId: string, name = 'New Folder'): string {
  const id = newId();
  transact('Create Folder', (draft) => {
    const parent = draft.folders[parentId];
    if (!parent) return;
    const folder: Folder = {
      id,
      kind: 'folder',
      name,
      documentation: '',
      properties: [],
      parentId,
      folderIds: [],
      itemIds: [],
    };
    draft.folders[id] = folder;
    parent.folderIds.push(id);
  });
  return id;
}

export function renameItem(id: string, name: string): void {
  transact('Rename', (draft) => {
    const item =
      draft.elements[id] ?? draft.relationships[id] ?? draft.views[id] ?? draft.folders[id];
    if (item) item.name = name;
    else if (draft.info.id === id) draft.info.name = name;
    else {
      const node = draft.nodes[id];
      if (node && node.nodeType === 'group') node.name = name;
      else if (node && node.nodeType === 'note') node.content = name;
    }
  });
}

export function setDocumentation(id: string, documentation: string): void {
  transact('Edit Documentation', (draft) => {
    const item =
      draft.elements[id] ?? draft.relationships[id] ?? draft.views[id] ?? draft.folders[id];
    if (item) item.documentation = documentation;
    else if (draft.info.id === id) draft.info.documentation = documentation;
    else {
      const node = draft.nodes[id];
      if (node && node.nodeType === 'group') node.documentation = documentation;
    }
  });
}

export function setProperties(id: string, properties: Property[]): void {
  transact('Edit Properties', (draft) => {
    const item =
      draft.elements[id] ?? draft.relationships[id] ?? draft.views[id] ?? draft.folders[id];
    if (item) item.properties = properties;
    else if (draft.info.id === id) draft.info.properties = properties;
    else {
      const node = draft.nodes[id];
      if (node && (node.nodeType === 'group' || node.nodeType === 'note')) {
        node.properties = properties;
      }
    }
  });
}

/** Type-specific relationship attributes (access type, influence strength, direction). */
export function setRelationshipAttrs(
  id: string,
  attrs: { accessType?: number; strength?: string; directed?: boolean },
): void {
  transact('Change Relationship', (draft) => {
    const rel = draft.relationships[id];
    if (!rel) return;
    if ('accessType' in attrs) rel.accessType = attrs.accessType === 0 ? undefined : attrs.accessType;
    if ('strength' in attrs) rel.strength = attrs.strength === '' ? undefined : attrs.strength;
    if ('directed' in attrs) rel.directed = attrs.directed ? true : undefined;
  });
}

export function setJunctionType(id: string, junctionType: 'and' | 'or'): void {
  transact('Change Junction', (draft) => {
    const el = draft.elements[id];
    if (el?.type === 'Junction') el.junctionType = junctionType;
  });
}

export function setViewpoint(viewId: string, viewpoint: string): void {
  transact('Change Viewpoint', (draft) => {
    const view = draft.views[viewId];
    if (view) view.viewpoint = viewpoint === '' ? undefined : viewpoint;
  });
}

// ---------------------------------------------------------------- deletion

function removeFromFolder(draft: ModelState, id: string): void {
  for (const folder of Object.values(draft.folders)) {
    const i = folder.itemIds.indexOf(id);
    if (i >= 0) folder.itemIds.splice(i, 1);
    const j = folder.folderIds.indexOf(id);
    if (j >= 0) folder.folderIds.splice(j, 1);
  }
}

function deleteConnectionFromDraft(draft: ModelState, connId: string): void {
  const conn = draft.connections[connId];
  if (!conn) return;
  delete draft.connections[connId];
  const src = draft.nodes[conn.sourceId];
  if (src) src.sourceConnectionIds = src.sourceConnectionIds.filter((c) => c !== connId);
  const tgt = draft.nodes[conn.targetId];
  if (tgt) tgt.targetConnectionIds = tgt.targetConnectionIds.filter((c) => c !== connId);
}

function deleteNodeFromDraft(draft: ModelState, nodeId: string): void {
  const node = draft.nodes[nodeId];
  if (!node) return;
  for (const childId of [...node.childIds]) deleteNodeFromDraft(draft, childId);
  for (const connId of [...node.sourceConnectionIds, ...node.targetConnectionIds]) {
    deleteConnectionFromDraft(draft, connId);
  }
  const parentNode = draft.nodes[node.parentId];
  if (parentNode) parentNode.childIds = parentNode.childIds.filter((c) => c !== nodeId);
  const view = draft.views[node.viewId];
  if (view) view.childIds = view.childIds.filter((c) => c !== nodeId);
  delete draft.nodes[nodeId];
}

function deleteViewFromDraft(draft: ModelState, viewId: string): void {
  const view = draft.views[viewId];
  if (!view) return;
  for (const [id, node] of Object.entries(draft.nodes)) {
    if (node.viewId === viewId) delete draft.nodes[id];
  }
  for (const [id, conn] of Object.entries(draft.connections)) {
    if (conn.viewId === viewId) delete draft.connections[id];
  }
  removeFromFolder(draft, viewId);
  delete draft.views[viewId];
}

/** Relationships attached (transitively) to any concept in `seed`. */
function collectAttachedRelationships(draft: ModelState, seed: Set<string>): Set<string> {
  const doomed = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const rel of Object.values(draft.relationships)) {
      if (doomed.has(rel.id)) continue;
      if (doomed.has(rel.sourceId) || doomed.has(rel.targetId)) {
        doomed.add(rel.id);
        changed = true;
      }
    }
  }
  return doomed;
}

function deleteFolderFromDraft(draft: ModelState, folderId: string, doomedConcepts: Set<string>): void {
  const folder = draft.folders[folderId];
  if (!folder) return;
  for (const sub of [...folder.folderIds]) deleteFolderFromDraft(draft, sub, doomedConcepts);
  for (const itemId of [...folder.itemIds]) {
    if (draft.views[itemId]) deleteViewFromDraft(draft, itemId);
    else doomedConcepts.add(itemId);
  }
  removeFromFolder(draft, folderId);
  delete draft.folders[folderId];
}

/** Delete model items (elements, relationships, views, folders) with full cascade. */
export function deleteItems(ids: string[]): void {
  transact('Delete', (draft) => {
    const doomedConcepts = new Set<string>();
    for (const id of ids) {
      if (draft.folders[id]) {
        if (draft.folders[id].parentId === null) continue; // top-level folders are fixed
        deleteFolderFromDraft(draft, id, doomedConcepts);
      } else if (draft.views[id]) {
        deleteViewFromDraft(draft, id);
      } else if (draft.elements[id] || draft.relationships[id]) {
        doomedConcepts.add(id);
      }
    }
    if (doomedConcepts.size === 0) return;
    const doomed = collectAttachedRelationships(draft, doomedConcepts);
    // remove diagram nodes/connections that reference doomed concepts
    for (const [id, node] of Object.entries(draft.nodes)) {
      if (node.nodeType === 'element' && doomed.has(node.elementId) && draft.nodes[id]) {
        deleteNodeFromDraft(draft, id);
      }
    }
    for (const [id, conn] of Object.entries(draft.connections)) {
      if (conn.relationshipId && doomed.has(conn.relationshipId) && draft.connections[id]) {
        deleteConnectionFromDraft(draft, id);
      }
    }
    for (const id of doomed) {
      removeFromFolder(draft, id);
      delete draft.elements[id];
      delete draft.relationships[id];
    }
  });
}

export function moveItemsToFolder(ids: string[], folderId: string): void {
  transact('Move', (draft) => {
    const target = draft.folders[folderId];
    if (!target) return;
    for (const id of ids) {
      if (id === folderId) continue;
      const folder = draft.folders[id];
      if (folder && folder.parentId !== null) {
        // prevent moving a folder into its own subtree
        let p: string | null = folderId;
        let cyclic = false;
        while (p) {
          if (p === id) {
            cyclic = true;
            break;
          }
          p = draft.folders[p]?.parentId ?? null;
        }
        if (cyclic) continue;
        const oldParent = draft.folders[folder.parentId];
        if (oldParent) oldParent.folderIds = oldParent.folderIds.filter((f) => f !== id);
        folder.parentId = folderId;
        target.folderIds.push(id);
        continue;
      }
      const item = draft.elements[id] ?? draft.relationships[id] ?? draft.views[id];
      if (item) {
        const oldFolder = draft.folders[item.folderId];
        if (oldFolder) oldFolder.itemIds = oldFolder.itemIds.filter((i) => i !== id);
        item.folderId = folderId;
        target.itemIds.push(id);
      }
    }
  });
}

// ---------------------------------------------------------------- view ops

function attachNode(draft: ModelState, node: DiagramNode): void {
  draft.nodes[node.id] = node;
  if (node.parentId === node.viewId) {
    draft.views[node.viewId].childIds.push(node.id);
  } else {
    draft.nodes[node.parentId].childIds.push(node.id);
  }
}

function attachConnection(draft: ModelState, conn: DiagramConnection): void {
  draft.connections[conn.id] = conn;
  const src = draft.nodes[conn.sourceId];
  if (src) src.sourceConnectionIds.push(conn.id);
  const tgt = draft.nodes[conn.targetId];
  if (tgt) tgt.targetConnectionIds.push(conn.id);
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
    };
    attachNode(draft, node);
    addMissingConnections(draft, viewId, id);
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

export function addNoteToView(viewId: string, parentId: string, bounds: Bounds, content = ''): string {
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
    };
    attachNode(draft, node);
  });
  return id;
}

/** Drop a view from the tree onto a canvas: creates a diagram model reference. */
export function addRefNodeToView(viewId: string, refViewId: string, parentId: string, bounds: Bounds): string {
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
    });
  });
  return id;
}

export function addGroupToView(viewId: string, parentId: string, bounds: Bounds, name = 'Group'): string {
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
    };
    attachNode(draft, node);
  });
  return id;
}

export interface MoveEntry {
  id: string;
  parentId: string;
  bounds: Bounds;
}

/** Commit a drag: move and/or reparent several nodes in one undo step. */
export function commitMove(entries: MoveEntry[]): void {
  transact('Move', (draft) => {
    for (const entry of entries) {
      const node = draft.nodes[entry.id];
      if (!node) continue;
      if (node.parentId !== entry.parentId) {
        if (entry.id === entry.parentId) continue;
        let p: string | undefined = entry.parentId;
        let cyclic = false;
        while (p && draft.nodes[p]) {
          if (p === entry.id) {
            cyclic = true;
            break;
          }
          p = draft.nodes[p]!.parentId;
        }
        if (cyclic) continue;
        const oldParent = draft.nodes[node.parentId];
        if (oldParent) oldParent.childIds = oldParent.childIds.filter((c) => c !== entry.id);
        else {
          const view = draft.views[node.viewId];
          view.childIds = view.childIds.filter((c) => c !== entry.id);
        }
        node.parentId = entry.parentId;
        if (entry.parentId === node.viewId) draft.views[node.viewId].childIds.push(entry.id);
        else draft.nodes[entry.parentId].childIds.push(entry.id);
      }
      node.bounds = { ...entry.bounds };
    }
  });
}

/** Bring to front / send to back within the node's parent. */
export function reorderNode(id: string, where: 'front' | 'back'): void {
  transact(where === 'front' ? 'Bring to Front' : 'Send to Back', (draft) => {
    const node = draft.nodes[id];
    if (!node) return;
    const list =
      node.parentId === node.viewId
        ? draft.views[node.viewId].childIds
        : draft.nodes[node.parentId].childIds;
    const i = list.indexOf(id);
    if (i < 0) return;
    list.splice(i, 1);
    if (where === 'front') list.push(id);
    else list.unshift(id);
  });
}

export function moveNodes(moves: { id: string; x: number; y: number }[]): void {
  transact('Move', (draft) => {
    for (const m of moves) {
      const node = draft.nodes[m.id];
      if (node) {
        node.bounds.x = m.x;
        node.bounds.y = m.y;
      }
    }
  });
}

export function resizeNode(id: string, bounds: Bounds): void {
  transact('Resize', (draft) => {
    const node = draft.nodes[id];
    if (node) node.bounds = { ...bounds };
  });
}

/** Move a node under a new parent (view id or node id), with new relative bounds. */
export function reparentNode(id: string, newParentId: string, bounds: Bounds): void {
  transact('Move', (draft) => {
    const node = draft.nodes[id];
    if (!node || id === newParentId) return;
    // prevent dropping a node into its own descendant
    let p: string | undefined = newParentId;
    while (p && draft.nodes[p]) {
      if (p === id) return;
      p = draft.nodes[p]!.parentId;
    }
    const oldParent = draft.nodes[node.parentId];
    if (oldParent) oldParent.childIds = oldParent.childIds.filter((c) => c !== id);
    else draft.views[node.viewId].childIds = draft.views[node.viewId].childIds.filter((c) => c !== id);
    node.parentId = newParentId;
    node.bounds = { ...bounds };
    if (newParentId === node.viewId) draft.views[node.viewId].childIds.push(id);
    else draft.nodes[newParentId].childIds.push(id);
  });
}

/** Delete diagram nodes/connections from the view only (concepts stay in the model). */
export function deleteViewObjects(ids: string[]): void {
  transact('Delete from View', (draft) => {
    for (const id of ids) {
      if (draft.connections[id]) deleteConnectionFromDraft(draft, id);
      else if (draft.nodes[id]) deleteNodeFromDraft(draft, id);
    }
  });
}

export interface NodeStyle {
  fillColor?: string | undefined;
  lineColor?: string | undefined;
  fontColor?: string | undefined;
  font?: string | undefined;
  alpha?: number | undefined;
  lineAlpha?: number | undefined;
  textAlignment?: number | undefined;
  textPosition?: number | undefined;
  figureType?: number | undefined;
}

export function setNodeStyle(ids: string[], style: NodeStyle): void {
  transact('Change Style', (draft) => {
    for (const id of ids) {
      const node = draft.nodes[id];
      if (node) {
        Object.assign(node, style);
        continue;
      }
      const conn = draft.connections[id];
      if (conn) {
        if (style.lineColor !== undefined) conn.lineColor = style.lineColor;
        if (style.fontColor !== undefined) conn.fontColor = style.fontColor;
        if (style.font !== undefined) conn.font = style.font;
      }
    }
  });
}

export function setConnectionBendpoints(id: string, bendpoints: DiagramConnection['bendpoints']): void {
  transact('Edit Bendpoints', (draft) => {
    const conn = draft.connections[id];
    if (conn) conn.bendpoints = bendpoints;
  });
}
