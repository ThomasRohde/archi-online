import { create } from 'zustand';
import type { InstalledExtensionPackage } from './package-types';
import { makeInstalledPackage } from './package-validation';

export const EXTENSION_PACKAGES_STORAGE_KEY = 'archi-online.extension-packages.v2';

type ExtensionPackageStorage = Pick<Storage, 'getItem' | 'setItem'>;

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
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const packages: InstalledExtensionPackage[] = [];
  for (const item of value) {
    const pkg = normalizeInstalledPackage(item);
    if (!pkg || seen.has(pkg.id)) continue;
    seen.add(pkg.id);
    packages.push(pkg);
  }
  return packages;
}

export function loadInstalledPackages(
  storage: ExtensionPackageStorage | null = storageOrNull(),
): InstalledExtensionPackage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EXTENSION_PACKAGES_STORAGE_KEY);
    if (!raw) return [];
    return normalizeInstalledPackages(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistInstalledPackages(
  packages: InstalledExtensionPackage[],
  storage: ExtensionPackageStorage | null = storageOrNull(),
): void {
  if (!storage) return;
  try {
    storage.setItem(EXTENSION_PACKAGES_STORAGE_KEY, JSON.stringify(normalizeInstalledPackages(packages)));
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

function commit(packages: InstalledExtensionPackage[]): InstalledExtensionPackage[] {
  const normalized = normalizeInstalledPackages(packages);
  persistInstalledPackages(normalized);
  return normalized;
}

export const useExtensionPackageStore = create<ExtensionPackageStoreState>((set) => ({
  packages: loadInstalledPackages(),
  setPackages: (packages) => set({ packages: commit(packages) }),
  upsertPackage: (pkg) =>
    set((state) => ({
      packages: commit([
        ...state.packages.filter((existing) => existing.id !== pkg.id),
        { ...pkg, updatedAt: Date.now() },
      ]),
    })),
  removePackage: (id) =>
    set((state) => ({
      packages: commit(state.packages.filter((pkg) => pkg.id !== id)),
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
