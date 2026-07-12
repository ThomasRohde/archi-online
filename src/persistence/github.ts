import { defaultKeyValueStore, type AsyncKeyValueStore } from './keyval';
import { isArchimateZip } from '../model/io/archimate-xml';
import { MAX_DOCUMENT_BYTES } from '../model/io/document-limits';

export const GITHUB_TOKEN_KEY = 'archi-online.github.token';

export interface SaveGistRequest {
  token: string;
  gistId?: string;
  documentBytes: Uint8Array;
  fileName: string;
  public: boolean;
}

export interface SavedGist {
  id: string;
  htmlUrl: string;
  rawUrl: string;
}

interface GitHubGistFile {
  raw_url?: string;
}

interface GitHubGistResponse {
  id: string;
  html_url?: string;
  files?: Record<string, GitHubGistFile>;
}

export class GitHubPersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GitHubPersistenceError';
  }
}

export async function getStoredGitHubToken(
  store: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<string | undefined> {
  return store.get<string>(GITHUB_TOKEN_KEY);
}

export async function setStoredGitHubToken(
  token: string,
  store: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  const trimmed = token.trim();
  if (trimmed) await store.set(GITHUB_TOKEN_KEY, trimmed);
  else await store.del(GITHUB_TOKEN_KEY);
}

export async function saveModelGist(
  request: SaveGistRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SavedGist> {
  const method = request.gistId ? 'PATCH' : 'POST';
  const url = request.gistId
    ? `https://api.github.com/gists/${encodeURIComponent(request.gistId)}`
    : 'https://api.github.com/gists';
  const res = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${request.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: 'Archi Online shared model',
      ...(request.gistId ? {} : { public: request.public }),
      files: {
        [request.fileName || 'model.archimate']: {
          content: isArchimateZip(request.documentBytes)
            ? bytesToBase64(request.documentBytes)
            : new TextDecoder().decode(request.documentBytes),
        },
      },
    }),
  });
  if (!res.ok) throw await githubError(res, request.gistId ? 'Could not update gist' : 'Could not create gist');
  return savedGistFromResponse((await res.json()) as GitHubGistResponse);
}

export async function fetchGistArchimateXml(
  gistId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`https://api.github.com/gists/${encodeURIComponent(gistId)}`);
  if (!res.ok) throw await githubError(res, 'Could not load gist');
  const gist = (await res.json()) as GitHubGistResponse;
  const file = Object.entries(gist.files ?? {}).find(([name]) => name.endsWith('.archimate'))?.[1];
  if (!file?.raw_url) throw new GitHubPersistenceError('The gist does not contain a .archimate file.');
  return new TextDecoder().decode(await fetchRawArchimateBytes(file.raw_url, fetchImpl));
}

export async function fetchGistArchimateBytes(
  gistId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetchImpl(`https://api.github.com/gists/${encodeURIComponent(gistId)}`);
  if (!res.ok) throw await githubError(res, 'Could not load gist');
  const gist = (await res.json()) as GitHubGistResponse;
  const file = Object.entries(gist.files ?? {}).find(([name]) => name.endsWith('.archimate'))?.[1];
  if (!file?.raw_url) throw new GitHubPersistenceError('The gist does not contain a .archimate file.');
  return fetchRawArchimateBytes(file.raw_url, fetchImpl);
}

export async function fetchRawArchimateXml(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new GitHubPersistenceError('Shared raw model URL is not valid.', { cause });
  }
  if (parsed.protocol !== 'https:') {
    throw new GitHubPersistenceError('Shared raw model URLs must use HTTPS.');
  }
  if (!['raw.githubusercontent.com', 'gist.githubusercontent.com'].includes(parsed.hostname)) {
    throw new GitHubPersistenceError('Shared raw model URLs must point to GitHub raw content.');
  }
  return new TextDecoder().decode(await fetchRawArchimateBytes(parsed.href, fetchImpl));
}

export async function fetchRawArchimateBytes(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new GitHubPersistenceError('Shared raw model URL is not valid.', { cause });
  }
  if (parsed.protocol !== 'https:') {
    throw new GitHubPersistenceError('Shared raw model URLs must use HTTPS.');
  }
  if (!['raw.githubusercontent.com', 'gist.githubusercontent.com'].includes(parsed.hostname)) {
    throw new GitHubPersistenceError('Shared raw model URLs must point to GitHub raw content.');
  }
  const res = await fetchImpl(parsed.href);
  if (!res.ok) throw await githubError(res, 'Could not load shared model');
  const bytes = await readResponseBytes(res, Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 4);
  if (isArchimateZip(bytes) || new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().startsWith('<')) {
    if (bytes.length > MAX_DOCUMENT_BYTES) {
      throw new GitHubPersistenceError('Shared model exceeds the size limit.');
    }
    return bytes;
  }
  try {
    const decoded = base64ToBytes(new TextDecoder().decode(bytes).trim());
    if (decoded.length > MAX_DOCUMENT_BYTES) {
      throw new Error('Decoded archive exceeds the size limit');
    }
    return decoded;
  } catch (cause) {
    throw new GitHubPersistenceError('Shared model content is neither XML nor a base64 Archi archive.', {
      cause,
    });
  }
}

async function readResponseBytes(response: Response, limit: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new GitHubPersistenceError('Shared model exceeds the size limit.');
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new GitHubPersistenceError('Shared model exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function savedGistFromResponse(gist: GitHubGistResponse): SavedGist {
  const rawUrl = Object.values(gist.files ?? {}).find((file) => file.raw_url)?.raw_url;
  if (!gist.id || !rawUrl) {
    throw new GitHubPersistenceError('GitHub returned a gist without a raw model URL.');
  }
  return {
    id: gist.id,
    htmlUrl: gist.html_url ?? `https://gist.github.com/${gist.id}`,
    rawUrl,
  };
}

async function githubError(res: Response, fallback: string): Promise<GitHubPersistenceError> {
  try {
    const body = (await res.json()) as { message?: string };
    const details = body.message ? `: ${body.message}` : '';
    return new GitHubPersistenceError(`${fallback} (${res.status})${details}`);
  } catch {
    try {
      const text = await res.text();
      const details = text ? `: ${text}` : '';
      return new GitHubPersistenceError(`${fallback} (${res.status})${details}`);
    } catch {
      return new GitHubPersistenceError(`${fallback} (${res.status})`);
    }
  }
}
