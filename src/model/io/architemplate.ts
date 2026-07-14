import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { newId } from '../id';
import { validateModelIntegrity } from '../validation';
import type {
  DiagramConnection,
  DiagramNode,
  ModelAsset,
  ModelState,
} from '../types';
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_DOCUMENT_BYTES,
} from './document-limits';
import { parseArchimateDocument, serializeArchimateDocument } from './archimate-document';

export const ARCHITEMPLATE_MANIFEST_ENTRY = 'manifest.xml';
export const ARCHITEMPLATE_MODEL_ENTRY = 'model.archimate';
export const ARCHITEMPLATE_METADATA_ENTRY = 'archi-online.json';
export const ARCHITEMPLATE_THUMBNAIL_PREFIX = 'Thumbnails/';
export const MAX_TEMPLATE_THUMBNAILS = 50;
export const MAX_TEMPLATE_THUMBNAIL_BYTES = 5 * 1024 * 1024;
export const TEMPLATE_THUMBNAIL_SIZE = 512;

const ARCHI_ID = /^id-[0-9a-f]{32}$/i;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface ArchiTemplateManifest {
  type: 'model';
  timestamp?: number;
  name: string;
  description: string;
  keyThumbnail?: string;
}

export interface ArchiTemplateMetadata {
  version: 1;
  id: string;
  categories: string[];
}

export interface ArchiTemplateCreateOptions {
  manifest: Omit<ArchiTemplateManifest, 'type' | 'timestamp'>;
  metadata?: ArchiTemplateMetadata;
  thumbnails?: Uint8Array[];
  /** Injectable only so fixture generation and tests can be deterministic. */
  timestamp?: number;
  /** Injectable only for deterministic compatibility fixtures. */
  idFactory?: () => string;
}

export interface ParsedArchiTemplate {
  manifest: ArchiTemplateManifest;
  metadata: ArchiTemplateMetadata;
  model: ModelState;
  thumbnails: Record<string, Uint8Array>;
}

export async function createArchiTemplate(
  model: ModelState,
  options: ArchiTemplateCreateOptions,
): Promise<Uint8Array> {
  const thumbnails = options.thumbnails ?? [];
  if (thumbnails.length > MAX_TEMPLATE_THUMBNAILS) {
    throw new Error(`An Archi template can contain at most ${MAX_TEMPLATE_THUMBNAILS} thumbnails`);
  }
  thumbnails.forEach((bytes, index) => validateThumbnail(bytes, `Thumbnails/${index + 1}.png`));
  const keyThumbnail = options.manifest.keyThumbnail;
  if (keyThumbnail && !thumbnailPath(keyThumbnail, thumbnails.length)) {
    throw new Error('The key thumbnail must reference a numbered Thumbnails/*.png entry');
  }
  const manifest: ArchiTemplateManifest = {
    type: 'model',
    timestamp: options.timestamp ?? Date.now(),
    name: options.manifest.name,
    description: options.manifest.description,
    ...(keyThumbnail ? { keyThumbnail } : {}),
  };
  const entries: Record<string, Uint8Array> = {
    [ARCHITEMPLATE_MANIFEST_ENTRY]: strToU8(serializeManifest(manifest)),
    [ARCHITEMPLATE_MODEL_ENTRY]: await serializeArchimateDocument(
      remapModelIds(model, options.idFactory),
    ),
  };
  if (options.metadata) {
    const metadata = normalizeMetadata(options.metadata, false);
    entries[ARCHITEMPLATE_METADATA_ENTRY] = strToU8(JSON.stringify(metadata, null, 2));
  }
  thumbnails.forEach((bytes, index) => {
    entries[`${ARCHITEMPLATE_THUMBNAIL_PREFIX}${index + 1}.png`] = bytes.slice();
  });
  const mtime = new Date(Math.max(manifest.timestamp ?? Date.now(), Date.UTC(1980, 0, 1)));
  const zipEntries: Zippable = {};
  for (const [path, value] of Object.entries(entries)) {
    zipEntries[path] = [value, { level: 6, mtime }];
  }
  return zipSync(zipEntries, { level: 6 });
}

