import { decodeTiff, encodePng } from 'image-js';
import type { ModelAsset, ModelState } from './types';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from './io/document-limits';

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

const dataUrlCache = new WeakMap<ModelAsset, string>();

export function imageExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!(extension in MEDIA_TYPES)) throw new Error(`Unsupported image format: ${fileName}`);
  return extension === 'jpeg' ? 'jpg' : extension === 'tiff' ? 'tif' : extension;
}

export function mediaTypeForPath(path: string): string {
  return MEDIA_TYPES[imageExtension(path)];
}

export async function createModelAsset(
  path: string,
  source: Uint8Array,
  mediaType = mediaTypeForPath(path),
): Promise<ModelAsset> {
  if (source.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds the size limit');
  assertImageDimensions(source, mediaType);
  const bytes = source.slice();
  let renderMediaType = mediaType;
  let renderBytes = bytes;
  if (mediaType === 'image/tiff') {
    renderBytes = new Uint8Array(encodePng(decodeTiff(bytes)));
    renderMediaType = 'image/png';
  }
  return {
    path,
    mediaType,
    bytes,
    renderMediaType,
    renderBytes,
    sha256: sha256Hex(bytes),
  };
}

function assertImageDimensions(bytes: Uint8Array, mediaType: string): void {
  const dimensions = imageDimensions(bytes, mediaType);
  if (!dimensions) return;
  const [width, height] = dimensions;
  if (
    width < 1 || height < 1 ||
    width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error(`Image dimensions exceed the limit: ${width}x${height}`);
  }
}

function imageDimensions(bytes: Uint8Array, mediaType: string): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mediaType === 'image/png' && bytes.length >= 24) {
    return [view.getUint32(16, false), view.getUint32(20, false)];
  }
  if (mediaType === 'image/gif' && bytes.length >= 10) {
    return [view.getUint16(6, true), view.getUint16(8, true)];
  }
  if (mediaType === 'image/bmp' && bytes.length >= 26) {
    return [Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true))];
  }
  if (mediaType === 'image/x-icon' && bytes.length >= 8) {
    return [bytes[6] || 256, bytes[7] || 256];
  }
  if (mediaType === 'image/jpeg') return jpegDimensions(bytes, view);
  if (mediaType === 'image/tiff') return tiffDimensions(bytes, view);
  return undefined;
}

function jpegDimensions(bytes: Uint8Array, view: DataView): [number, number] | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return [view.getUint16(offset + 7, false), view.getUint16(offset + 5, false)];
    }
    offset += 2 + length;
  }
  return undefined;
}

function tiffDimensions(bytes: Uint8Array, view: DataView): [number, number] | undefined {
  if (bytes.length < 10) return undefined;
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) return undefined;
  const directory = view.getUint32(4, littleEndian);
  if (directory + 2 > bytes.length) return undefined;
  const count = view.getUint16(directory, littleEndian);
  let width: number | undefined;
  let height: number | undefined;
  for (let index = 0; index < count; index++) {
    const offset = directory + 2 + index * 12;
    if (offset + 12 > bytes.length) break;
    const tag = view.getUint16(offset, littleEndian);
    if (tag !== 256 && tag !== 257) continue;
    const type = view.getUint16(offset + 2, littleEndian);
    const value = type === 3
      ? view.getUint16(offset + 8, littleEndian)
      : view.getUint32(offset + 8, littleEndian);
    if (tag === 256) width = value;
    else height = value;
  }
  return width !== undefined && height !== undefined ? [width, height] : undefined;
}

export function assetDataUrl(asset: ModelAsset): string {
  const cached = dataUrlCache.get(asset);
  if (cached !== undefined) return cached;
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < asset.renderBytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...asset.renderBytes.subarray(offset, offset + chunkSize));
  }
  const url = `data:${asset.renderMediaType};base64,${btoa(binary)}`;
  dataUrlCache.set(asset, url);
  return url;
}

export function referencedAssetPaths(state: ModelState): Set<string> {
  const paths = new Set<string>();
  for (const profile of Object.values(state.profiles)) {
    if (profile.imagePath) paths.add(profile.imagePath);
  }
  for (const node of Object.values(state.nodes)) {
    if (node.imagePath) paths.add(node.imagePath);
    if (node.nodeType === 'element' && node.imageSource === 0) {
      const element = state.elements[node.elementId];
      const profilePath = element && state.profiles[element.profileIds[0]]?.imagePath;
      if (profilePath) paths.add(profilePath);
    }
  }
  return paths;
}

export function pruneUnreferencedAssets(state: ModelState): void {
  const referenced = referencedAssetPaths(state);
  for (const path of Object.keys(state.assets)) {
    if (!referenced.has(path)) delete state.assets[path];
  }
}

function sha256Hex(bytes: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotate(words[i - 15], 7) ^ rotate(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotate(words[i - 2], 17) ^ rotate(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + constants[i] + words[i]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}
