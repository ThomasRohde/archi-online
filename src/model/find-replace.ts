import { isLegendNote } from './legend';
import { elementLabel, relationshipLabel } from './metamodel';
import { getActiveModelStore, type ModelStore } from './store';
import { compileTextMatcher } from './text-matcher';
import type {
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Folder,
  ModelState,
  Property,
} from './types';
import {
  getModelSession,
  getModelSessionForStore,
  type ModelSessionId,
} from './workspace';

export type FindReplaceScope = 'model' | 'active-view';

export interface FindReplaceOptions {
  find: string;
  replace: string;
  scope: FindReplaceScope;
  searchName: boolean;
  searchDocumentation: boolean;
  searchPropertyValues: boolean;
  matchCase: boolean;
  useRegex: boolean;
}

export type FindReplaceOwnerKind =
  | 'model'
  | 'folder'
  | 'element'
  | 'relationship'
  | 'view'
  | 'group'
  | 'note'
  | 'plain-connection';

export type FindReplaceNavigation =
  | { kind: 'tree'; objectId: string }
  | { kind: 'view'; viewId: string; objectId: string };

type FindReplaceFieldKind = 'name' | 'documentation' | 'content' | 'property';

export interface FindReplaceRow {
  id: string;
  ownerId: string;
  ownerKind: FindReplaceOwnerKind;
  ownerType: string;
  location: string;
  field: string;
  before: string;
  after: string;
  count: number;
  navigation: FindReplaceNavigation;
  /** Internal stable mutation coordinates retained for preview-safe apply. */
  fieldKind: FindReplaceFieldKind;
  propertyIndex?: number;
}

export interface FindReplaceSessionCapture {
  readonly store: ModelStore;
  readonly sessionId: ModelSessionId | null;
}

export interface FindReplacePreview {
  readonly valid: boolean;
  readonly error: string | null;
  readonly rows: readonly FindReplaceRow[];
  readonly options: Readonly<FindReplaceOptions>;
}

interface FindReplacePreviewSource {
  readonly capture: FindReplaceSessionCapture;
  readonly sourceModel: ModelState | null;
  readonly sourceModelEpoch: number;
  readonly sourceActiveViewId: string | null;
}

const previewSources = new WeakMap<FindReplacePreview, FindReplacePreviewSource>();

interface SearchOwner {
  id: string;
  kind: FindReplaceOwnerKind;
  type: string;
  location: string;
  navigation: FindReplaceNavigation;
  name?: string;
  documentation?: string;
  content?: string;
  properties: readonly Property[];
}

export function captureFindReplaceSession(
  store: ModelStore = getActiveModelStore(),
): FindReplaceSessionCapture {
  const session = getModelSessionForStore(store) ?? null;
  return Object.freeze({
    store,
    sessionId: session?.id ?? null,
  });
}