export async function parseArchiTemplate(bytes: Uint8Array): Promise<ParsedArchiTemplate> {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Archi template exceeds the size limit');
  const archive = readTemplateArchive(bytes);
  const manifestBytes = archive[ARCHITEMPLATE_MANIFEST_ENTRY];
  if (!manifestBytes) throw new Error('Archi template is missing manifest.xml');
  const modelBytes = archive[ARCHITEMPLATE_MODEL_ENTRY];
  if (!modelBytes) throw new Error('Archi template is missing model.archimate');
  const manifest = parseManifest(strFromU8(manifestBytes));
  const thumbnails = Object.fromEntries(
    Object.entries(archive)
      .filter(([path]) => numberedThumbnailPath(path))
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([path, thumbnail]) => {
        validateThumbnail(thumbnail, path);
        return [path, thumbnail.slice()];
      }),
  );
  if (Object.keys(thumbnails).length > MAX_TEMPLATE_THUMBNAILS) {
    throw new Error(`An Archi template can contain at most ${MAX_TEMPLATE_THUMBNAILS} thumbnails`);
  }
  if (manifest.keyThumbnail && !thumbnails[manifest.keyThumbnail]) {
    throw new Error('The manifest key thumbnail is missing from the archive');
  }
  let metadata: ArchiTemplateMetadata;
  const metadataBytes = archive[ARCHITEMPLATE_METADATA_ENTRY];
  if (metadataBytes) {
    let value: unknown;
    try {
      value = JSON.parse(strFromU8(metadataBytes));
    } catch (cause) {
      throw new Error('archi-online.json is not valid JSON', { cause });
    }
    metadata = normalizeMetadata(value, false);
  } else {
    metadata = { version: 1, id: newId(), categories: [] };
  }
  const model = await parseArchimateDocument(modelBytes);
  validateModelIdsAndReferences(model);
  return { manifest, metadata, model, thumbnails };
}

export function createModelFromArchiTemplate(template: ParsedArchiTemplate): ModelState {
  return remapModelIds(template.model);
}

/** Deep-clone a model while replacing every persistent object ID and reference. */
export function remapModelIds(model: ModelState, idFactory: () => string = newId): ModelState {
  const ids = collectModelIds(model);
  const remapped = new Map<string, string>();
  const generated = new Set<string>();
  for (const id of ids) {
    let replacement = idFactory();
    while (generated.has(replacement)) replacement = idFactory();
    generated.add(replacement);
    remapped.set(id, replacement);
  }
  const map = (id: string): string => {
    const replacement = remapped.get(id);
    if (!replacement) throw new Error(`Model reference cannot be remapped: ${id}`);
    return replacement;
  };
  const result: ModelState = {
    info: { ...structuredClone(model.info), id: map(model.info.id) },
    profiles: {},
    assets: cloneAssets(model.assets),
    folders: {},
    rootFolderIds: model.rootFolderIds.map(map),
    elements: {},
    relationships: {},
    views: {},
    nodes: {},
    connections: {},
  };
  for (const profile of Object.values(model.profiles)) {
    const clone = { ...structuredClone(profile), id: map(profile.id) };
    result.profiles[clone.id] = clone;
  }
  for (const folder of Object.values(model.folders)) {
    const clone = {
      ...structuredClone(folder),
      id: map(folder.id),
      parentId: folder.parentId ? map(folder.parentId) : null,
      folderIds: folder.folderIds.map(map),
      itemIds: folder.itemIds.map(map),
    };
    result.folders[clone.id] = clone;
  }
  for (const element of Object.values(model.elements)) {
    const clone = {
      ...structuredClone(element),
      id: map(element.id),
      profileIds: element.profileIds.map(map),
      folderId: map(element.folderId),
    };
    result.elements[clone.id] = clone;
  }
  for (const relationship of Object.values(model.relationships)) {
    const clone = {
      ...structuredClone(relationship),
      id: map(relationship.id),
      profileIds: relationship.profileIds.map(map),
      folderId: map(relationship.folderId),
      sourceId: map(relationship.sourceId),
      targetId: map(relationship.targetId),
    };
    result.relationships[clone.id] = clone;
  }
  for (const view of Object.values(model.views)) {
    const clone = {
      ...structuredClone(view),
      id: map(view.id),
      folderId: map(view.folderId),
      childIds: view.childIds.map(map),
    };
    result.views[clone.id] = clone;
  }
  for (const node of Object.values(model.nodes)) {
    const clone = remapNode(node, map);
    result.nodes[clone.id] = clone;
  }
  for (const connection of Object.values(model.connections)) {
    const clone = remapConnection(connection, map);
    result.connections[clone.id] = clone;
  }
  validateModelIdsAndReferences(result);
  return result;
}

