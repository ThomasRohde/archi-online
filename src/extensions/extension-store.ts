import { create } from 'zustand';
import { defaultKeyValueStore, type AsyncKeyValueStore } from '../persistence/keyval';
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

interface ParsedExtensionRecords {
  records: LocalExtensionRecord[];
  retained: unknown[];
}

interface PersistOptions {
  retainUnreadable?: boolean;
  dropRetainedIds?: Iterable<string>;
}

let retainedExtensionRecords: unknown[] = [];

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

export async function loadExtensionRecords(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<LocalExtensionRecord[]> {
  try {
    const raw = await storage.get<unknown>(EXTENSIONS_STORAGE_KEY);
    const parsed = parseExtensionRecords(raw);
    retainedExtensionRecords = parsed.retained;
    return parsed.records;
  } catch {
    retainedExtensionRecords = [];
    return [];
  }
}

export async function persistExtensionRecords(
  records: LocalExtensionRecord[],
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
  options: PersistOptions = {},
): Promise<void> {
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
    await storage.set(EXTENSIONS_STORAGE_KEY, [...retained, ...normalized]);
    retainedExtensionRecords = retained;
  } catch {
    /* IndexedDB failures should not block editing */
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
  setExtensions(records: LocalExtensionRecord[]): Promise<void>;
  upsert(record: LocalExtensionRecord): Promise<void>;
  remove(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

async function commit(
  records: LocalExtensionRecord[],
  options: PersistOptions = {},
): Promise<LocalExtensionRecord[]> {
  const normalized = normalizeExtensionRecords(records);
  await persistExtensionRecords(normalized, undefined, options);
  return normalized;
}

export const useExtensionStore = create<ExtensionStoreState>((set) => ({
  extensions: [],
  setExtensions: async (records) => {
    set({ extensions: await commit(records, { retainUnreadable: false }) });
  },
  upsert: async (record) => {
    const state = useExtensionStore.getState();
    set({
      extensions: await commit(
        [
          ...state.extensions.filter((existing) => existing.id !== record.id),
          { ...record, updatedAt: Date.now() },
        ],
        { dropRetainedIds: [record.id] },
      ),
    });
  },
  remove: async (id) => {
    const state = useExtensionStore.getState();
    set({
      extensions: await commit(state.extensions.filter((record) => record.id !== id), {
        dropRetainedIds: [id],
      }),
    });
  },
  setEnabled: async (id, enabled) => {
    const state = useExtensionStore.getState();
    set({
      extensions: await commit(
        state.extensions.map((record) =>
          record.id === id ? { ...record, enabled, updatedAt: Date.now() } : record,
        ),
      ),
    });
  },
}));

export async function hydrateExtensionStore(): Promise<void> {
  useExtensionStore.setState({ extensions: await loadExtensionRecords() });
}
