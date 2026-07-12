import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GITHUB_TOKEN_KEY,
  fetchGistArchimateXml,
  fetchRawArchimateXml,
  getStoredGitHubToken,
  saveModelGist,
  setStoredGitHubToken,
} from '../src/persistence/github';
import { memoryKeyValueStore } from '../src/persistence/keyval';
import { zipSync } from 'fflate';

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
    ...init,
  });
}

describe('GitHub persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and clears a GitHub token through the key-value store', async () => {
    const store = memoryKeyValueStore();

    await setStoredGitHubToken('ghp_secret', store);
    expect(await getStoredGitHubToken(store)).toBe('ghp_secret');

    await setStoredGitHubToken('', store);
    expect(await store.get(GITHUB_TOKEN_KEY)).toBeUndefined();
  });

  it('creates a secret gist by default', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: 'abc123',
        html_url: 'https://gist.github.com/me/abc123',
        files: { 'model.archimate': { raw_url: 'https://gist.githubusercontent.com/raw/abc' } },
      }),
    );

    const saved = await saveModelGist(
      {
        token: 'ghp_secret',
        documentBytes: new TextEncoder().encode('<model />'),
        fileName: 'model.archimate',
        public: false,
      },
      fetchImpl,
    );

    expect(saved.id).toBe('abc123');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/gists',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_secret' }),
        body: JSON.stringify({
          description: 'Archi Online shared model',
          public: false,
          files: { 'model.archimate': { content: '<model />' } },
        }),
      }),
    );
  });

  it('updates an existing gist without trying to change visibility', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: 'abc123',
        html_url: 'https://gist.github.com/me/abc123',
        files: { 'updated.archimate': { raw_url: 'https://gist.githubusercontent.com/raw/updated' } },
      }),
    );

    await saveModelGist(
      {
        token: 'ghp_secret',
        gistId: 'abc123',
        documentBytes: new TextEncoder().encode('<model />'),
        fileName: 'updated.archimate',
        public: true,
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/gists/abc123',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.public).toBeUndefined();
    expect(body.files['updated.archimate'].content).toBe('<model />');
  });

  it('stores image-bearing ZIP documents as base64 gist content', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: 'zip123',
        files: { 'model.archimate': { raw_url: 'https://gist.githubusercontent.com/raw/zip' } },
      }),
    );
    const documentBytes = zipSync({ 'model.xml': new TextEncoder().encode('<model />') });

    await saveModelGist({
      token: 'ghp_secret',
      documentBytes,
      fileName: 'model.archimate',
      public: false,
    }, fetchImpl);

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const decoded = Uint8Array.from(atob(body.files['model.archimate'].content), (char) => char.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(documentBytes));
  });

  it('loads the first archimate raw file from a public gist', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          files: {
            'notes.txt': { raw_url: 'https://gist.githubusercontent.com/raw/notes' },
            'model.archimate': { raw_url: 'https://gist.githubusercontent.com/raw/model' },
          },
        }),
      )
      .mockResolvedValueOnce(response('<archimate:model />'));

    await expect(fetchGistArchimateXml('abc123', fetchImpl)).resolves.toBe('<archimate:model />');
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://api.github.com/gists/abc123');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://gist.githubusercontent.com/raw/model');
  });

  it('loads raw GitHub URLs without authentication', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response('<model />'));

    await expect(
      fetchRawArchimateXml('https://raw.githubusercontent.com/o/r/main/model.archimate', fetchImpl),
    ).resolves.toBe('<model />');
  });

  it('rejects non-GitHub raw URLs', async () => {
    await expect(fetchRawArchimateXml('https://example.test/model.archimate')).rejects.toThrow(
      /GitHub raw content/,
    );
  });
});