function remapNode(node: DiagramNode, map: (id: string) => string): DiagramNode {
  const clone = {
    ...structuredClone(node),
    id: map(node.id),
    viewId: map(node.viewId),
    parentId: map(node.parentId),
    childIds: node.childIds.map(map),
    sourceConnectionIds: node.sourceConnectionIds.map(map),
    targetConnectionIds: node.targetConnectionIds.map(map),
  } as DiagramNode;
  if (clone.nodeType === 'element') clone.elementId = map(clone.elementId);
  if (clone.nodeType === 'ref') clone.refViewId = map(clone.refViewId);
  return clone;
}

function remapConnection(
  connection: DiagramConnection,
  map: (id: string) => string,
): DiagramConnection {
  return {
    ...structuredClone(connection),
    id: map(connection.id),
    viewId: map(connection.viewId),
    sourceId: map(connection.sourceId),
    targetId: map(connection.targetId),
    sourceConnectionIds: connection.sourceConnectionIds.map(map),
    targetConnectionIds: connection.targetConnectionIds.map(map),
    ...(connection.relationshipId ? { relationshipId: map(connection.relationshipId) } : {}),
  };
}

function cloneAssets(assets: Record<string, ModelAsset>): Record<string, ModelAsset> {
  return Object.fromEntries(Object.entries(assets).map(([path, asset]) => [path, {
    ...structuredClone(asset),
    bytes: asset.bytes.slice(),
    renderBytes: asset.renderBytes.slice(),
  }]));
}

function collectModelIds(model: ModelState): string[] {
  const ids = [
    model.info.id,
    ...collectRecordIds(model.profiles, 'profile'),
    ...collectRecordIds(model.folders, 'folder'),
    ...collectRecordIds(model.elements, 'element'),
    ...collectRecordIds(model.relationships, 'relationship'),
    ...collectRecordIds(model.views, 'view'),
    ...collectRecordIds(model.nodes, 'node'),
    ...collectRecordIds(model.connections, 'connection'),
  ];
  if (new Set(ids).size !== ids.length) throw new Error('Model contains duplicate IDs');
  return ids;
}

function collectRecordIds<T extends { id: string }>(
  record: Record<string, T>,
  label: string,
): string[] {
  return Object.entries(record).map(([key, value]) => {
    if (key !== value.id) throw new Error(`Model contains a key-mismatched ${label} ID: ${key}`);
    return value.id;
  });
}

