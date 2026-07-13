import { isLegendNote } from './legend';
import { createConnectionOrderIndex, orderedViewConnectionIds } from './connection-order';
import { elementLabel, relationshipLabel } from './metamodel';
import { getActiveModelStore, type ModelStore } from './store';
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
  workspaceStore,
  type ModelSessionId,
} from './workspace';

export type PropertyOwnerKind =
  | 'model'
  | 'folder'
  | 'element'
  | 'relationship'
  | 'view'
  | 'group'
  | 'note'
  | 'plain-connection';

export type PropertyNavigation =
  | { kind: 'tree'; objectId: string }
  | { kind: 'view'; viewId: string; objectId: string };

export interface PropertyOccurrence {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerKind: PropertyOwnerKind;
  readonly ownerType: string;
  readonly location: string;
  readonly propertyIndex: number;
  readonly key: string;
  readonly value: string;
  readonly navigation: Readonly<PropertyNavigation>;
}

export interface PropertyKeyUsage {
  readonly key: string;
  readonly displayKey: string;
  readonly occurrenceCount: number;
  readonly ownerCount: number;
  readonly occurrences: readonly PropertyOccurrence[];
}

export interface PropertyManagerSessionCapture {
  readonly store: ModelStore;
  readonly sessionId: ModelSessionId | null;
}

export type PropertyMutationOperation = 'rename' | 'delete';

export interface PropertyMutationPreview {
  readonly valid: boolean;
  readonly error: string | null;
  readonly warning: string | null;
  readonly operation: PropertyMutationOperation;
  readonly key: string;
  readonly newKey: string | null;
  readonly collision: boolean;
  readonly collisionAcknowledged: boolean;
  readonly occurrences: readonly PropertyOccurrence[];
}

interface CaptureSource {
  readonly sourceModel: ModelState | null;
  readonly sourceModelEpoch: number;
  readonly activationOrder: readonly ModelSessionId[] | null;
}

interface PreviewSource {
  readonly capture: PropertyManagerSessionCapture;
  readonly sourceModel: ModelState | null;
  readonly sourceModelEpoch: number;
  readonly activationOrder: readonly ModelSessionId[] | null;
}

interface PropertyOwner {
  readonly id: string;
  readonly kind: PropertyOwnerKind;
  readonly type: string;
  readonly location: string;
  readonly properties: readonly Property[];
  readonly navigation: PropertyNavigation;
}

interface PropertyLedgerSnapshot {
  readonly occurrences: readonly PropertyOccurrence[];
  readonly usage: readonly PropertyKeyUsage[];
  readonly occurrenceById: ReadonlyMap<string, PropertyOccurrence>;
}

const captureSources = new WeakMap<PropertyManagerSessionCapture, CaptureSource>();
const captureLedgers = new WeakMap<PropertyManagerSessionCapture, PropertyLedgerSnapshot>();
const previewSources = new WeakMap<PropertyMutationPreview, PreviewSource>();

/** Capture the exact model store and activation generation used by one manager session. */
export function capturePropertyManagerSession(
  store: ModelStore = getActiveModelStore(),
): PropertyManagerSessionCapture {
  const session = getModelSessionForStore(store) ?? null;
  const state = store.getState();
  const capture = Object.freeze({
    store,
    sessionId: session?.id ?? null,
  });
  captureSources.set(capture, Object.freeze({
    sourceModel: state.model,
    sourceModelEpoch: state.modelEpoch,
    activationOrder: session ? workspaceStore.getState().activationOrder : null,
  }));
  return capture;
}

/** Desktop-style presentation label without changing exact key identity. */
export function displayPropertyKey(key: string): string {
  if (key === '') return '(blank)';
  if (key === '(blank)' || /^\s+$/u.test(key)) return JSON.stringify(key);
  return key;
}

/** Inspect all property keys and ordered occurrences without mutating the captured model. */
export function inspectPropertyUsage(
  capture: PropertyManagerSessionCapture,
  search = '',
): readonly PropertyKeyUsage[] {
  const source = requireCurrentCapture(capture);
  if (!source.sourceModel) return Object.freeze([]);
  const usage = propertyLedger(capture, source).usage;
  const query = search.toLocaleLowerCase();
  if (!query) return usage;
  return Object.freeze(
    usage.filter((entry) => entry.displayKey.toLocaleLowerCase().includes(query)),
  );
}

