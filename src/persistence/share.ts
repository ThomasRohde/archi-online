import { deflateSync, inflateSync } from 'fflate';
import { parseArchimate, serializeArchimate } from '../model/io/archimate-xml';
import type { ModelState } from '../model/types';
import {
  fetchGistArchimateXml,
  fetchRawArchimateXml,
  saveModelGist,
  type SaveGistRequest,
} from './github';
import { defaultKeyValueStore, type AsyncKeyValueStore } from './keyval';

export const INLINE_SHARE_THRESHOLD = 8 * 1024;
export const MODEL_GIST_ASSOCIATIONS_KEY = 'archi-online.share.gists';

export interface InlineShare {
  kind: 'inline';
  payload: string;
  href: string;
  encodedLength: number;
  exceedsThreshold: boolean;
}

export type ShareFragment =
  | { kind: 'inline'; payload: string }
  | { kind: 'gist'; gistId: string }
  | { kind: 'raw'; url: string }
  | { kind: 'none' };

export interface DecodedInlineModel {
  xml: string;
  model: ModelState;
}

export interface LoadedSharedModel {
  xml: string;
  model: ModelState;
  fileName: string;
  sourceLabel: string;
}

export class ShareLinkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ShareLinkError';
  }
}

export function encodeModelToInlineShare(
  model: ModelState,
  baseHref = viewerBaseHref(),
): InlineShare {
  const xml = serializeArchimate(model);
  const payload = bytesToBase64Url(deflateSync(new TextEncoder().encode(xml)));
  const href = `${baseHref}?mode=viewer#m=${payload}`;
  return {
    kind: 'inline',
    payload,
    href,
    encodedLength: payload.length,
    exceedsThreshold: payload.length > INLINE_SHARE_THRESHOLD,
  };
}

export function decodeInlineSharePayload(payload: string): DecodedInlineModel {
  try {
    const bytes = base64UrlToBytes(payload);
    const xml = new TextDecoder().decode(inflateSync(bytes));
    return { xml, model: parseArchimate(xml) };
  } catch (cause) {
    throw new ShareLinkError('Could not decode shared model. The link may be incomplete or corrupted.', {
      cause,
    });
  }
}

export function parseShareFragment(hash: string): ShareFragment {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const payload = params.get('m');
  if (payload) return { kind: 'inline', payload };
  const gistId = params.get('gist');
  if (gistId) return { kind: 'gist', gistId };
  const rawUrl = params.get('raw');
  if (rawUrl) return { kind: 'raw', url: rawUrl };
  return { kind: 'none' };
}

export async function loadSharedModelFromLocation(
  location: Pick<Location, 'hash'>,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedSharedModel> {
  const source = parseShareFragment(location.hash);
  if (source.kind === 'inline') {
    const decoded = decodeInlineSharePayload(source.payload);
    return {
      ...decoded,
      fileName: `${safeFileName(decoded.model.info.name)}.archimate`,
      sourceLabel: 'shared link',
    };
  }
  if (source.kind === 'gist') {
    const xml = await fetchGistArchimateXml(source.gistId, fetchImpl);
    return {
      xml,
      model: parseArchimate(xml),
      fileName: `gist-${source.gistId}.archimate`,
      sourceLabel: `gist ${source.gistId}`,
    };
  }
  if (source.kind === 'raw') {
    const xml = await fetchRawArchimateXml(source.url, fetchImpl);
    return {
      xml,
      model: parseArchimate(xml),
      fileName: source.url.split('/').pop() || 'shared.archimate',
      sourceLabel: source.url,
    };
  }
  throw new ShareLinkError('This URL does not contain a shared ArchiMate model.');
}

export async function saveShareGistForModel(
  request: Omit<SaveGistRequest, 'gistId'> & { modelId: string },
  store: AsyncKeyValueStore = defaultKeyValueStore(),
  fetchImpl: typeof fetch = fetch,
) {
  const remembered = await getRememberedGistId(request.modelId, store);
  const saved = await saveModelGist({ ...request, gistId: remembered }, fetchImpl);
  await rememberGistId(request.modelId, saved.id, store);
  return saved;
}

export async function getRememberedGistId(
  modelId: string,
  store: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<string | undefined> {
  const map = (await store.get<Record<string, string>>(MODEL_GIST_ASSOCIATIONS_KEY)) ?? {};
  return map[modelId];
}

export async function rememberGistId(
  modelId: string,
  gistId: string,
  store: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  const map = (await store.get<Record<string, string>>(MODEL_GIST_ASSOCIATIONS_KEY)) ?? {};
  await store.set(MODEL_GIST_ASSOCIATIONS_KEY, { ...map, [modelId]: gistId });
}

export function gistShareHref(gistId: string, baseHref = viewerBaseHref()): string {
  return `${baseHref}?mode=viewer#gist=${encodeURIComponent(gistId)}`;
}

export function rawShareHref(rawUrl: string, baseHref = viewerBaseHref()): string {
  return `${baseHref}?mode=viewer#raw=${encodeURIComponent(rawUrl)}`;
}

function viewerBaseHref(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shared-model';
}
