import { newId } from '../id';
import {
  ELEMENT_TYPE_MAP,
  elementLabel,
  relationshipLabel,
  type ElementType,
  type Layer,
  type RelationshipType,
} from '../metamodel';
import { isAllowedRelationship } from '../rules';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import type {
  ArchimateElement,
  ArchimateRelationship,
  DiagramView,
  Folder,
  FolderType,
  ModelState,
  Property,
} from '../types';

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
    info: { id: newId(), name, documentation: '', properties: [], metadata: [], version: '5.0.0' },
    profiles: {},
    assets: {},
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

export function addElement(
  type: ElementType,
  name?: string,
  folderId?: string,
  store?: ModelStore,
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
      profileIds: [],
      folderId: fid,
    };
    draft.elements[id] = el;
    draft.folders[fid].itemIds.push(id);
  }, store);
  return id;
}

/** Returns null (no mutation) when the relationship is not allowed. */
export function addRelationship(
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  name = '',
  folderId?: string,
  store: ModelStore = getActiveModelStore(),
): string | null {
  const model = store.getState().model;
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
      profileIds: [],
      folderId: fid,
      sourceId,
      targetId,
    };
    draft.relationships[id] = rel;
    draft.folders[fid].itemIds.push(id);
  }, store);
  return id;
}

export function addView(name = 'Default View', folderId?: string, store?: ModelStore): string {
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
  }, store);
  return id;
}

export function addFolder(parentId: string, name = 'New Folder', store?: ModelStore): string {
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
  }, store);
  return id;
}

export function renameItem(id: string, name: string, store?: ModelStore): void {
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
  }, store);
}

export function setDocumentation(id: string, documentation: string, store?: ModelStore): void {
  transact('Edit Documentation', (draft) => {
    const item =
      draft.elements[id] ?? draft.relationships[id] ?? draft.views[id] ?? draft.folders[id];
    if (item) item.documentation = documentation;
    else if (draft.info.id === id) draft.info.documentation = documentation;
    else {
      const node = draft.nodes[id];
      if (node && node.nodeType === 'group') node.documentation = documentation;
    }
  }, store);
}

export function setProperties(id: string, properties: Property[], store?: ModelStore): void {
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
  }, store);
}

/** Type-specific relationship attributes (access type, influence strength, direction). */
export function setRelationshipAttrs(
  id: string,
  attrs: { accessType?: number; strength?: string; directed?: boolean },
  store?: ModelStore,
): void {
  transact('Change Relationship', (draft) => {
    const rel = draft.relationships[id];
    if (!rel) return;
    if ('accessType' in attrs) rel.accessType = attrs.accessType === 0 ? undefined : attrs.accessType;
    if ('strength' in attrs) rel.strength = attrs.strength === '' ? undefined : attrs.strength;
    if ('directed' in attrs) rel.directed = attrs.directed ? true : undefined;
  }, store);
}

export function setJunctionType(
  id: string,
  junctionType: 'and' | 'or',
  store?: ModelStore,
): void {
  transact('Change Junction', (draft) => {
    const el = draft.elements[id];
    if (el?.type === 'Junction') el.junctionType = junctionType;
  }, store);
}

export function setViewpoint(viewId: string, viewpoint: string, store?: ModelStore): void {
  transact('Change Viewpoint', (draft) => {
    const view = draft.views[viewId];
    if (view) view.viewpoint = viewpoint === '' ? undefined : viewpoint;
  }, store);
}
