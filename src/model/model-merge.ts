import { newId } from './id';
import { folderForElementType, defaultFolderId } from './ops/concepts';
import { rebuildConnectionAdjacency } from './ops/draft';
import { cloneModelForEditing, type ModelStore } from './store';
import { validateModelIntegrity } from './validation';
import type {
  DiagramConnection,
  DiagramNode,
  ModelAsset,
  ModelState,
  ProfileDefinition,
} from './types';

export interface ModelMergeOptions {
  updateExisting: boolean;
  updateModelInfo: boolean;
  updateFolderStructure: boolean;
}

export type ModelMergeStatus = 'created' | 'updated' | 'moved' | 'unchanged' | 'skipped' | 'warning';

export interface ModelMergeDetail {
  status: ModelMergeStatus;
  kind: string;
  sourceId: string;
  targetId?: string;
  label: string;
  message?: string;
}

export interface ModelMergeReport {
  created: number;
  updated: number;
  moved: number;
  unchanged: number;
  skipped: number;
  warnings: number;
  details: readonly ModelMergeDetail[];
}

export interface ModelMergePlan {
  readonly options: Readonly<ModelMergeOptions>;
  readonly targetModel: ModelState;
  readonly sourceModelId: string;
  readonly merged: ModelState;
  readonly report: ModelMergeReport;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function addDetail(
  report: { details: ModelMergeDetail[] } & Omit<ModelMergeReport, 'details'>,
  detail: ModelMergeDetail,
): void {
  report.details.push(detail);
  if (detail.status === 'warning') report.warnings++;
  else report[detail.status]++;
}

function globalObjects(model: ModelState) {
  return [
    { id: model.info.id, kind: 'model', type: 'model', value: model.info },
    ...Object.entries(model.profiles).map(([id, value]) => ({ id, kind: 'profile', type: value.conceptType, value })),
    ...Object.entries(model.folders).map(([id, value]) => ({
      id,
      kind: 'folder',
      type: value.folderType ? `root:${value.folderType}` : 'folder',
      value,
    })),
    ...Object.entries(model.elements).map(([id, value]) => ({ id, kind: 'element', type: value.type, value })),
    ...Object.entries(model.relationships).map(([id, value]) => ({ id, kind: 'relationship', type: value.type, value })),
    ...Object.entries(model.views).map(([id, value]) => ({ id, kind: 'view', type: 'view', value })),
    ...Object.entries(model.nodes).map(([id, value]) => ({ id, kind: 'node', type: value.nodeType, value })),
    ...Object.entries(model.connections).map(([id, value]) => ({ id, kind: 'connection', type: value.connType, value })),
  ];
}

function validateIdConflicts(target: ModelState, source: ModelState): void {
  const targetById = new Map(globalObjects(target).map((entry) => [entry.id, entry]));
  for (const sourceEntry of globalObjects(source)) {
    const targetEntry = targetById.get(sourceEntry.id);
    if (!targetEntry) continue;
    if (targetEntry.kind !== sourceEntry.kind || targetEntry.type !== sourceEntry.type) {
      throw new Error(
        `Same-ID different type conflict for '${sourceEntry.id}': ${targetEntry.kind}/${targetEntry.type} versus ${sourceEntry.kind}/${sourceEntry.type}`,
      );
    }
    if (
      sourceEntry.kind === 'node'
      && (targetEntry.value as DiagramNode).viewId !== (sourceEntry.value as DiagramNode).viewId
    ) {
      throw new Error(`Same-ID node conflict belongs to a different view: '${sourceEntry.id}'`);
    }
    if (
      sourceEntry.kind === 'connection'
      && (targetEntry.value as DiagramConnection).viewId
        !== (sourceEntry.value as DiagramConnection).viewId
    ) {
      throw new Error(`Same-ID connection conflict belongs to a different view: '${sourceEntry.id}'`);
    }
  }
}

function uniqueAssetPath(model: ModelState, path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  const directory = slash >= 0 ? path.slice(0, slash + 1) : '';
  const base = path.slice(slash + 1, dot > slash ? dot : undefined);
  const extension = dot > slash ? path.slice(dot) : '';
  for (let suffix = 1; suffix < 10_000; suffix++) {
    const candidate = `${directory}${base}-imported-${suffix}${extension}`;
    if (!model.assets[candidate]) return candidate;
  }
  return `images/${newId().slice(3)}${extension}`;
}

function mergeAssets(
  merged: ModelState,
  source: ModelState,
  report: { details: ModelMergeDetail[] } & Omit<ModelMergeReport, 'details'>,
): Map<string, string> {
  const pathMap = new Map<string, string>();
  for (const asset of Object.values(source.assets)) {
    const duplicate = Object.values(merged.assets).find((candidate) => candidate.sha256 === asset.sha256);
    if (duplicate) {
      pathMap.set(asset.path, duplicate.path);
      addDetail(report, {
        status: 'unchanged', kind: 'asset', sourceId: asset.path, targetId: duplicate.path,
        label: asset.path,
      });
      continue;
    }
    const path = merged.assets[asset.path] ? uniqueAssetPath(merged, asset.path) : asset.path;
    merged.assets[path] = { ...clone(asset), path } satisfies ModelAsset;
    pathMap.set(asset.path, path);
    addDetail(report, { status: 'created', kind: 'asset', sourceId: asset.path, targetId: path, label: path });
    if (path !== asset.path) {
      addDetail(report, {
        status: 'warning', kind: 'asset', sourceId: asset.path, targetId: path, label: path,
        message: `Conflicting asset path remapped from '${asset.path}' to '${path}'`,
      });
    }
  }
  return pathMap;
}

function mergeProfiles(
  merged: ModelState,
  source: ModelState,
  assets: Map<string, string>,
  updateExisting: boolean,
  report: { details: ModelMergeDetail[] } & Omit<ModelMergeReport, 'details'>,
): Map<string, string> {
  const profileMap = new Map<string, string>();
  for (const profile of Object.values(source.profiles)) {
    const matched = Object.values(merged.profiles).find((candidate) => (
      candidate.conceptType === profile.conceptType
      && candidate.name.localeCompare(profile.name, undefined, { sensitivity: 'accent' }) === 0
    ));
    const replacement = (id: string): ProfileDefinition => ({
      ...clone(profile),
      id,
      imagePath: profile.imagePath ? assets.get(profile.imagePath) ?? profile.imagePath : undefined,
    });
    if (matched) {
      profileMap.set(profile.id, matched.id);
      if (updateExisting) {
        const next = replacement(matched.id);
        if (!equal(matched, next)) {
          merged.profiles[matched.id] = next;
          addDetail(report, { status: 'updated', kind: 'profile', sourceId: profile.id, targetId: matched.id, label: profile.name });
        } else addDetail(report, { status: 'unchanged', kind: 'profile', sourceId: profile.id, targetId: matched.id, label: profile.name });
      } else addDetail(report, { status: 'unchanged', kind: 'profile', sourceId: profile.id, targetId: matched.id, label: profile.name });
      continue;
    }
    const id = merged.profiles[profile.id] ? newId() : profile.id;
    merged.profiles[id] = replacement(id);
    profileMap.set(profile.id, id);
    addDetail(report, { status: 'created', kind: 'profile', sourceId: profile.id, targetId: id, label: profile.name });
  }
  return profileMap;
}

function removeFolderMembership(model: ModelState, id: string): void {
  for (const folder of Object.values(model.folders)) {
    folder.itemIds = folder.itemIds.filter((candidate) => candidate !== id);
  }
}

function placeItem(model: ModelState, id: string, folderId: string): void {
  removeFolderMembership(model, id);
  const folder = model.folders[folderId];
  if (folder && !folder.itemIds.includes(id)) folder.itemIds.push(id);
}

function mergeFolders(
  merged: ModelState,
  source: ModelState,
  enabled: boolean,
  updateExisting: boolean,
  report: { details: ModelMergeDetail[] } & Omit<ModelMergeReport, 'details'>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const sourceRootId of source.rootFolderIds) {
    const sourceRoot = source.folders[sourceRootId];
    const targetRootId = merged.rootFolderIds.find(
      (id) => merged.folders[id]?.folderType === sourceRoot?.folderType,
    );
    if (sourceRoot && targetRootId) map.set(sourceRootId, targetRootId);
  }
  if (!enabled) return map;
  const visit = (sourceFolderId: string): void => {
    const sourceFolder = source.folders[sourceFolderId];
    if (!sourceFolder) return;
    if (sourceFolder.folderType) {
      sourceFolder.folderIds.forEach(visit);
      return;
    }
    const parentId = sourceFolder.parentId ? map.get(sourceFolder.parentId) : undefined;
    if (!parentId) return;
    const existing = merged.folders[sourceFolder.id];
    if (!existing) {
      merged.folders[sourceFolder.id] = {
        ...clone(sourceFolder), parentId, folderIds: [], itemIds: [],
      };
      if (!merged.folders[parentId].folderIds.includes(sourceFolder.id)) {
        merged.folders[parentId].folderIds.push(sourceFolder.id);
      }
      addDetail(report, { status: 'created', kind: 'folder', sourceId: sourceFolder.id, targetId: sourceFolder.id, label: sourceFolder.name });
    } else {
      const previousParent = existing.parentId;
      if (updateExisting) {
        existing.name = sourceFolder.name;
        existing.documentation = sourceFolder.documentation;
        existing.properties = clone(sourceFolder.properties);
        existing.labelExpression = sourceFolder.labelExpression;
      }
      if (previousParent !== parentId) {
        for (const folder of Object.values(merged.folders)) {
          folder.folderIds = folder.folderIds.filter((id) => id !== existing.id);
        }
        merged.folders[parentId].folderIds.push(existing.id);
        existing.parentId = parentId;
        addDetail(report, { status: 'moved', kind: 'folder', sourceId: sourceFolder.id, targetId: existing.id, label: sourceFolder.name });
      } else addDetail(report, { status: 'unchanged', kind: 'folder', sourceId: sourceFolder.id, targetId: existing.id, label: sourceFolder.name });
    }
    map.set(sourceFolder.id, sourceFolder.id);
    sourceFolder.folderIds.forEach(visit);
  };
  source.rootFolderIds.forEach(visit);
  return map;
}

