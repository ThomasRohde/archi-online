import { create } from 'zustand';
import { defaultKeyValueStore, type AsyncKeyValueStore } from '../persistence/keyval';
import type { InstalledExtensionPackage } from './package-types';
import { makeInstalledPackage } from './package-validation';

export const EXTENSION_PACKAGES_STORAGE_KEY = 'archi-online.extension-packages.v2';

interface ParsedInstalledPackages {
  packages: InstalledExtensionPackage[];
  retained: unknown[];
}

interface PersistOptions {
  retainUnreadable?: boolean;
  dropRetainedIds?: Iterable<string>;
}

let retainedInstalledPackageRecords: unknown[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawPackageId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.id === 'string') return value.id;
  if (isRecord(value.manifest) && typeof value.manifest.id === 'string') {
    return value.manifest.id;
  }
  return null;
}

function normalizeInstalledPackage(value: unknown): InstalledExtensionPackage | null {
  if (!isRecord(value) || !isRecord(value.files)) return null;
  if (
    typeof value.enabled !== 'boolean' ||
    typeof value.installedAt !== 'number' ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.installedAt) ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }

  try {
    return makeInstalledPackage({
      manifest: value.manifest,
      files: value.files,
      enabled: value.enabled,
      installedAt: value.installedAt,
      now: value.updatedAt,
    });
  } catch {
    return null;
  }
}

export function normalizeInstalledPackages(value: unknown): InstalledExtensionPackage[] {
  return parseInstalledPackages(value).packages;
}

function parseInstalledPackages(value: unknown): ParsedInstalledPackages {
  if (!Array.isArray(value)) return { packages: [], retained: [] };
  const seen = new Set<string>();
  const packages: InstalledExtensionPackage[] = [];
  const retained: unknown[] = [];
  for (const item of value) {
    const pkg = normalizeInstalledPackage(item);
    if (!pkg) {
      if (rawPackageId(item)) retained.push(item);
      continue;
    }
    if (seen.has(pkg.id)) continue;
    seen.add(pkg.id);
    packages.push(pkg);
  }
  return { packages, retained };
}

export async function loadInstalledPackages(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<InstalledExtensionPackage[]> {
  try {
    const raw = await storage.get<unknown>(EXTENSION_PACKAGES_STORAGE_KEY);
    const parsed = parseInstalledPackages(raw);
    retainedInstalledPackageRecords = parsed.retained;
    return parsed.packages;
  } catch {
    retainedInstalledPackageRecords = [];
    return [];
  }
}

export async function persistInstalledPackages(
  packages: InstalledExtensionPackage[],
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
  options: PersistOptions = {},
): Promise<void> {
  try {
    const normalized = normalizeInstalledPackages(packages);
    const normalizedIds = new Set(normalized.map((pkg) => pkg.id));
    const dropIds = new Set(options.dropRetainedIds ?? []);
    const retained = options.retainUnreadable === false
      ? []
      : retainedInstalledPackageRecords.filter((record) => {
          const id = rawPackageId(record);
          return id && !dropIds.has(id) && !normalizedIds.has(id);
        });
    await storage.set(EXTENSION_PACKAGES_STORAGE_KEY, [...retained, ...normalized]);
    retainedInstalledPackageRecords = retained;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not persist extension packages: ${message}`, { cause: error });
  }
}

interface ExtensionPackageStoreState {
  packages: InstalledExtensionPackage[];
  setPackages(packages: InstalledExtensionPackage[]): Promise<void>;
  upsertPackage(pkg: InstalledExtensionPackage): Promise<void>;
  removePackage(id: string): Promise<void>;
  setPackageEnabled(id: string, enabled: boolean): Promise<void>;
}

async function commit(
  packages: InstalledExtensionPackage[],
  options: PersistOptions = {},
): Promise<InstalledExtensionPackage[]> {
  const normalized = normalizeInstalledPackages(packages);
  await persistInstalledPackages(normalized, undefined, options);
  return normalized;
}

export const useExtensionPackageStore = create<ExtensionPackageStoreState>((set) => ({
  packages: [],
  setPackages: async (packages) => {
    set({ packages: await commit(packages, { retainUnreadable: false }) });
  },
  upsertPackage: async (pkg) => {
    const state = useExtensionPackageStore.getState();
    set({
      packages: await commit(
        [
          ...state.packages.filter((existing) => existing.id !== pkg.id),
          { ...pkg, updatedAt: Date.now() },
        ],
        { dropRetainedIds: [pkg.id] },
      ),
    });
  },
  removePackage: async (id) => {
    const state = useExtensionPackageStore.getState();
    set({
      packages: await commit(state.packages.filter((pkg) => pkg.id !== id), {
        dropRetainedIds: [id],
      }),
    });
  },
  setPackageEnabled: async (id, enabled) => {
    const state = useExtensionPackageStore.getState();
    set({
      packages: await commit(
        state.packages.map((pkg) =>
          pkg.id === id ? { ...pkg, enabled, updatedAt: Date.now() } : pkg,
        ),
      ),
    });
  },
}));

export async function hydrateExtensionPackageStore(): Promise<void> {
  useExtensionPackageStore.setState({ packages: await loadInstalledPackages() });
}