/** Build a stable, non-mutating replacement preview for one captured model session. */
export function previewFindReplace(
  capture: FindReplaceSessionCapture,
  options: FindReplaceOptions,
): FindReplacePreview {
  const state = capture.store.getState();
  const model = state.model;
  const source = Object.freeze({
    capture: Object.freeze({
      store: capture.store,
      sessionId: capture.sessionId,
    }),
    sourceModel: model,
    sourceModelEpoch: state.modelEpoch,
    sourceActiveViewId: state.activeViewId,
  });
  const result = (
    valid: boolean,
    error: string | null,
    rows: FindReplaceRow[],
  ): FindReplacePreview => {
    const immutableRows = Object.freeze(rows.map((row) => Object.freeze({
      ...row,
      navigation: Object.freeze({ ...row.navigation }),
    })));
    const preview = Object.freeze({
      valid,
      error,
      rows: immutableRows,
      options: Object.freeze({ ...options }),
    });
    previewSources.set(preview, source);
    return preview;
  };
  if (!model) return result(false, 'No model is open.', []);
  if (options.scope !== 'model' && options.scope !== 'active-view') {
    return result(false, 'Invalid find and replace scope.', []);
  }

  const matcher = compileTextMatcher({
    find: options.find,
    matchCase: options.matchCase,
    useRegex: options.useRegex,
  });
  if (!matcher.valid) {
    return result(false, matcher.error, []);
  }
  if (options.scope === 'active-view' && !activeView(model, state.activeViewId)) {
    return result(false, 'No active view.', []);
  }

  const owners = options.scope === 'model'
    ? collectModelOwners(model)
    : collectActiveViewOwners(model, state.activeViewId!);
  const rows: FindReplaceRow[] = [];
  for (const owner of owners) {
    if (options.searchName && owner.name !== undefined) {
      addRow(rows, owner, 'name', 'Name', owner.name, options.replace, matcher.replace);
    }
    if (options.searchName && owner.content !== undefined) {
      addRow(rows, owner, 'content', 'Text', owner.content, options.replace, matcher.replace);
    }
    if (options.searchDocumentation && owner.documentation !== undefined) {
      addRow(
        rows,
        owner,
        'documentation',
        'Documentation',
        owner.documentation,
        options.replace,
        matcher.replace,
      );
    }
    if (options.searchPropertyValues) {
      owner.properties.forEach((property, index) => {
        addRow(
          rows,
          owner,
          'property',
          `Property: ${property.key}`,
          property.value,
          options.replace,
          matcher.replace,
          index,
        );
      });
    }
  }
  return result(true, null, rows);
}

function previewSource(preview: FindReplacePreview): FindReplacePreviewSource | undefined {
  return previewSources.get(preview);
}

/** Validate a preview and resolve selected rows before an operation mutates the model. */
export function prepareFindReplaceApply(
  preview: FindReplacePreview | undefined,
  selectedRowIds?: readonly string[],
  expectedStore?: ModelStore,
): { store: ModelStore; rows: readonly FindReplaceRow[] } {
  if (!preview) throw new Error('Preview is required.');
  const source = previewSource(preview);
  if (!preview.valid || !source?.sourceModel) throw new Error('Preview is invalid. Preview again.');

  const { capture, sourceModel, sourceModelEpoch, sourceActiveViewId } = source;
  const { store, sessionId } = capture;
  if (expectedStore && expectedStore !== store) {
    throw new Error('Preview belongs to a different model session.');
  }
  const state = store.getState();
  const sessionIsCurrent = sessionId === null
    || getModelSession(sessionId)?.store === store;
  if (
    !sessionIsCurrent
    || state.model !== sourceModel
    || state.modelEpoch !== sourceModelEpoch
    || state.activeViewId !== sourceActiveViewId
  ) {
    throw new Error('Preview is stale. Preview again.');
  }
  if (state.readOnly) throw new Error('Model is read-only.');

  const rows = selectedRowIds === undefined
    ? preview.rows
    : selectedRows(preview.rows, selectedRowIds);
  for (const row of rows) {
    if (readRowValue(state.model, row) !== row.before) {
      throw new Error('Preview is stale. Preview again.');
    }
  }
  return { store, rows };
}

/** Resolve one row for read-only navigation without exposing preview source identity. */
export function prepareFindReplaceNavigation(
  preview: FindReplacePreview,
  rowId: string,
): Readonly<{
  store: ModelStore;
  sessionId: ModelSessionId | null;
  row: FindReplaceRow;
}> | undefined {
  const source = previewSource(preview);
  if (!preview.valid || !source?.sourceModel) return undefined;
  const row = preview.rows.find((candidate) => candidate.id === rowId);
  if (!row) return undefined;
  const { capture, sourceModel, sourceModelEpoch, sourceActiveViewId } = source;
  const { store, sessionId } = capture;
  if (sessionId !== null && getModelSession(sessionId)?.store !== store) return undefined;
  const state = store.getState();
  if (
    state.model !== sourceModel
    || state.modelEpoch !== sourceModelEpoch
    || state.activeViewId !== sourceActiveViewId
  ) return undefined;
  return Object.freeze({ store, sessionId, row });
}