function defaultItemFolder(model: ModelState, kind: 'element' | 'relationship' | 'view', type?: string) {
  if (kind === 'element') return folderForElementType(model, type as Parameters<typeof folderForElementType>[1]);
  return defaultFolderId(model, kind === 'relationship' ? 'relations' : 'diagrams');
}

function visualIds(model: ModelState, viewId: string) {
  return {
    nodes: Object.values(model.nodes).filter((node) => node.viewId === viewId).map((node) => node.id),
    connections: Object.values(model.connections).filter((connection) => connection.viewId === viewId).map((connection) => connection.id),
  };
}

/** Produce a frozen preview without mutating either model. */
export function createModelMergePlan(
  target: ModelState,
  source: ModelState,
  options: ModelMergeOptions,
): ModelMergePlan {
  validateIdConflicts(target, source);
  const normalized = freeze({ ...options });
  const updateExisting = options.updateExisting || options.updateModelInfo;
  const merged = clone(target);
  const report = {
    created: 0, updated: 0, moved: 0, unchanged: 0, skipped: 0, warnings: 0,
    details: [] as ModelMergeDetail[],
  };
  const assets = mergeAssets(merged, source, report);
  const profiles = mergeProfiles(merged, source, assets, updateExisting, report);
  const folders = mergeFolders(
    merged, source, options.updateFolderStructure, updateExisting, report,
  );

  if (options.updateModelInfo) {
    const id = merged.info.id;
    merged.info = { ...clone(source.info), id };
    addDetail(report, { status: 'updated', kind: 'model', sourceId: source.info.id, targetId: id, label: source.info.name });
  }

  for (const sourceElement of Object.values(source.elements)) {
    const existing = merged.elements[sourceElement.id];
    const sourceFolder = folders.get(sourceElement.folderId);
    const folderId = options.updateFolderStructure && sourceFolder
      ? sourceFolder
      : existing?.folderId ?? defaultItemFolder(merged, 'element', sourceElement.type);
    const replacement = {
      ...clone(sourceElement), folderId,
      profileIds: sourceElement.profileIds.flatMap((id) => profiles.get(id) ?? []),
    };
    if (!existing) {
      merged.elements[sourceElement.id] = replacement;
      placeItem(merged, sourceElement.id, folderId);
      addDetail(report, { status: 'created', kind: 'element', sourceId: sourceElement.id, targetId: sourceElement.id, label: sourceElement.name });
    } else if (updateExisting) {
      const moved = existing.folderId !== folderId;
      if (!equal(existing, replacement)) {
        merged.elements[sourceElement.id] = replacement;
        placeItem(merged, sourceElement.id, folderId);
        addDetail(report, { status: 'updated', kind: 'element', sourceId: sourceElement.id, targetId: sourceElement.id, label: sourceElement.name });
        if (moved) addDetail(report, { status: 'moved', kind: 'element', sourceId: sourceElement.id, targetId: sourceElement.id, label: sourceElement.name });
      } else addDetail(report, { status: 'unchanged', kind: 'element', sourceId: sourceElement.id, targetId: sourceElement.id, label: sourceElement.name });
    } else addDetail(report, { status: 'unchanged', kind: 'element', sourceId: sourceElement.id, targetId: sourceElement.id, label: sourceElement.name });
  }

  const pendingRelationships = [...Object.values(source.relationships)];
  while (pendingRelationships.length > 0) {
    let progressed = false;
    for (let index = 0; index < pendingRelationships.length;) {
      const sourceRelationship = pendingRelationships[index];
      if (!getEndpoint(merged, sourceRelationship.sourceId)
          || !getEndpoint(merged, sourceRelationship.targetId)) {
        index++;
        continue;
      }
      const existing = merged.relationships[sourceRelationship.id];
      const sourceFolder = folders.get(sourceRelationship.folderId);
      const folderId = options.updateFolderStructure && sourceFolder
        ? sourceFolder
        : existing?.folderId ?? defaultItemFolder(merged, 'relationship');
      const replacement = {
        ...clone(sourceRelationship), folderId,
        profileIds: sourceRelationship.profileIds.flatMap((id) => profiles.get(id) ?? []),
      };
      if (!existing) {
        merged.relationships[sourceRelationship.id] = replacement;
        placeItem(merged, sourceRelationship.id, folderId);
        addDetail(report, { status: 'created', kind: 'relationship', sourceId: sourceRelationship.id, targetId: sourceRelationship.id, label: sourceRelationship.name });
      } else if (updateExisting) {
        const moved = existing.folderId !== folderId;
        merged.relationships[sourceRelationship.id] = replacement;
        placeItem(merged, sourceRelationship.id, folderId);
        addDetail(report, { status: equal(existing, replacement) ? 'unchanged' : 'updated', kind: 'relationship', sourceId: sourceRelationship.id, targetId: sourceRelationship.id, label: sourceRelationship.name });
        if (moved) addDetail(report, { status: 'moved', kind: 'relationship', sourceId: sourceRelationship.id, targetId: sourceRelationship.id, label: sourceRelationship.name });
      } else addDetail(report, { status: 'unchanged', kind: 'relationship', sourceId: sourceRelationship.id, targetId: sourceRelationship.id, label: sourceRelationship.name });
      pendingRelationships.splice(index, 1);
      progressed = true;
    }
    if (progressed) continue;
    for (const sourceRelationship of pendingRelationships) {
      addDetail(report, { status: 'skipped', kind: 'relationship', sourceId: sourceRelationship.id, label: sourceRelationship.name, message: 'Missing semantic endpoint' });
      addDetail(report, { status: 'warning', kind: 'relationship', sourceId: sourceRelationship.id, label: sourceRelationship.name, message: 'Relationship was skipped because an endpoint is missing' });
    }
    break;
  }

  for (const sourceView of Object.values(source.views)) {
    const existing = merged.views[sourceView.id];
    const sourceFolder = folders.get(sourceView.folderId);
    const folderId = options.updateFolderStructure && sourceFolder
      ? sourceFolder
      : existing?.folderId ?? defaultItemFolder(merged, 'view');
    if (existing && !updateExisting) {
      addDetail(report, { status: 'unchanged', kind: 'view', sourceId: sourceView.id, targetId: sourceView.id, label: sourceView.name });
      continue;
    }
    if (existing) {
      const ids = visualIds(merged, sourceView.id);
      ids.connections.forEach((id) => delete merged.connections[id]);
      ids.nodes.forEach((id) => delete merged.nodes[id]);
    }
    merged.views[sourceView.id] = { ...clone(sourceView), folderId };
    placeItem(merged, sourceView.id, folderId);
    for (const sourceNode of Object.values(source.nodes).filter((node) => node.viewId === sourceView.id)) {
      merged.nodes[sourceNode.id] = {
        ...clone(sourceNode),
        imagePath: sourceNode.imagePath ? assets.get(sourceNode.imagePath) ?? sourceNode.imagePath : undefined,
      } as DiagramNode;
    }
    for (const sourceConnection of Object.values(source.connections).filter(
      (connection) => connection.viewId === sourceView.id,
    )) {
      merged.connections[sourceConnection.id] = clone(sourceConnection);
    }
    addDetail(report, { status: existing ? 'updated' : 'created', kind: 'view', sourceId: sourceView.id, targetId: sourceView.id, label: sourceView.name });
  }
  rebuildConnectionAdjacency(merged);
  const integrityIssues = validateModelIntegrity(merged);
  if (integrityIssues.length > 0) {
    throw new Error(`Merge would create invalid model integrity: ${integrityIssues[0].message}`);
  }

  const frozenReport: ModelMergeReport = freeze({ ...report, details: report.details });
  freeze(merged);
  return Object.freeze({
    options: normalized,
    targetModel: target,
    sourceModelId: source.info.id,
    merged,
    report: frozenReport,
  });
}

function getEndpoint(model: ModelState, id: string) {
  return model.elements[id] ?? model.relationships[id];
}

/** Apply a confirmed, still-current preview as one transactional undo step. */
export function applyModelMergePlan(
  store: ModelStore,
  plan: ModelMergePlan,
): ModelMergeReport {
  const state = store.getState();
  if (!state.model) throw new Error('No model is open');
  if (state.readOnly) throw new Error('The model is read-only');
  if (state.model !== plan.targetModel) throw new Error('The target model changed since the preview');
  const replacement = cloneModelForEditing(plan.merged);
  store.transact('Import Model', (draft) => {
    draft.info = replacement.info;
    draft.profiles = replacement.profiles;
    draft.assets = replacement.assets;
    draft.folders = replacement.folders;
    draft.rootFolderIds = replacement.rootFolderIds;
    draft.elements = replacement.elements;
    draft.relationships = replacement.relationships;
    draft.views = replacement.views;
    draft.nodes = replacement.nodes;
    draft.connections = replacement.connections;
  });
  return plan.report;
}
