import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { InstalledExtensionPackage, InstalledPackageFile } from './package-types';
import type { LocalExtensionRecord } from './types';
import {
  MAX_PACKAGE_CONTENT_CHARS,
  cloneManifest,
  makeInstalledPackage,
  normalizePackagePath,
} from './package-validation';

export const ARCHI_EXTENSION_MIME = 'application/vnd.archi-online.extension+zip';
export const MAX_EXTENSION_ARCHIVE_BYTES = 20_000_000;
export const MAX_EXTENSION_UNCOMPRESSED_BYTES = MAX_PACKAGE_CONTENT_CHARS;

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.md',
  '.svg',
  '.txt',
  '.xml',
]);

const BASE64_CHUNK_SIZE = 0x8000;

function mediaTypeForPath(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function isTextPath(path: string): boolean {
  const lower = path.toLowerCase();
  return [...TEXT_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(clean);
  } catch (error) {
    throw new Error('Invalid base64 package file content', { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function inputToBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

function fileToBytes(file: InstalledPackageFile): Uint8Array {
  if (file.encoding === 'utf8') return strToU8(file.content);
  return base64ToBytes(file.content);
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function unzipPackageArchive(inputBytes: Uint8Array): Record<string, Uint8Array> {
  let totalBytes = 0;
  const seen = new Set<string>();
  return unzipSync(inputBytes, {
    filter(file) {
      if (file.name.endsWith('/')) return false;
      const path = normalizePackagePath(file.name);
      if (seen.has(path)) {
        throw new Error(`Duplicate package path after normalization: ${path}`);
      }
      seen.add(path);
      totalBytes += file.originalSize;
      if (totalBytes > MAX_EXTENSION_UNCOMPRESSED_BYTES) {
        throw new Error('Uncompressed package content is too large to import');
      }
      return true;
    },
  });
}

export async function readExtensionArchive(
  input: Blob | ArrayBuffer | Uint8Array,
  now = Date.now(),
): Promise<InstalledExtensionPackage> {
  const inputBytes = await inputToBytes(input);
  if (inputBytes.byteLength > MAX_EXTENSION_ARCHIVE_BYTES) {
    throw new Error('Package archive is too large to import');
  }
  const archive = unzipPackageArchive(inputBytes);
  const files: Record<string, InstalledPackageFile> = {};
  for (const [rawPath, bytes] of Object.entries(archive)) {
    if (rawPath.endsWith('/')) continue;
    const path = normalizePackagePath(rawPath);
    if (files[path]) throw new Error(`Duplicate package path after normalization: ${path}`);
    const mediaType = mediaTypeForPath(path);
    files[path] = isTextPath(path)
      ? {
          ...(mediaType ? { mediaType } : {}),
          encoding: 'utf8',
          content: strFromU8(bytes),
        }
      : {
          ...(mediaType ? { mediaType } : {}),
          encoding: 'base64',
          content: bytesToBase64(bytes),
        };
  }

  const manifestFile = files['manifest.json'];
  if (!manifestFile) throw new Error('Package is missing manifest.json');
  if (manifestFile.encoding !== 'utf8') throw new Error('Package manifest.json must be text');

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid package manifest JSON: ${message}`, { cause: error });
  }

  return makeInstalledPackage({ manifest, files, enabled: true, now });
}

export function createArchiveBytesForPackage(pkg: InstalledExtensionPackage): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {};
  for (const [path, file] of Object.entries(pkg.files)) {
    const normalized = normalizePackagePath(path);
    zipFiles[normalized] = normalized === 'manifest.json'
      ? strToU8(JSON.stringify(cloneManifest(pkg.manifest), null, 2))
      : fileToBytes(file);
  }
  return zipSync(zipFiles, { level: 6 });
}

export function createArchiveBlobForPackage(pkg: InstalledExtensionPackage): Blob {
  return new Blob([blobPart(createArchiveBytesForPackage(pkg))], { type: ARCHI_EXTENSION_MIME });
}

export function createArchiveBytesForSourceRecord(record: LocalExtensionRecord): Uint8Array {
  return zipSync(
    {
      'manifest.json': strToU8(
        JSON.stringify(
          {
            schemaVersion: 2,
            id: record.id,
            name: record.name,
            version: record.version,
            main: 'main.js',
          },
          null,
          2,
        ),
      ),
      'main.js': strToU8(record.source),
    },
    { level: 6 },
  );
}

export function createArchiveBlobForSourceRecord(record: LocalExtensionRecord): Blob {
  return new Blob([blobPart(createArchiveBytesForSourceRecord(record))], {
    type: ARCHI_EXTENSION_MIME,
  });
}

export function extensionArchiveFileName(id: string, version: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const safeVersion = version.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  return `${safeId}-${safeVersion}.archi-ext`;
}