/** Apply already validated rows to an Immer draft. Called only by the operation layer. */
export function applyFindReplaceRows(model: ModelState, rows: readonly FindReplaceRow[]): number {
  let applied = 0;
  for (const row of rows) {
    if (row.after === row.before) continue;
    writeRowValue(model, row, row.after);
    applied++;
  }
  return applied;
}

function activeView(model: ModelState, activeViewId: string | null): DiagramView | undefined {
  return activeViewId ? model.views[activeViewId] : undefined;
}

function addRow(
  rows: FindReplaceRow[],
  owner: SearchOwner,
  fieldKind: FindReplaceFieldKind,
  field: string,
  before: string,
  replacement: string,
  replace: (value: string, replacement: string) => { value: string; count: number },
  propertyIndex?: number,
): void {
  const result = replace(before, replacement);
  if (result.count === 0) return;
  rows.push({
    id: rowId(owner, fieldKind, propertyIndex),
    ownerId: owner.id,
    ownerKind: owner.kind,
    ownerType: owner.type,
    location: owner.location,
    field,
    before,
    after: result.value,
    count: result.count,
    navigation: owner.navigation,
    fieldKind,
    ...(propertyIndex === undefined ? {} : { propertyIndex }),
  });
}

function rowId(
  owner: Pick<SearchOwner, 'kind' | 'id'>,
  fieldKind: FindReplaceFieldKind,
  propertyIndex?: number,
): string {
  return [owner.kind, encodeURIComponent(owner.id), fieldKind, propertyIndex ?? ''].join(':');
}

function selectedRows(rows: readonly FindReplaceRow[], selectedIds: readonly string[]): FindReplaceRow[] {
  const known = new Map(rows.map((row) => [row.id, row]));
  const selected = new Set(selectedIds);
  for (const id of selected) {
    if (!known.has(id)) throw new Error(`Unknown preview row: ${id}`);
  }
  return rows.filter((row) => selected.has(row.id));
}