function validateModelIdsAndReferences(model: ModelState): void {
  const ids = collectModelIds(model);
  if (!ARCHI_ID.test(model.info.id)) throw new Error(`Invalid model ID: ${model.info.id}`);
  const invalid = ids.find((id) => !ARCHI_ID.test(id));
  if (invalid) throw new Error(`Invalid object ID in template model: ${invalid}`);
  const requireReference = (valid: boolean, id: string, label: string) => {
    if (!valid) throw new Error(`Template model has an invalid ${label} reference: ${id}`);
  };
  const isFolderItem = (id: string) => Boolean(
    model.elements[id] || model.relationships[id] || model.views[id],
  );
  const isConcept = (id: string) => Boolean(model.elements[id] || model.relationships[id]);
  const isConnectable = (id: string) => Boolean(model.nodes[id] || model.connections[id]);
  model.rootFolderIds.forEach((id) => requireReference(Boolean(model.folders[id]), id, 'root folder'));
  for (const profile of Object.values(model.profiles)) {
    if (profile.imagePath && !model.assets[profile.imagePath]) {
      throw new Error(`Template model has a missing profile image: ${profile.imagePath}`);
    }
  }
  for (const folder of Object.values(model.folders)) {
    if (folder.parentId) requireReference(Boolean(model.folders[folder.parentId]), folder.parentId, 'parent folder');
    folder.folderIds.forEach((id) => requireReference(Boolean(model.folders[id]), id, 'child folder'));
    folder.itemIds.forEach((id) => requireReference(isFolderItem(id), id, 'folder item'));
  }
  for (const concept of [...Object.values(model.elements), ...Object.values(model.relationships)]) {
    requireReference(Boolean(model.folders[concept.folderId]), concept.folderId, 'concept folder');
    concept.profileIds.forEach((id) => requireReference(Boolean(model.profiles[id]), id, 'profile'));
  }
  for (const relationship of Object.values(model.relationships)) {
    requireReference(isConcept(relationship.sourceId), relationship.sourceId, 'relationship source');
    requireReference(isConcept(relationship.targetId), relationship.targetId, 'relationship target');
  }
  for (const view of Object.values(model.views)) {
    requireReference(Boolean(model.folders[view.folderId]), view.folderId, 'view folder');
    view.childIds.forEach((id) => requireReference(Boolean(model.nodes[id]), id, 'view child'));
  }
  for (const node of Object.values(model.nodes)) {
    requireReference(Boolean(model.views[node.viewId]), node.viewId, 'node view');
    requireReference(Boolean(model.views[node.parentId] || model.nodes[node.parentId]), node.parentId, 'node parent');
    node.childIds.forEach((id) => requireReference(Boolean(model.nodes[id]), id, 'node child'));
    node.sourceConnectionIds.forEach((id) => requireReference(Boolean(model.connections[id]), id, 'source connection'));
    node.targetConnectionIds.forEach((id) => requireReference(Boolean(model.connections[id]), id, 'target connection'));
    if (node.nodeType === 'element') requireReference(Boolean(model.elements[node.elementId]), node.elementId, 'node element');
    if (node.nodeType === 'ref') requireReference(Boolean(model.views[node.refViewId]), node.refViewId, 'referenced view');
    if (node.nodeType === 'image' && !model.assets[node.imagePath]) {
      throw new Error(`Template model has a missing node image: ${node.imagePath}`);
    }
  }
  for (const connection of Object.values(model.connections)) {
    requireReference(Boolean(model.views[connection.viewId]), connection.viewId, 'connection view');
    requireReference(isConnectable(connection.sourceId), connection.sourceId, 'connection source');
    requireReference(isConnectable(connection.targetId), connection.targetId, 'connection target');
    connection.sourceConnectionIds.forEach((id) => requireReference(Boolean(model.connections[id]), id, 'source connection'));
    connection.targetConnectionIds.forEach((id) => requireReference(Boolean(model.connections[id]), id, 'target connection'));
    if (connection.relationshipId) {
      requireReference(Boolean(model.relationships[connection.relationshipId]), connection.relationshipId, 'connection relationship');
    }
  }
  const integrityIssues = validateModelIntegrity(model);
  if (integrityIssues.length > 0) {
    throw new Error(`Template model has invalid integrity: ${integrityIssues[0].message}`);
  }
}

function readTemplateArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  let entryCount = 0;
  let totalBytes = 0;
  try {
    return unzipSync(bytes, {
      filter: (entry) => {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw new Error(`Archi template contains more than ${MAX_ARCHIVE_ENTRIES} entries`);
        }
        if (!safeArchivePath(entry.name)) {
          throw new Error(`Archi template contains an unsafe entry: ${entry.name}`);
        }
        if (!allowedArchivePath(entry.name)) {
          throw new Error(`Archi template contains an unsupported entry: ${entry.name}`);
        }
        totalBytes += entry.originalSize;
        if (totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
          throw new Error('Archi template exceeds the uncompressed size limit');
        }
        if (entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES) {
          throw new Error(`Archi template entry exceeds the size limit: ${entry.name}`);
        }
        if (numberedThumbnailPath(entry.name) && entry.originalSize > MAX_TEMPLATE_THUMBNAIL_BYTES) {
          throw new Error(`Archi template thumbnail exceeds the size limit: ${entry.name}`);
        }
        return entry.name !== ARCHITEMPLATE_THUMBNAIL_PREFIX;
      },
    });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new Error(`Could not read Archi template${detail}`, { cause });
  }
}

function safeArchivePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
    !path.split('/').some((part) => part === '..' || part === '.');
}

