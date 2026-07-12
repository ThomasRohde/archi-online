import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createModelAsset, referencedAssetPaths } from '../assets';
import type { ModelState } from '../types';
import { parseArchimate } from './archimate-xml/parse';
import { serializeArchimate } from './archimate-xml/serialize';

const MODEL_ENTRY = 'model.xml';

export async function parseArchimateDocument(bytes: Uint8Array): Promise<ModelState> {
  if (!isZip(bytes)) return parseArchimate(new TextDecoder().decode(bytes));
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch (cause) {
    throw new Error('Could not read Archi archive', { cause });
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
