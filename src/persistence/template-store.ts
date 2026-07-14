import { create } from 'zustand';
import {
  createArchiTemplate,
  parseArchiTemplate,
  type ArchiTemplateMetadata,
} from '../model/io/architemplate';
import { defaultKeyValueStore, type AsyncKeyValueStore } from './keyval';

export const TEMPLATE_CATALOG_KEY = 'archi-online.template-catalog.v1';
const ARCHI_ID = /^id-[0-9a-f]{32}$/i;

export interface TemplateRecord {
  version: 1;
  id: string;
  name: string;
  description: string;
  categories: string[];
  keyThumbnail?: string;
  thumbnail?: Uint8Array;
  archive: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

export async function createTemplateRecord(
  archive: Uint8Array,
  now = Date.now(),
): Promise<TemplateRecord> {
  const parsed = await parseArchiTemplate(archive);
  const keyThumbnail = parsed.manifest.keyThumbnail;
  const thumbnail = keyThumbnail ? parsed.thumbnails[keyThumbnail] : undefined;
  return {
    version: 1,
    id: parsed.metadata.id,
    name: parsed.manifest.name,
    description: parsed.manifest.description,
    categories: [...parsed.metadata.categories],
    ...(keyThumbnail ? { keyThumbnail } : {}),
    ...(thumbnail ? { thumbnail: thumbnail.slice() } : {}),
    archive: archive.slice(),
    createdAt: now,
    updatedAt: now,
  };
}

export interface TemplateRecordUpdate {
  name?: string;
  description?: string;
  categories?: string[];
  keyThumbnail?: string;
}

export async function updateTemplateRecord(
  record: TemplateRecord,
  update: TemplateRecordUpdate,
  now = Date.now(),
): Promise<TemplateRecord> {
  const parsed = await parseArchiTemplate(record.archive);
  const thumbnailEntries = Object.entries(parsed.thumbnails)
    .sort(([left], [right]) => Number(left.slice(11, -4)) - Number(right.slice(11, -4)));
  const keyThumbnail = Object.prototype.hasOwnProperty.call(update, 'keyThumbnail')
    ? update.keyThumbnail
    : parsed.manifest.keyThumbnail;
  const archive = await createArchiTemplate(parsed.model, {
    manifest: {
      name: update.name ?? parsed.manifest.name,
      description: update.description ?? parsed.manifest.description,
      ...(keyThumbnail ? { keyThumbnail } : {}),
    },
    metadata: {
      version: 1,
      id: record.id,
      categories: update.categories ?? parsed.metadata.categories,
    },
    thumbnails: thumbnailEntries.map(([, bytes]) => bytes),
    timestamp: now,
  });
  return {
    ...await createTemplateRecord(archive, record.createdAt),
    createdAt: record.createdAt,
    updatedAt: now,
  };
}

export function normalizeTemplateCatalog(value: unknown): TemplateRecord[] {
  if (!Array.isArray(value)) return [];
  const records: TemplateRecord[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    if (source.version !== 1 || typeof source.id !== 'string' || !ARCHI_ID.test(source.id)) continue;
    if (typeof source.name !== 'string' || typeof source.description !== 'string') continue;
    if (!(source.archive instanceof Uint8Array) || source.archive.length === 0) continue;
    if (!Array.isArray(source.categories) || source.categories.some((entry) => typeof entry !== 'string')) {
      continue;
    }
    if (typeof source.createdAt !== 'number' || !Number.isFinite(source.createdAt) ||
        typeof source.updatedAt !== 'number' || !Number.isFinite(source.updatedAt)) continue;
    if (source.keyThumbnail !== undefined && typeof source.keyThumbnail !== 'string') continue;
    if (source.thumbnail !== undefined && !(source.thumbnail instanceof Uint8Array)) continue;
    const id = source.id.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    records.push({
      version: 1,
      id,
      name: source.name,
      description: source.description,
      categories: uniqueStrings(source.categories as string[]),
      ...(typeof source.keyThumbnail === 'string' ? { keyThumbnail: source.keyThumbnail } : {}),
      ...(source.thumbnail instanceof Uint8Array ? { thumbnail: source.thumbnail.slice() } : {}),
      archive: source.archive.slice(),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });
  }
  return records.sort((left, right) => left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id));
}

export async function loadTemplateCatalog(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<TemplateRecord[]> {
  try {
    return normalizeTemplateCatalog(await storage.get(TEMPLATE_CATALOG_KEY));
  } catch {
    return [];
  }
}

export async function persistTemplateCatalog(
  records: TemplateRecord[],
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  await storage.set(TEMPLATE_CATALOG_KEY, normalizeTemplateCatalog(records));
}

export function searchTemplateCatalog(
  records: TemplateRecord[],
  query: string,
  categories: string[],
): TemplateRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  const categoryNeedles = categories.map((category) => category.toLocaleLowerCase());
  return records.filter((record) => {
    const haystack = `${record.name}\n${record.description}\n${record.categories.join('\n')}`
      .toLocaleLowerCase();
    const recordCategories = new Set(record.categories.map((category) => category.toLocaleLowerCase()));
    return (!needle || haystack.includes(needle)) &&
      categoryNeedles.every((category) => recordCategories.has(category));
  });
}

interface TemplateCatalogState {
  records: TemplateRecord[];
  hydrated: boolean;
  upsert(record: TemplateRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useTemplateCatalog = create<TemplateCatalogState>((set, get) => ({
  records: [],
  hydrated: false,
  upsert: async (record) => {
    const records = get().records;
    const existing = records.find((candidate) => candidate.id === record.id);
    const next = normalizeTemplateCatalog([
      ...records.filter((candidate) => candidate.id !== record.id),
      { ...record, createdAt: existing?.createdAt ?? record.createdAt },
    ]);
    await persistTemplateCatalog(next);
    set({ records: next });
  },
  remove: async (id) => {
    const next = get().records.filter((record) => record.id !== id);
    await persistTemplateCatalog(next);
    set({ records: next });
  },
}));

export async function hydrateTemplateCatalog(): Promise<void> {
  useTemplateCatalog.setState({
    records: await loadTemplateCatalog(),
    hydrated: true,
  });
}

export async function importTemplateToCatalog(archive: Uint8Array): Promise<TemplateRecord> {
  const record = await createTemplateRecord(archive);
  await useTemplateCatalog.getState().upsert(record);
  return record;
}

export function templateRecordMetadata(record: TemplateRecord): ArchiTemplateMetadata {
  return { version: 1, id: record.id, categories: [...record.categories] };
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}
