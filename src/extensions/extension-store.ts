import { create } from 'zustand';
import type { LocalExtensionRecord } from './types';

export const EXTENSIONS_STORAGE_KEY = 'archi-online.extensions.v1';

export const DEFAULT_EXTENSION_TEMPLATE = `app.extension({
  id: "local.my-extension",
  name: "My extension",
  version: "0.1.0"
});

app.commands.register("local.my-extension.hello", {
  title: "Hello",
  run() {
    app.dialogs.info("Hello", "Extension is working.");
  }
});

app.toolbar.addButton({
  id: "local.my-extension.helloButton",
  label: "Hello",
  command: "local.my-extension.hello"
});
`;

type ExtensionStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface ParsedExtensionRecords {
  records: LocalExtensionRecord[];
  retained: unknown[];
}

interface PersistOptions {
  retainUnreadable?: boolean;
  dropRetainedIds?: Iterable<string>;
}

let retainedExtensionRecords: unknown[] = [];

function storageOrNull(): ExtensionStorage | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawRecordId(value: unknown): string | null {
  return isRecord(value) && typeof value.id === 'string' ? value.id : null;
}

function normalizeRecord(value: unknown): LocalExtensionRecord | null {
  if (!isRecord(value)) return null;
  const { id, name, version, enabled, source, createdAt, updatedAt } = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    typeof enabled !== 'boolean' ||
    typeof source !== 'string' ||
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }
  const origin = value.origin === 'source' || value.origin === 'override' ? value.origin : undefined;
  return { id, name, version, enabled, source, createdAt, updatedAt, ...(origin ? { origin } : {}) };
}

export function normalizeExtensionRecords(value: unknown): LocalExtensionRecord[] {
  return parseExtensionRecords(value).records;
}

function parseExtensionRecords(value: unknown): ParsedExtensionRecords {
  if (!Array.isArray(value)) return { records: [], retained: [] };
  const seen = new Set<string>();
  const records: LocalExtensionRecord[] = [];
  const retained: unknown[] = [];
  for (const item of value) {
    const record = normalizeRecord(item);
    if (!record) {
      if (rawRecordId(item)) retained.push(item);
      continue;
    }
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return { records, retained };
}

export function loadExtensionRecords(
  storage: ExtensionStorage | null = storageOrNull(),
): LocalExtensionRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EXTENSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = parseExtensionRecords(JSON.parse(raw));
    retainedExtensionRecords = parsed.retained;
    return parsed.records;
  } catch {
    retainedExtensionRecords = [];
    return [];
  }
}

export function persistExtensionRecords(
  records: LocalExtensionRecord[],
  storage: ExtensionStorage | null = storageOrNull(),
  options: PersistOptions = {},
): void {
  if (!storage) return;
  try {
    const normalized = normalizeExtensionRecords(records);
    const normalizedIds = new Set(normalized.map((record) => record.id));
    const dropIds = new Set(options.dropRetainedIds ?? []);
    const retained = options.retainUnreadable === false
      ? []
      : retainedExtensionRecords.filter((record) => {
          const id = rawRecordId(record);
          return id && !dropIds.has(id) && !normalizedIds.has(id);
        });
    storage.setItem(EXTENSIONS_STORAGE_KEY, JSON.stringify([...retained, ...normalized]));
    retainedExtensionRecords = retained;
  } catch {
    /* localStorage failures should not block editing */
  }
}

export function createExtensionRecord(
  id: string,
  name: string,
  now = Date.now(),
): LocalExtensionRecord {
  return {
    id,
    name,
    version: '0.1.0',
    enabled: true,
    source: extensionTemplateSource(id, name),
    createdAt: now,
    updatedAt: now,
  };
}

export function extensionTemplateSource(id: string, name: string): string {
  return DEFAULT_EXTENSION_TEMPLATE.replaceAll('local.my-extension', id).replaceAll(
    'My extension',
    name,
  );
}

interface ExtensionStoreState {
  extensions: LocalExtensionRecord[];
  setExtensions(records: LocalExtensionRecord[]): void;
  upsert(record: LocalExtensionRecord): void;
  remove(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
}

function commit(
  records: LocalExtensionRecord[],
  options: PersistOptions = {},
): LocalExtensionRecord[] {
  const normalized = normalizeExtensionRecords(records);
  persistExtensionRecords(normalized, undefined, options);
  return normalized;
}

export const useExtensionStore = create<ExtensionStoreState>((set) => ({
  extensions: loadExtensionRecords(),
  setExtensions: (records) => set({ extensions: commit(records, { retainUnreadable: false }) }),
  upsert: (record) =>
    set((state) => ({
      extensions: commit(
        [
          ...state.extensions.filter((existing) => existing.id !== record.id),
          { ...record, updatedAt: Date.now() },
        ],
        { dropRetainedIds: [record.id] },
      ),
    })),
  remove: (id) =>
    set((state) => ({
      extensions: commit(state.extensions.filter((record) => record.id !== id), {
        dropRetainedIds: [id],
      }),
    })),
  setEnabled: (id, enabled) =>
    set((state) => ({
      extensions: commit(
        state.extensions.map((record) =>
          record.id === id ? { ...record, enabled, updatedAt: Date.now() } : record,
        ),
      ),
    })),
}));
