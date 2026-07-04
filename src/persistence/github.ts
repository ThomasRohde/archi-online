import { defaultKeyValueStore, type AsyncKeyValueStore } from './keyval';

export const GITHUB_TOKEN_KEY = 'archi-online.github.token';

export interface SaveGistRequest {
  token: string;
  gistId?: string;
  xml: string;
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
        [request.fileName || 'model.archimate']: { content: request.xml },
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
  return fetchRawArchimateXml(file.raw_url, fetchImpl);
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
  const res = await fetchImpl(parsed.href);
  if (!res.ok) throw await githubError(res, 'Could not load shared model');
  return res.text();
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
