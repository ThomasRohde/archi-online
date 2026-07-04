import { create } from 'zustand';
import type { InstalledExtensionPackage } from './package-types';
import { makeInstalledPackage } from './package-validation';

export const EXTENSION_PACKAGES_STORAGE_KEY = 'archi-online.extension-packages.v2';

type ExtensionPackageStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface ParsedInstalledPackages {
  packages: InstalledExtensionPackage[];
  retained: unknown[];
}

interface PersistOptions {
  retainUnreadable?: boolean;
  dropRetainedIds?: Iterable<string>;
}

let retainedInstalledPackageRecords: unknown[] = [];

function storageOrNull(): ExtensionPackageStorage | null {
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

export function loadInstalledPackages(
  storage: ExtensionPackageStorage | null = storageOrNull(),
): InstalledExtensionPackage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EXTENSION_PACKAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = parseInstalledPackages(JSON.parse(raw));
    retainedInstalledPackageRecords = parsed.retained;
    return parsed.packages;
  } catch {
    retainedInstalledPackageRecords = [];
    return [];
  }
}

export function persistInstalledPackages(
  packages: InstalledExtensionPackage[],
  storage: ExtensionPackageStorage | null = storageOrNull(),
  options: PersistOptions = {},
): void {
  if (!storage) return;
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
    storage.setItem(EXTENSION_PACKAGES_STORAGE_KEY, JSON.stringify([...retained, ...normalized]));
    retainedInstalledPackageRecords = retained;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not persist extension packages: ${message}`, { cause: error });
  }
}

interface ExtensionPackageStoreState {
  packages: InstalledExtensionPackage[];
  setPackages(packages: InstalledExtensionPackage[]): void;
  upsertPackage(pkg: InstalledExtensionPackage): void;
  removePackage(id: string): void;
  setPackageEnabled(id: string, enabled: boolean): void;
}

function commit(
  packages: InstalledExtensionPackage[],
  options: PersistOptions = {},
): InstalledExtensionPackage[] {
  const normalized = normalizeInstalledPackages(packages);
  persistInstalledPackages(normalized, undefined, options);
  return normalized;
}

export const useExtensionPackageStore = create<ExtensionPackageStoreState>((set) => ({
  packages: loadInstalledPackages(),
  setPackages: (packages) => set({ packages: commit(packages, { retainUnreadable: false }) }),
  upsertPackage: (pkg) =>
    set((state) => ({
      packages: commit(
        [
          ...state.packages.filter((existing) => existing.id !== pkg.id),
          { ...pkg, updatedAt: Date.now() },
        ],
        { dropRetainedIds: [pkg.id] },
      ),
    })),
  removePackage: (id) =>
    set((state) => ({
      packages: commit(state.packages.filter((pkg) => pkg.id !== id), { dropRetainedIds: [id] }),
    })),
  setPackageEnabled: (id, enabled) =>
    set((state) => ({
      packages: commit(
        state.packages.map((pkg) =>
          pkg.id === id ? { ...pkg, enabled, updatedAt: Date.now() } : pkg,
        ),
      ),
    })),
}));
