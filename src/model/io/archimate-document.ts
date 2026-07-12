import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createModelAsset, referencedAssetPaths } from '../assets';
import type { ModelState } from '../types';
import { parseArchimate } from './archimate-xml/parse';
import { serializeArchimate } from './archimate-xml/serialize';
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_MODEL_XML_BYTES,
} from './document-limits';

const MODEL_ENTRY = 'model.xml';

export async function parseArchimateDocument(bytes: Uint8Array): Promise<ModelState> {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Archi document exceeds the size limit');
  if (!isZip(bytes)) {
    if (bytes.length > MAX_MODEL_XML_BYTES) throw new Error('model.xml exceeds the size limit');
    return parseArchimate(new TextDecoder().decode(bytes));
  }
  let archive: Record<string, Uint8Array>;
  try {
    let entryCount = 0;
    let totalBytes = 0;
    archive = unzipSync(bytes, {
      filter: (entry) => {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw new Error(`Archi archive contains more than ${MAX_ARCHIVE_ENTRIES} entries`);
        }
        totalBytes += entry.originalSize;
        if (totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
          throw new Error('Archi archive exceeds the uncompressed size limit');
        }
        if (entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES) {
          throw new Error(`Archi archive entry exceeds the size limit: ${entry.name}`);
        }
        if (entry.name === MODEL_ENTRY && entry.originalSize > MAX_MODEL_XML_BYTES) {
          throw new Error('model.xml exceeds the size limit');
        }
        return entry.name === MODEL_ENTRY || safeImagePath(entry.name);
      },
    });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new Error(`Could not read Archi archive${detail}`, { cause });
  }
  const modelXml = archive[MODEL_ENTRY];
  if (!modelXml) throw new Error('Archi archive is missing model.xml');
  const state = parseArchimate(strFromU8(modelXml));
  for (const [path, assetBytes] of Object.entries(archive)) {
    if (!path.startsWith('images/') || path.endsWith('/')) continue;
    state.assets[path] = await createModelAsset(path, assetBytes);
  }
  return state;
}

export async function serializeArchimateDocument(state: ModelState): Promise<Uint8Array> {
  const xml = strToU8(serializeArchimate(state));
  const paths = referencedAssetPaths(state);
  if (paths.size === 0) return xml;
  const entries: Record<string, Uint8Array> = { [MODEL_ENTRY]: xml };
  for (const path of paths) {
    const asset = state.assets[path];
    if (!asset) throw new Error(`Referenced image is missing from the model archive: ${path}`);
    entries[path] = asset.bytes;
  }
  return zipSync(entries, { level: 6 });
}

export function isArchimateZip(bytes: Uint8Array): boolean {
  return isZip(bytes);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
}

function safeImagePath(path: string): boolean {
  return path.startsWith('images/') &&
    !path.endsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').includes('..');
}