/** Create the mandatory immutable preview for an exact property-key rename. */
export function previewPropertyRename(
  capture: PropertyManagerSessionCapture,
  key: string,
  newKey: string,
  collisionAcknowledged = false,
): PropertyMutationPreview {
  const source = requireCurrentCapture(capture);
  if (newKey === '') {
    return createPreview(source, capture, {
      valid: false,
      error: 'New property key is required.',
      warning: null,
      operation: 'rename',
      key,
      newKey,
      collision: false,
      collisionAcknowledged,
      occurrences: [],
    });
  }
  if (newKey === key) {
    return createPreview(source, capture, {
      valid: false,
      error: 'New property key must differ from the current key.',
      warning: null,
      operation: 'rename',
      key,
      newKey,
      collision: false,
      collisionAcknowledged,
      occurrences: [],
    });
  }
  const all = source.sourceModel ? propertyLedger(capture, source).occurrences : [];
  const occurrences = all.filter((entry) => entry.key === key);
  if (occurrences.length === 0) {
    return createPreview(source, capture, {
      valid: false,
      error: 'Property key was not found.',
      warning: null,
      operation: 'rename',
      key,
      newKey,
      collision: false,
      collisionAcknowledged,
      occurrences,
    });
  }
  const collision = all.some((entry) => entry.key === newKey);
  return createPreview(source, capture, {
    valid: true,
    error: null,
    warning: collision
      ? `Property key "${displayPropertyKey(newKey)}" already exists. Acknowledge that duplicate rows will remain separate.`
      : null,
    operation: 'rename',
    key,
    newKey,
    collision,
    collisionAcknowledged,
    occurrences,
  });
}

/** Create the mandatory immutable preview for deleting one exact property key. */
export function previewPropertyDelete(
  capture: PropertyManagerSessionCapture,
  key: string,
): PropertyMutationPreview {
  const source = requireCurrentCapture(capture);
  const occurrences = source.sourceModel
    ? propertyLedger(capture, source).occurrences.filter((entry) => entry.key === key)
    : [];
  return createPreview(source, capture, {
    valid: occurrences.length > 0,
    error: occurrences.length > 0 ? null : 'Property key was not found.',
    warning: null,
    operation: 'delete',
    key,
    newKey: null,
    collision: false,
    collisionAcknowledged: false,
    occurrences,
  });
}

/** Resolve an occurrence against the current captured model for session-safe UI navigation. */
export function preparePropertyNavigation(
  capture: PropertyManagerSessionCapture,
  occurrenceId: string,
): Readonly<{
  store: ModelStore;
  sessionId: ModelSessionId | null;
  occurrence: PropertyOccurrence;
}> | undefined {
  let source: CaptureSource;
  try {
    source = requireCurrentCapture(capture);
  } catch {
    return undefined;
  }
  if (!source.sourceModel) return undefined;
  const occurrence = propertyLedger(capture, source).occurrenceById.get(occurrenceId);
  if (!occurrence) return undefined;
  const property = propertyAt(source.sourceModel, occurrence);
  if (!property || property.key !== occurrence.key || property.value !== occurrence.value) {
    return undefined;
  }
  return Object.freeze({
    store: capture.store,
    sessionId: capture.sessionId,
    occurrence,
  });
}

/** Validate an opaque preview and every coordinate before an operation starts a transaction. */
export function preparePropertyMutation(
  preview: PropertyMutationPreview | undefined,
  operation: PropertyMutationOperation,
  expectedStore?: ModelStore,
): Readonly<{
  store: ModelStore;
  preview: PropertyMutationPreview;
}> {
  if (!preview) throw new Error('Preview is required.');
  const source = previewSources.get(preview);
  if (!source || !preview.valid || source.sourceModel === null) {
    throw new Error('Preview is invalid. Preview again.');
  }
  if (preview.operation !== operation) throw new Error('Preview operation does not match.');
  if (expectedStore && expectedStore !== source.capture.store) {
    throw new Error('Preview belongs to a different model session.');
  }
  const captureSource = captureSources.get(source.capture);
  if (!captureSource || !captureIsCurrent(source.capture, captureSource)) {
    throw new Error('Preview is stale. Preview again.');
  }
  const state = source.capture.store.getState();
  if (
    state.model !== source.sourceModel
    || state.modelEpoch !== source.sourceModelEpoch
    || captureSource.sourceModel !== source.sourceModel
    || captureSource.sourceModelEpoch !== source.sourceModelEpoch
    || captureSource.activationOrder !== source.activationOrder
  ) {
    throw new Error('Preview is stale. Preview again.');
  }
  if (state.readOnly) throw new Error('Model is read-only.');
  if (preview.collision && !preview.collisionAcknowledged) {
    throw new Error('Collision acknowledgement is required.');
  }
  if (preview.occurrences.length === 0) throw new Error('Preview is invalid. Preview again.');

  // Validate the full set before Immer is entered so one bad coordinate cannot partially apply.
  for (const occurrence of preview.occurrences) {
    const property = propertyAt(state.model, occurrence);
    if (!property || property.key !== preview.key || property.value !== occurrence.value) {
      throw new Error('Preview is stale. Preview again.');
    }
  }
  const currentOccurrences = collectPropertyOccurrences(state.model);
  const currentMatches = currentOccurrences.filter((entry) => entry.key === preview.key);
  if (
    currentMatches.length !== preview.occurrences.length
    || currentMatches.some((entry, index) => entry.id !== preview.occurrences[index]?.id)
  ) {
    throw new Error('Preview is stale. Preview again.');
  }
  if (preview.operation === 'rename') {
    const currentCollision = currentOccurrences.some((entry) => entry.key === preview.newKey);
    if (currentCollision !== preview.collision) {
      throw new Error('Preview is stale. Preview again.');
    }
  }
  return Object.freeze({ store: source.capture.store, preview });
}