function allowedArchivePath(path: string): boolean {
  return path === ARCHITEMPLATE_MANIFEST_ENTRY ||
    path === ARCHITEMPLATE_MODEL_ENTRY ||
    path === ARCHITEMPLATE_METADATA_ENTRY ||
    path === ARCHITEMPLATE_THUMBNAIL_PREFIX ||
    numberedThumbnailPath(path);
}

function numberedThumbnailPath(path: string): boolean {
  return /^Thumbnails\/[1-9][0-9]*\.png$/.test(path);
}

function thumbnailPath(path: string, count: number): boolean {
  if (!numberedThumbnailPath(path)) return false;
  const index = Number(path.slice(ARCHITEMPLATE_THUMBNAIL_PREFIX.length, -4));
  return index >= 1 && index <= count;
}

function validateThumbnail(bytes: Uint8Array, path: string): void {
  if (bytes.length > MAX_TEMPLATE_THUMBNAIL_BYTES) {
    throw new Error(`Template thumbnail exceeds the size limit: ${path}`);
  }
  if (bytes.length < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error(`Template thumbnail is not a PNG image: ${path}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width < 1 || height < 1 || width > TEMPLATE_THUMBNAIL_SIZE || height > TEMPLATE_THUMBNAIL_SIZE) {
    throw new Error(`Template thumbnails must be at most 512 × 512 pixels: ${path}`);
  }
}

function serializeManifest(manifest: ArchiTemplateManifest): string {
  const timestamp = manifest.timestamp === undefined ? '' : ` timestamp="${manifest.timestamp}"`;
  const keyThumbnail = manifest.keyThumbnail
    ? `<key-thumbnail>${escapeXml(manifest.keyThumbnail)}</key-thumbnail>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<manifest type="model"${timestamp}>` +
    `<name>${escapeXml(manifest.name)}</name>` +
    `<description>${escapeXml(manifest.description)}</description>` +
    keyThumbnail +
    '</manifest>';
}

function parseManifest(xml: string): ArchiTemplateManifest {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Template manifest must not contain a DOCTYPE');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Template manifest is malformed XML');
  const root = document.documentElement;
  if (root.tagName !== 'manifest') throw new Error('Template manifest must have a manifest root');
  const type = root.getAttribute('type');
  if (type !== null && type !== 'model') throw new Error('Template manifest type must be model');
  const childText = (tag: string): string | undefined =>
    Array.from(root.children).find((child) => child.tagName === tag)?.textContent ?? undefined;
  const name = childText('name');
  if (name === undefined) throw new Error('Template manifest is missing its name');
  const description = childText('description') ?? '';
  const keyThumbnail = childText('key-thumbnail')?.trim();
  if (keyThumbnail && !numberedThumbnailPath(keyThumbnail)) {
    throw new Error('Template manifest contains an invalid key thumbnail path');
  }
  const rawTimestamp = root.getAttribute('timestamp');
  let timestamp: number | undefined;
  if (rawTimestamp !== null) {
    timestamp = Number(rawTimestamp);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new Error('Template manifest timestamp is invalid');
    }
  }
  return {
    type: 'model',
    ...(timestamp === undefined ? {} : { timestamp }),
    name,
    description,
    ...(keyThumbnail ? { keyThumbnail } : {}),
  };
}

function normalizeMetadata(value: unknown, allowDefaultId: boolean): ArchiTemplateMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('archi-online.json must contain an object');
  }
  const source = value as Record<string, unknown>;
  if (source.version !== 1) throw new Error('Unsupported archi-online.json version');
  const id = typeof source.id === 'string' && ARCHI_ID.test(source.id)
    ? source.id.toLowerCase()
    : allowDefaultId ? newId() : undefined;
  if (!id) throw new Error('archi-online.json contains an invalid template ID');
  if (!Array.isArray(source.categories) || source.categories.some((item) => typeof item !== 'string')) {
    throw new Error('archi-online.json categories must be strings');
  }
  const categories: string[] = [];
  const seen = new Set<string>();
  for (const raw of source.categories as string[]) {
    const category = raw.trim();
    if (!category) continue;
    if (category.length > 64) throw new Error('Template categories must be 64 characters or fewer');
    const normalized = category.toLocaleLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      categories.push(category);
    }
  }
  if (categories.length > 50) throw new Error('A template can have at most 50 categories');
  return { version: 1, id, categories };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