function collectModelOwners(model: ModelState): SearchOwner[] {
  const owners: SearchOwner[] = [];
  const seen = new Set<string>();
  const add = (owner: SearchOwner) => {
    const key = `${owner.kind}\u0000${owner.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    owners.push(owner);
  };

  add(modelOwner(model));
  const visitFolder = (folderId: string) => {
    const folder = model.folders[folderId];
    if (!folder) return;
    add(folderOwner(model, folder));
    folder.folderIds.forEach(visitFolder);
    for (const itemId of folder.itemIds) addTreeOwner(model, itemId, add);
  };
  model.rootFolderIds.forEach(visitFolder);
  Object.values(model.folders).forEach((folder) => add(folderOwner(model, folder)));
  Object.keys(model.elements).forEach((id) => addTreeOwner(model, id, add));
  Object.keys(model.relationships).forEach((id) => addTreeOwner(model, id, add));
  Object.keys(model.views).forEach((id) => addTreeOwner(model, id, add));

  const views = Object.values(model.views);
  const viewIds = new Set(views.map((view) => view.id));
  const connectionsByView = new Map<string, DiagramConnection[]>();
  const orphanPlainConnections: DiagramConnection[] = [];
  for (const connection of Object.values(model.connections)) {
    if (!viewIds.has(connection.viewId)) {
      if (connection.connType === 'plain') orphanPlainConnections.push(connection);
      continue;
    }
    const connections = connectionsByView.get(connection.viewId) ?? [];
    connections.push(connection);
    connectionsByView.set(connection.viewId, connections);
  }
  const visitedNodes = new Set<string>();
  for (const view of views) {
    collectVisualOwners(model, view, add, {
      includeSemantic: false,
      includeReferencedViews: false,
      connections: connectionsByView.get(view.id) ?? [],
      visitedNodes,
    });
  }
  for (const node of Object.values(model.nodes)) {
    if (visitedNodes.has(node.id)) continue;
    if (node.nodeType === 'group' || node.nodeType === 'note') add(annotationOwner(model, node));
  }
  for (const connection of orphanPlainConnections) {
    add(plainConnectionOwner(model, connection));
  }
  return owners;
}

function collectActiveViewOwners(model: ModelState, viewId: string): SearchOwner[] {
  const owners: SearchOwner[] = [];
  const seen = new Set<string>();
  const add = (owner: SearchOwner) => {
    const key = `${owner.kind}\u0000${owner.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    owners.push(owner);
  };
  const view = model.views[viewId];
  add(viewOwner(model, view));
  collectVisualOwners(model, view, add, {
    includeSemantic: true,
    includeReferencedViews: true,
    connections: Object.values(model.connections)
      .filter((connection) => connection.viewId === view.id),
    visitedNodes: new Set(),
  });
  return owners;
}

function collectVisualOwners(
  model: ModelState,
  view: DiagramView,
  add: (owner: SearchOwner) => void,
  options: {
    includeSemantic: boolean;
    includeReferencedViews: boolean;
    connections: readonly DiagramConnection[];
    visitedNodes: Set<string>;
  },
): void {
  const visitNode = (nodeId: string) => {
    if (options.visitedNodes.has(nodeId)) return;
    const node = model.nodes[nodeId];
    if (!node || node.viewId !== view.id) return;
    options.visitedNodes.add(nodeId);
    if (node.nodeType === 'group' || node.nodeType === 'note') {
      add(annotationOwner(model, node));
    } else if (options.includeSemantic && node.nodeType === 'element') {
      const element = model.elements[node.elementId];
      if (element) add(elementOwner(model, element.id, {
        kind: 'view',
        viewId: view.id,
        objectId: node.id,
      }));
    } else if (options.includeReferencedViews && node.nodeType === 'ref') {
      const referenced = model.views[node.refViewId];
      if (referenced) add(viewOwner(model, referenced, {
        kind: 'view',
        viewId: view.id,
        objectId: node.id,
      }));
    }
    node.childIds.forEach(visitNode);
  };
  view.childIds.forEach(visitNode);

  for (const connection of options.connections) {
    if (connection.connType === 'plain') {
      add(plainConnectionOwner(model, connection));
    } else if (options.includeSemantic && connection.relationshipId) {
      const relationship = model.relationships[connection.relationshipId];
      if (relationship) add(relationshipOwner(model, relationship.id, {
        kind: 'view',
        viewId: view.id,
        objectId: connection.id,
      }));
    }
  }
}

function addTreeOwner(
  model: ModelState,
  id: string,
  add: (owner: SearchOwner) => void,
): void {
  if (model.elements[id]) add(elementOwner(model, id));
  else if (model.relationships[id]) add(relationshipOwner(model, id));
  else if (model.views[id]) add(viewOwner(model, model.views[id]));
}

function modelOwner(model: ModelState): SearchOwner {
  return {
    id: model.info.id,
    kind: 'model',
    type: 'Model',
    location: 'Model',
    navigation: { kind: 'tree', objectId: model.info.id },
    name: model.info.name,
    documentation: model.info.documentation,
    properties: model.info.properties,
  };
}

function folderOwner(model: ModelState, folder: Folder): SearchOwner {
  return {
    id: folder.id,
    kind: 'folder',
    type: 'Folder',
    location: folderPath(model, folder.id),
    navigation: { kind: 'tree', objectId: folder.id },
    name: folder.name,
    documentation: folder.documentation,
    properties: folder.properties,
  };
}

function elementOwner(
  model: ModelState,
  id: string,
  navigation: FindReplaceNavigation = { kind: 'tree', objectId: id },
): SearchOwner {
  const element = model.elements[id];
  return {
    id,
    kind: 'element',
    type: elementLabel(element.type),
    location: folderPath(model, element.folderId),
    navigation,
    name: element.name,
    documentation: element.documentation,
    properties: element.properties,
  };
}

function relationshipOwner(
  model: ModelState,
  id: string,
  navigation: FindReplaceNavigation = { kind: 'tree', objectId: id },
): SearchOwner {
  const relationship = model.relationships[id];
  return {
    id,
    kind: 'relationship',
    type: relationshipLabel(relationship.type),
    location: folderPath(model, relationship.folderId),
    navigation,
    name: relationship.name,
    documentation: relationship.documentation,
    properties: relationship.properties,
  };
}

function viewOwner(
  model: ModelState,
  view: DiagramView,
  navigation: FindReplaceNavigation = { kind: 'tree', objectId: view.id },
): SearchOwner {
  return {
    id: view.id,
    kind: 'view',
    type: 'View',
    location: folderPath(model, view.folderId),
    navigation,
    name: view.name,
    documentation: view.documentation,
    properties: view.properties,
  };
}

function annotationOwner(
  model: ModelState,
  node: Extract<DiagramNode, { nodeType: 'group' | 'note' }>,
): SearchOwner {
  const view = model.views[node.viewId];
  const location = `View: ${view?.name || node.viewId}`;
  if (node.nodeType === 'group') {
    return {
      id: node.id,
      kind: 'group',
      type: 'Group',
      location,
      navigation: { kind: 'view', viewId: node.viewId, objectId: node.id },
      name: node.name,
      documentation: node.documentation,
      properties: node.properties,
    };
  }
  return {
    id: node.id,
    kind: 'note',
    type: isLegendNote(node) ? 'Legend' : 'Note',
    location,
    navigation: { kind: 'view', viewId: node.viewId, objectId: node.id },
    content: node.content,
    properties: node.properties,
  };
}

function plainConnectionOwner(model: ModelState, connection: DiagramConnection): SearchOwner {
  const view = model.views[connection.viewId];
  return {
    id: connection.id,
    kind: 'plain-connection',
    type: 'Plain Connection',
    location: `View: ${view?.name || connection.viewId}`,
    navigation: { kind: 'view', viewId: connection.viewId, objectId: connection.id },
    name: connection.name,
    documentation: connection.documentation,
    properties: connection.properties,
  };
}

function folderPath(model: ModelState, folderId: string): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let current: string | null = folderId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const folder: Folder | undefined = model.folders[current];
    if (!folder) break;
    names.unshift(folder.name || '(unnamed folder)');
    current = folder.parentId;
  }
  return names.length > 0 ? names.join(' / ') : 'Model';
}