/** Apply a prevalidated preview to an Immer draft. Called only by the operation layer. */
export function applyPropertyMutationPreview(
  model: ModelState,
  preview: PropertyMutationPreview,
): number {
  if (preview.operation === 'rename') {
    for (const occurrence of preview.occurrences) {
      propertyAt(model, occurrence)!.key = preview.newKey!;
    }
    return preview.occurrences.length;
  }

  const removals = new Map<string, Set<number>>();
  for (const occurrence of preview.occurrences) {
    const ownerKey = `${occurrence.ownerKind}\u0000${occurrence.ownerId}`;
    const indexes = removals.get(ownerKey) ?? new Set<number>();
    indexes.add(occurrence.propertyIndex);
    removals.set(ownerKey, indexes);
  }
  for (const occurrence of preview.occurrences) {
    const ownerKey = `${occurrence.ownerKind}\u0000${occurrence.ownerId}`;
    const indexes = removals.get(ownerKey);
    if (!indexes) continue;
    const owner = mutableOwner(model, occurrence.ownerKind, occurrence.ownerId)!;
    owner.properties = owner.properties.filter((_property, index) => !indexes.has(index));
    removals.delete(ownerKey);
  }
  return preview.occurrences.length;
}

function createPreview(
  source: CaptureSource,
  capture: PropertyManagerSessionCapture,
  input: Omit<PropertyMutationPreview, 'occurrences'> & {
    occurrences: readonly PropertyOccurrence[];
  },
): PropertyMutationPreview {
  const preview = Object.freeze({
    ...input,
    occurrences: Object.freeze([...input.occurrences]),
  });
  previewSources.set(preview, Object.freeze({
    capture,
    sourceModel: source.sourceModel,
    sourceModelEpoch: source.sourceModelEpoch,
    activationOrder: source.activationOrder,
  }));
  return preview;
}

function requireCurrentCapture(capture: PropertyManagerSessionCapture): CaptureSource {
  const source = captureSources.get(capture);
  if (!source) throw new Error('Property manager session is invalid.');
  if (!captureIsCurrent(capture, source)) {
    throw new Error('Property manager session is stale. Open it again.');
  }
  return source;
}

function propertyLedger(
  capture: PropertyManagerSessionCapture,
  source: CaptureSource,
): PropertyLedgerSnapshot {
  const existing = captureLedgers.get(capture);
  if (existing) return existing;
  const occurrences = source.sourceModel
    ? collectPropertyOccurrences(source.sourceModel)
    : Object.freeze([]);
  const byKey = new Map<string, PropertyOccurrence[]>();
  const occurrenceById = new Map<string, PropertyOccurrence>();
  for (const occurrence of occurrences) {
    occurrenceById.set(occurrence.id, occurrence);
    const keyOccurrences = byKey.get(occurrence.key);
    if (keyOccurrences) keyOccurrences.push(occurrence);
    else byKey.set(occurrence.key, [occurrence]);
  }
  const usage: PropertyKeyUsage[] = [];
  for (const [key, keyOccurrences] of byKey) {
    const owners = new Set(
      keyOccurrences.map((entry) => `${entry.ownerKind}\u0000${entry.ownerId}`),
    );
    usage.push(Object.freeze({
      key,
      displayKey: displayPropertyKey(key),
      occurrenceCount: keyOccurrences.length,
      ownerCount: owners.size,
      occurrences: Object.freeze([...keyOccurrences]),
    }));
  }
  const ledger = Object.freeze({
    occurrences,
    usage: Object.freeze(usage),
    occurrenceById,
  });
  captureLedgers.set(capture, ledger);
  return ledger;
}

