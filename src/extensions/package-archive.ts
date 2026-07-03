import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { InstalledExtensionPackage, InstalledPackageFile } from './package-types';
import type { LocalExtensionRecord } from './types';
import {
  cloneManifest,
  makeInstalledPackage,
  normalizePackagePath,
} from './package-validation';

export const ARCHI_EXTENSION_MIME = 'application/vnd.archi-online.extension+zip';

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

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += BASE64_CHARS[(triplet >> 18) & 63];
    output += BASE64_CHARS[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? BASE64_CHARS[triplet & 63] : '=';
  }
  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_CHARS.indexOf(clean[i]);
    const b = BASE64_CHARS.indexOf(clean[i + 1]);
    const c = clean[i + 2] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 2]);
    const d = clean[i + 3] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (a < 0 || b < 0 || (c < 0 && clean[i + 2] !== '=') || (d < 0 && clean[i + 3] !== '=')) {
      throw new Error('Invalid base64 package file content');
    }
    const triplet = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    bytes.push((triplet >> 16) & 255);
    if (c >= 0) bytes.push((triplet >> 8) & 255);
    if (d >= 0) bytes.push(triplet & 255);
  }
  return new Uint8Array(bytes);
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

export async function readExtensionArchive(
  input: Blob | ArrayBuffer | Uint8Array,
  now = Date.now(),
): Promise<InstalledExtensionPackage> {
  const archive = unzipSync(await inputToBytes(input));
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