function readRowValue(model: ModelState, row: FindReplaceRow): string | undefined {
  const owner = mutableOwner(model, row);
  if (!owner) return undefined;
  if (row.fieldKind === 'property') return owner.properties[row.propertyIndex!]?.value;
  return owner[row.fieldKind];
}

function writeRowValue(model: ModelState, row: FindReplaceRow, value: string): void {
  const owner = mutableOwner(model, row);
  if (!owner) throw new Error('Preview is stale. Preview again.');
  if (row.fieldKind === 'property') owner.properties[row.propertyIndex!].value = value;
  else owner[row.fieldKind] = value;
}

type MutableOwner = {
  name?: string;
  documentation?: string;
  content?: string;
  properties: Property[];
};

function mutableOwner(model: ModelState, row: FindReplaceRow): MutableOwner | undefined {
  if (row.ownerKind === 'model') return model.info;
  if (row.ownerKind === 'folder') return model.folders[row.ownerId];
  if (row.ownerKind === 'element') return model.elements[row.ownerId];
  if (row.ownerKind === 'relationship') return model.relationships[row.ownerId];
  if (row.ownerKind === 'view') return model.views[row.ownerId];
  if (row.ownerKind === 'group' || row.ownerKind === 'note') {
    const node = model.nodes[row.ownerId];
    return node?.nodeType === 'group' || node?.nodeType === 'note' ? node : undefined;
  }
  const connection = model.connections[row.ownerId];
  return connection?.connType === 'plain' ? connection : undefined;
}