function captureIsCurrent(
  capture: PropertyManagerSessionCapture,
  source: CaptureSource,
): boolean {
  const state = capture.store.getState();
  if (capture.sessionId === null) {
    return state.model === source.sourceModel && state.modelEpoch === source.sourceModelEpoch;
  }
  const workspace = workspaceStore.getState();
  return getModelSession(capture.sessionId)?.store === capture.store
    && workspace.activeSessionId === capture.sessionId
    && workspace.activationOrder === source.activationOrder
    && state.model === source.sourceModel
    && state.modelEpoch === source.sourceModelEpoch;
}

function collectPropertyOccurrences(model: ModelState): readonly PropertyOccurrence[] {
  const owners: PropertyOwner[] = [];
  const seenOwners = new Set<string>();
  const orderedViews: DiagramView[] = [];
  const seenViews = new Set<string>();
  const add = (owner: PropertyOwner) => {
    const key = `${owner.kind}\u0000${owner.id}`;
    if (seenOwners.has(key)) return;
    seenOwners.add(key);
    owners.push(owner);
    if (owner.kind === 'view' && !seenViews.has(owner.id)) {
      const view = model.views[owner.id];
      if (view) {
        seenViews.add(owner.id);
        orderedViews.push(view);
      }
    }
  };

  add(modelOwner(model));
  const visitedFolders = new Set<string>();
  const visitFolder = (folderId: string) => {
    if (visitedFolders.has(folderId)) return;
    const folder = model.folders[folderId];
    if (!folder) return;
    visitedFolders.add(folderId);
    add(folderOwner(model, folder));
    folder.folderIds.forEach(visitFolder);
    folder.itemIds.forEach((id) => addTreeOwner(model, id, add));
  };
  model.rootFolderIds.forEach(visitFolder);

  // Preserve record insertion order for malformed/orphaned objects after normalized tree order.
  Object.values(model.folders).forEach((folder) => visitFolder(folder.id));
  Object.keys(model.elements).forEach((id) => addTreeOwner(model, id, add));
  Object.keys(model.relationships).forEach((id) => addTreeOwner(model, id, add));
  Object.keys(model.views).forEach((id) => addTreeOwner(model, id, add));

  const connectionOrderIndex = createConnectionOrderIndex(model);
  const visitedPlainConnections = new Set<string>();
  const visitedNodes = new Set<string>();
  for (const view of orderedViews) {
    const visitNode = (nodeId: string) => {
      if (visitedNodes.has(nodeId)) return;
      const node = model.nodes[nodeId];
      if (!node || node.viewId !== view.id) return;
      visitedNodes.add(nodeId);
      if (node.nodeType === 'group' || node.nodeType === 'note') {
        add(annotationOwner(model, node));
      }
      node.childIds.forEach(visitNode);
    };
    view.childIds.forEach(visitNode);
    for (const connectionId of orderedViewConnectionIds(model, view.id, connectionOrderIndex)) {
      const connection = model.connections[connectionId];
      if (connection?.connType !== 'plain') continue;
      visitedPlainConnections.add(connection.id);
      add(plainConnectionOwner(model, connection));
    }
  }
  Object.values(model.nodes).forEach((node) => {
    if (!visitedNodes.has(node.id) && (node.nodeType === 'group' || node.nodeType === 'note')) {
      add(annotationOwner(model, node));
    }
  });
  Object.values(model.connections).forEach((connection) => {
    if (connection.connType === 'plain' && !visitedPlainConnections.has(connection.id)) {
      add(plainConnectionOwner(model, connection));
    }
  });

  const occurrences: PropertyOccurrence[] = [];
  for (const owner of owners) {
    owner.properties.forEach((property, propertyIndex) => {
      occurrences.push(Object.freeze({
        id: occurrenceId(owner.kind, owner.id, propertyIndex),
        ownerId: owner.id,
        ownerKind: owner.kind,
        ownerType: owner.type,
        location: owner.location,
        propertyIndex,
        key: property.key,
        value: property.value,
        navigation: Object.freeze({ ...owner.navigation }),
      }));
    });
  }
  return Object.freeze(occurrences);
}

