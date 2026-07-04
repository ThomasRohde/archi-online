import type { LocalExtensionRecord } from './types';
import type {
  ExtensionManifestV2,
  ExtensionPackageInfo,
  InstalledExtensionPackage,
  InstalledPackageFile,
} from './package-types';

export const MAX_PACKAGE_FILES = 200;
export const MAX_PACKAGE_CONTENT_CHARS = 5_000_000;

interface MakePackageOptions {
  manifest: unknown;
  files: Record<string, unknown>;
  enabled?: boolean;
  now?: number;
  installedAt?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid package manifest: ${name} must be a non-empty string`);
  }
  return value.trim();
}

export function normalizePackagePath(path: string): string {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\')
  ) {
    throw new Error(`Unsafe package path: ${path}`);
  }
  const parts = path.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error(`Unsafe package path: ${path}`);
  }
  return parts.join('/');
}

export function parseExtensionManifest(value: unknown): ExtensionManifestV2 {
  if (!isRecord(value)) throw new Error('Invalid package manifest: expected object');
  if (value.schemaVersion !== 2) {
    throw new Error('Invalid package manifest: schemaVersion must be 2');
  }
  const id = assertNonEmptyString(value.id, 'id');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id)) {
    throw new Error('Invalid package manifest: id contains unsupported characters');
  }
  const name = assertNonEmptyString(value.name, 'name');
  const version = assertNonEmptyString(value.version, 'version');
  const main = normalizePackagePath(assertNonEmptyString(value.main, 'main'));
  const description =
    typeof value.description === 'string' && value.description.trim()
      ? value.description.trim()
      : undefined;

  return {
    schemaVersion: 2,
    id,
    name,
    version,
    ...(description ? { description } : {}),
    main,
    ...(isRecord(value.contributes)
      ? { contributes: value.contributes as ExtensionManifestV2['contributes'] }
      : {}),
  };
}

function normalizePackageFile(value: unknown, path: string): InstalledPackageFile {
  if (!isRecord(value)) throw new Error(`Invalid package file record: ${path}`);
  if (value.encoding !== 'utf8' && value.encoding !== 'base64') {
    throw new Error(`Invalid package file encoding: ${path}`);
  }
  if (typeof value.content !== 'string') {
    throw new Error(`Invalid package file content: ${path}`);
  }
  const mediaType = typeof value.mediaType === 'string' ? value.mediaType : undefined;
  return {
    ...(mediaType ? { mediaType } : {}),
    encoding: value.encoding,
    content: value.content,
  };
}

export function normalizePackageFiles(
  value: Record<string, unknown>,
): Record<string, InstalledPackageFile> {
  const entries = Object.entries(value);
  if (entries.length > MAX_PACKAGE_FILES) {
    throw new Error(`Package has too many files: ${entries.length}`);
  }

  const files: Record<string, InstalledPackageFile> = {};
  let totalChars = 0;
  for (const [rawPath, rawFile] of entries) {
    const path = normalizePackagePath(rawPath);
    if (files[path]) throw new Error(`Duplicate package path after normalization: ${path}`);
    const file = normalizePackageFile(rawFile, path);
    totalChars += file.content.length;
    if (totalChars > MAX_PACKAGE_CONTENT_CHARS) {
      throw new Error('Package is too large for browser storage');
    }
    files[path] = file;
  }
  return files;
}

export function makeInstalledPackage(options: MakePackageOptions): InstalledExtensionPackage {
  const manifest = parseExtensionManifest(options.manifest);
  const files = normalizePackageFiles(options.files);
  if (!files['manifest.json']) throw new Error('Package is missing manifest.json');
  if (!files[manifest.main]) throw new Error(`Package is missing main file: ${manifest.main}`);
  if (files[manifest.main].encoding !== 'utf8') {
    throw new Error(`Package main file must be UTF-8 text: ${manifest.main}`);
  }
  const now = options.now ?? Date.now();
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: options.enabled ?? true,
    manifest,
    files,
    installedAt: options.installedAt ?? now,
    updatedAt: now,
  };
}

export function readPackageTextFile(pkg: InstalledExtensionPackage, path: string): string {
  const normalized = normalizePackagePath(path);
  const file = pkg.files[normalized];
  if (!file) throw new Error(`Package file not found: ${normalized}`);
  if (file.encoding !== 'utf8') throw new Error(`Package file is not text: ${normalized}`);
  return file.content;
}

export function readPackageJsonFile(pkg: InstalledExtensionPackage, path: string): unknown {
  try {
    return JSON.parse(readPackageTextFile(pkg, path));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid package JSON file ${normalizePackagePath(path)}: ${message}`, {
      cause: error,
    });
  }
}

export function cloneManifest(manifest: ExtensionManifestV2): ExtensionManifestV2 {
  return JSON.parse(JSON.stringify(manifest)) as ExtensionManifestV2;
}

export function flattenInstalledPackage(pkg: InstalledExtensionPackage): LocalExtensionRecord {
  return {
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    enabled: pkg.enabled,
    source: readPackageTextFile(pkg, pkg.manifest.main),
    createdAt: pkg.installedAt,
    updatedAt: pkg.updatedAt,
  };
}

export function packageInfo(pkg: InstalledExtensionPackage): ExtensionPackageInfo {
  return {
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    ...(pkg.manifest.description ? { description: pkg.manifest.description } : {}),
    main: pkg.manifest.main,
    ...(pkg.manifest.contributes ? { contributes: cloneManifest(pkg.manifest).contributes } : {}),
    files: Object.keys(pkg.files).sort(),
    installedAt: pkg.installedAt,
    updatedAt: pkg.updatedAt,
  };
}
