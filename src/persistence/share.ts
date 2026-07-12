import { deflateSync, Inflate } from 'fflate';
import { parseArchimateDocument, serializeArchimateDocument } from '../model/io/archimate-xml';
import {
  MAX_INLINE_COMPRESSED_BYTES,
  MAX_INLINE_DOCUMENT_BYTES,
} from '../model/io/document-limits';
import type { ModelState } from '../model/types';
import {
  fetchGistArchimateBytes,
  fetchRawArchimateBytes,
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
  | { kind: 'inline'; payload: string; initialViewId?: string }
  | { kind: 'gist'; gistId: string; initialViewId?: string }
  | { kind: 'raw'; url: string; initialViewId?: string }
  | { kind: 'none' };

export interface DecodedInlineModel {
  documentBytes: Uint8Array;
  model: ModelState;
}

export interface LoadedSharedModel {
  documentBytes: Uint8Array;
  model: ModelState;
  fileName: string;
  sourceLabel: string;
  initialViewId?: string;
}

export class ShareLinkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ShareLinkError';
  }
}

export async function encodeModelToInlineShare(
  model: ModelState,
  baseHref = viewerBaseHref(),
  initialViewId?: string,
): Promise<InlineShare> {
  const documentBytes = await serializeArchimateDocument(model);
  const payload = bytesToBase64Url(deflateSync(documentBytes));
  const href = `${baseHref}?mode=viewer#${shareFragment({ m: payload, view: initialViewId })}`;
  return {
    kind: 'inline',
    payload,
    href,
    encodedLength: payload.length,
    exceedsThreshold: payload.length > INLINE_SHARE_THRESHOLD,
  };
}

export async function decodeInlineSharePayload(payload: string): Promise<DecodedInlineModel> {
  try {
    const bytes = base64UrlToBytes(payload);
    const documentBytes = inflateWithLimit(bytes, MAX_INLINE_DOCUMENT_BYTES);
    return { documentBytes, model: await parseArchimateDocument(documentBytes) };
  } catch (cause) {
    throw new ShareLinkError('Could not decode shared model. The link may be incomplete or corrupted.', {
      cause,
    });
  }
}

export function parseShareFragment(hash: string): ShareFragment {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const initialViewId = params.get('view') || undefined;
  const payload = params.get('m');
  if (payload) return { kind: 'inline', payload, initialViewId };
  const gistId = params.get('gist');
  if (gistId) return { kind: 'gist', gistId, initialViewId };
  const rawUrl = params.get('raw');
  if (rawUrl) return { kind: 'raw', url: rawUrl, initialViewId };
  return { kind: 'none' };
}

export async function loadSharedModelFromLocation(
  location: Pick<Location, 'hash'>,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedSharedModel> {
  const source = parseShareFragment(location.hash);
  if (source.kind === 'inline') {
    const decoded = await decodeInlineSharePayload(source.payload);
    return {
      ...decoded,
      fileName: `${safeFileName(decoded.model.info.name)}.archimate`,
      sourceLabel: 'shared link',
      initialViewId: existingViewId(decoded.model, source.initialViewId),
    };
  }
  if (source.kind === 'gist') {
    const documentBytes = await fetchGistArchimateBytes(source.gistId, fetchImpl);
    const model = await parseArchimateDocument(documentBytes);
    return {
      documentBytes,
      model,
      fileName: `gist-${source.gistId}.archimate`,
      sourceLabel: `gist ${source.gistId}`,
      initialViewId: existingViewId(model, source.initialViewId),
    };
  }
  if (source.kind === 'raw') {
    const documentBytes = await fetchRawArchimateBytes(source.url, fetchImpl);
    const model = await parseArchimateDocument(documentBytes);
    return {
      documentBytes,
      model,
      fileName: source.url.split('/').pop() || 'shared.archimate',
      sourceLabel: source.url,
      initialViewId: existingViewId(model, source.initialViewId),
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

export function gistShareHref(
  gistId: string,
  baseHref = viewerBaseHref(),
  initialViewId?: string,
): string {
  return `${baseHref}?mode=viewer#${shareFragment({ gist: gistId, view: initialViewId })}`;
}

export function rawShareHref(
  rawUrl: string,
  baseHref = viewerBaseHref(),
  initialViewId?: string,
): string {
  return `${baseHref}?mode=viewer#${shareFragment({ raw: rawUrl, view: initialViewId })}`;
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
  if (value.length > Math.ceil(MAX_INLINE_COMPRESSED_BYTES * 4 / 3) + 4) {
    throw new Error('Inline share exceeds the compressed size limit');
  }
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  if (binary.length > MAX_INLINE_COMPRESSED_BYTES) {
    throw new Error('Inline share exceeds the compressed size limit');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function inflateWithLimit(bytes: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const inflater = new Inflate((chunk) => {
    length += chunk.length;
    if (length > limit) throw new Error('Inline share exceeds the uncompressed size limit');
    chunks.push(chunk);
  });
  inflater.push(bytes, true);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function shareFragment(values: { m?: string; gist?: string; raw?: string; view?: string }): string {
  const params = new URLSearchParams();
  if (values.m) params.set('m', values.m);
  if (values.gist) params.set('gist', values.gist);
  if (values.raw) params.set('raw', values.raw);
  if (values.view) params.set('view', values.view);
  return params.toString();
}

function existingViewId(model: ModelState, viewId: string | undefined): string | undefined {
  return viewId && model.views[viewId] ? viewId : undefined;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shared-model';
}