function occurrenceId(kind: PropertyOwnerKind, ownerId: string, propertyIndex: number): string {
  return `${kind}:${encodeURIComponent(ownerId)}:${propertyIndex}`;
}

function addTreeOwner(
  model: ModelState,
  id: string,
  add: (owner: PropertyOwner) => void,
): void {
  if (model.elements[id]) add(elementOwner(model, id));
  else if (model.relationships[id]) add(relationshipOwner(model, id));
  else if (model.views[id]) add(viewOwner(model, model.views[id]));
}

function modelOwner(model: ModelState): PropertyOwner {
  return {
    id: model.info.id,
    kind: 'model',
    type: 'Model',
    location: 'Model',
    properties: model.info.properties,
    navigation: { kind: 'tree', objectId: model.info.id },
  };
}

function folderOwner(model: ModelState, folder: Folder): PropertyOwner {
  return {
    id: folder.id,
    kind: 'folder',
    type: 'Folder',
    location: folderPath(model, folder.id),
    properties: folder.properties,
    navigation: { kind: 'tree', objectId: folder.id },
  };
}

function elementOwner(model: ModelState, id: string): PropertyOwner {
  const element = model.elements[id];
  return {
    id,
    kind: 'element',
    type: elementLabel(element.type),
    location: treeLocation(model, element.folderId, element.name, 'unnamed element'),
    properties: element.properties,
    navigation: { kind: 'tree', objectId: id },
  };
}

function relationshipOwner(model: ModelState, id: string): PropertyOwner {
  const relationship = model.relationships[id];
  return {
    id,
    kind: 'relationship',
    type: relationshipLabel(relationship.type),
    location: treeLocation(model, relationship.folderId, relationship.name, 'unnamed relationship'),
    properties: relationship.properties,
    navigation: { kind: 'tree', objectId: id },
  };
}

function viewOwner(model: ModelState, view: DiagramView): PropertyOwner {
  return {
    id: view.id,
    kind: 'view',
    type: 'View',
    location: treeLocation(model, view.folderId, view.name, 'unnamed view'),
    properties: view.properties,
    navigation: { kind: 'tree', objectId: view.id },
  };
}

function annotationOwner(
  model: ModelState,
  node: Extract<DiagramNode, { nodeType: 'group' | 'note' }>,
): PropertyOwner {
  const view = model.views[node.viewId];
  const type = node.nodeType === 'group' ? 'Group' : (isLegendNote(node) ? 'Legend' : 'Note');
  const label = node.nodeType === 'group'
    ? node.name || 'unnamed group'
    : (isLegendNote(node) ? 'Legend' : node.content || 'empty note');
  return {
    id: node.id,
    kind: node.nodeType,
    type,
    location: `View: ${view?.name || node.viewId} / ${type}: ${label}`,
    properties: node.properties,
    navigation: { kind: 'view', viewId: node.viewId, objectId: node.id },
  };
}

function plainConnectionOwner(
  model: ModelState,
  connection: DiagramConnection,
): PropertyOwner {
  const view = model.views[connection.viewId];
  return {
    id: connection.id,
    kind: 'plain-connection',
    type: 'Plain Connection',
    location: `View: ${view?.name || connection.viewId} / Plain connection: ${connection.name || connection.id}`,
    properties: connection.properties,
    navigation: { kind: 'view', viewId: connection.viewId, objectId: connection.id },
  };
}

function treeLocation(
  model: ModelState,
  folderId: string,
  name: string,
  fallback: string,
): string {
  return `${folderPath(model, folderId)} / ${name || fallback}`;
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

function propertyAt(model: ModelState, occurrence: PropertyOccurrence): Property | undefined {
  return mutableOwner(model, occurrence.ownerKind, occurrence.ownerId)
    ?.properties[occurrence.propertyIndex];
}

type MutablePropertyOwner = { properties: Property[] };

function mutableOwner(
  model: ModelState,
  kind: PropertyOwnerKind,
  ownerId: string,
): MutablePropertyOwner | undefined {
  if (kind === 'model') return model.info.id === ownerId ? model.info : undefined;
  if (kind === 'folder') return model.folders[ownerId];
  if (kind === 'element') return model.elements[ownerId];
  if (kind === 'relationship') return model.relationships[ownerId];
  if (kind === 'view') return model.views[ownerId];
  if (kind === 'group' || kind === 'note') {
    const node = model.nodes[ownerId];
    return node?.nodeType === kind ? node : undefined;
  }
  const connection = model.connections[ownerId];
  return connection?.connType === 'plain' ? connection : undefined;
}
