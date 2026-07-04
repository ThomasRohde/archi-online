# Model Sharing Milestone 1 Viewer And Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M1 from `docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md`: read-only model viewing, inline share links, gist-backed links, public-source loading, open-copy editing, and stable gist reuse.

**Architecture:** Keep sharing and GitHub I/O as pure persistence modules, then add a read-only app branch that loads a shared model without autosave, layout persistence, or extension startup. Viewer UI reuses the existing model store, properties resolver, and SVG rendering, while store-level read-only guards prevent accidental mutation from scripting, UI, and event paths.

**Tech Stack:** Vite, React, TypeScript, Zustand, Immer, Vitest, jsdom, `fflate`, browser `fetch`, GitHub REST Gists API, IndexedDB via `src/persistence/keyval.ts`.

---

## Source Requirements

This plan implements M1 requirements R1-R6 from `docs/brainstorms/2026-07-04-model-sharing-and-review-requirements.md` and the Phase 1 section of `docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md`.

- R1: viewer mode renders read-only, switches views, pans/zooms, and inspects name, documentation, and properties.
- R2: small models encode entirely in the URL fragment.
- R3: large models upload to GitHub Gist with token, secret by default, public optional.
- R4: viewer opens fragment links, gist-backed links, public gist URLs, and raw GitHub `.archimate` URLs without auth.
- R5: viewer offers "Open a copy in the editor".
- R6: re-sharing the same model updates the remembered gist when possible.

## File Structure

- Create `src/persistence/share.ts`: share-link encoding, URL fragment parsing, shared-source loading, gist association persistence, and share-link URL builders.
- Create `src/persistence/github.ts`: minimal GitHub helpers for M1 only: PAT storage, gist create/update, public gist lookup, raw URL fetch, and error mapping.
- Create `src/ui/ViewerShell.tsx`: read-only viewer chrome with view selector, read-only canvas, read-only properties, error state, and open-copy button.
- Modify `src/model/store.ts`: add `readOnly`, extend `replaceModel`, guard all mutating transaction/undo/redo/tool paths.
- Modify `src/canvas/ViewEditor.tsx`: add an explicit read-only render path that keeps zoom controls and view rendering but skips edit interactions.
- Modify `src/ui/PropertiesPanel.tsx`: honor `readOnly` by disabling commit controls and hiding appearance editing in viewer mode.
- Modify `src/ui/dock/layout-config.tsx`: pass read-only through view panels and keep existing editor dock behavior unchanged.
- Modify `src/App.tsx`: detect viewer URLs, branch startup, skip autosave/layout/extensions in viewer, and switch from viewer to editor copy.
- Modify `src/ui/Toolbar.tsx`: add `Share...` command with inline-vs-gist flow.
- Modify `src/styles.css`: viewer shell layout and read-only properties affordances.
- Create `tests/share.test.ts`: inline encoding, URL parsing, malformed payloads, gist association persistence, public source loading.
- Create `tests/github.test.ts`: mocked gist create/update/read/raw fetch and token storage.
- Create `tests/readonly.test.ts`: store mutation guards and properties read-only behavior.

## Constants And Link Shapes

Use these URL shapes consistently:

- Inline model: `https://host/app/?mode=viewer#m=<base64url(fflate(xml))>`
- Gist-backed model: `https://host/app/?mode=viewer#gist=<gistId>`
- Raw file: `https://host/app/?mode=viewer#raw=<encodeURIComponent(rawUrl)>`

Use `INLINE_SHARE_THRESHOLD = 8 * 1024` encoded characters as the M1 threshold. The value is deliberately conservative for chat and email clients and can be tuned after driven browser verification.

---

### Task 1: Share Encoding And Shared Source Loading

**Files:**
- Create: `src/persistence/share.ts`
- Test: `tests/share.test.ts`

- [ ] **Step 1: Write failing share encoding tests**

Add `tests/share.test.ts` with these tests:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import {
  INLINE_SHARE_THRESHOLD,
  decodeInlineSharePayload,
  encodeModelToInlineShare,
  parseShareFragment,
} from '../src/persistence/share';

const archisuranceXml = readFileSync(
  join(__dirname, 'fixtures', 'Archisurance.archimate'),
  'utf8',
);

describe('share link encoding', () => {
  it('round-trips a model through an inline fragment payload', () => {
    const model = parseArchimate(archisuranceXml);
    const share = encodeModelToInlineShare(model, 'https://example.test/archi/');
    const decoded = decodeInlineSharePayload(share.payload);

    expect(parseArchimate(decoded.xml)).toEqual(parseArchimate(serializeArchimate(model)));
    expect(share.href).toBe(`https://example.test/archi/?mode=viewer#m=${share.payload}`);
    expect(share.encodedLength).toBe(share.payload.length);
  });

  it('reports whether an inline payload exceeds the threshold', () => {
    const model = parseArchimate(archisuranceXml);
    const share = encodeModelToInlineShare(model, 'https://example.test/archi/');

    expect(INLINE_SHARE_THRESHOLD).toBe(8 * 1024);
    expect(typeof share.exceedsThreshold).toBe('boolean');
    expect(share.exceedsThreshold).toBe(share.encodedLength > INLINE_SHARE_THRESHOLD);
  });

  it('parses supported viewer fragments', () => {
    expect(parseShareFragment('#m=abc')).toEqual({ kind: 'inline', payload: 'abc' });
    expect(parseShareFragment('#gist=12345')).toEqual({ kind: 'gist', gistId: '12345' });
    expect(parseShareFragment('#raw=https%3A%2F%2Fexample.test%2Fmodel.archimate')).toEqual({
      kind: 'raw',
      url: 'https://example.test/model.archimate',
    });
  });

  it('rejects malformed inline payloads with a share-specific error', () => {
    expect(() => decodeInlineSharePayload('not-valid-base64url!')).toThrow(
      /Could not decode shared model/,
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/share.test.ts`

Expected: FAIL because `src/persistence/share.ts` does not exist.

- [ ] **Step 3: Implement `src/persistence/share.ts`**

Create the module with this API and implementation:

```ts
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

export function encodeModelToInlineShare(model: ModelState, baseHref = viewerBaseHref()): InlineShare {
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
  return url.href.replace(/\/$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shared-model';
}
```

- [ ] **Step 4: Run the share tests**

Run: `npm test -- tests/share.test.ts`

Expected: FAIL because `src/persistence/github.ts` does not exist. This confirms the share module contract now exposes the next dependency.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/share.ts tests/share.test.ts
git commit -m "Add share link encoding contract"
```

---

### Task 2: Minimal GitHub Gist Persistence

**Files:**
- Create: `src/persistence/github.ts`
- Modify: `tests/share.test.ts`
- Test: `tests/github.test.ts`

- [ ] **Step 1: Write failing GitHub persistence tests**

Create `tests/github.test.ts`:

```ts
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
        xml: '<model />',
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

  it('updates an existing gist when a gist id is supplied', async () => {
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
        xml: '<model />',
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

    await expect(fetchRawArchimateXml('https://raw.githubusercontent.com/o/r/main/model.archimate', fetchImpl))
      .resolves.toBe('<model />');
  });
});
```

- [ ] **Step 2: Add gist association tests to `tests/share.test.ts`**

Append this test:

```ts
import { memoryKeyValueStore } from '../src/persistence/keyval';
import { getRememberedGistId, rememberGistId } from '../src/persistence/share';

it('remembers a gist id per model id', async () => {
  const store = memoryKeyValueStore();

  await rememberGistId('model-1', 'gist-1', store);
  await rememberGistId('model-2', 'gist-2', store);

  expect(await getRememberedGistId('model-1', store)).toBe('gist-1');
  expect(await getRememberedGistId('model-2', store)).toBe('gist-2');
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm test -- tests/github.test.ts tests/share.test.ts`

Expected: FAIL because `src/persistence/github.ts` is missing.

- [ ] **Step 4: Implement `src/persistence/github.ts`**

Create:

```ts
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
  const parsed = new URL(url);
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
  const firstRawUrl = Object.values(gist.files ?? {}).find((file) => file.raw_url)?.raw_url;
  if (!gist.id || !firstRawUrl) {
    throw new GitHubPersistenceError('GitHub returned a gist without a raw model URL.');
  }
  return {
    id: gist.id,
    htmlUrl: gist.html_url ?? `https://gist.github.com/${gist.id}`,
    rawUrl: firstRawUrl,
  };
}

async function githubError(res: Response, fallback: string): Promise<GitHubPersistenceError> {
  let details = '';
  try {
    const body = (await res.json()) as { message?: string };
    details = body.message ? `: ${body.message}` : '';
  } catch {
    details = '';
  }
  return new GitHubPersistenceError(`${fallback} (${res.status})${details}`);
}
```

- [ ] **Step 5: Run GitHub and share tests**

Run: `npm test -- tests/github.test.ts tests/share.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/persistence/github.ts tests/github.test.ts tests/share.test.ts
git commit -m "Add GitHub gist persistence"
```

---

### Task 3: Store-Level Read-Only Mode

**Files:**
- Modify: `src/model/store.ts`
- Modify: `tests/ops.test.ts`
- Test: `tests/readonly.test.ts`

- [ ] **Step 1: Write failing read-only store tests**

Create `tests/readonly.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { addElement, createEmptyModel, renameItem } from '../src/model/ops';
import {
  redo,
  replaceModel,
  setActiveTool,
  transact,
  undo,
  useStore,
} from '../src/model/store';

function state() {
  return useStore.getState();
}

describe('read-only store mode', () => {
  beforeEach(() => {
    replaceModel(createEmptyModel('Read Only'), null, false, { readOnly: true });
  });

  it('blocks model transactions and leaves dirty false', () => {
    const before = state().model;

    addElement('BusinessActor');
    transact('Direct test mutation', (draft) => {
      draft.info.name = 'Changed';
    });

    expect(state().model).toBe(before);
    expect(Object.keys(state().model!.elements)).toHaveLength(0);
    expect(state().model!.info.name).toBe('Read Only');
    expect(state().dirty).toBe(false);
    expect(state().undoStack).toHaveLength(0);
  });

  it('blocks undo, redo, and edit tools while still allowing select', () => {
    replaceModel(createEmptyModel('Editable'), null, false);
    const id = addElement('Capability', 'Cap');
    renameItem(id, 'Renamed');
    undo();
    replaceModel(useStore.getState().model, null, false, { readOnly: true });

    undo();
    redo();
    setActiveTool({ kind: 'create-note' });

    expect(state().activeTool).toEqual({ kind: 'select' });
    expect(state().dirty).toBe(false);
  });

  it('can return to editable mode when replacing the model', () => {
    replaceModel(createEmptyModel('Editable copy'), null, true, { readOnly: false });

    addElement('BusinessActor');

    expect(Object.keys(state().model!.elements)).toHaveLength(1);
    expect(state().dirty).toBe(true);
    expect(state().readOnly).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/readonly.test.ts`

Expected: FAIL because `replaceModel` does not accept read-only options and store state has no `readOnly`.

- [ ] **Step 3: Extend `src/model/store.ts`**

Patch these parts:

```ts
export interface AppState {
  model: ModelState | null;
  fileName: string | null;
  dirty: boolean;
  readOnly: boolean;
  undoStack: Transaction[];
  redoStack: Transaction[];
  selection: SelectionState;
  openViewIds: string[];
  activeViewId: string | null;
  activeTool: Tool;
  /** Bumped on every model replacement (new/open) so editors can reset viewport. */
  modelEpoch: number;
  /** True once startup restore (autosave) has finished; layout restore waits for it. */
  booted: boolean;
}

export interface ReplaceModelOptions {
  readOnly?: boolean;
}
```

Add `readOnly: false` to the initial store object.

Guard transactions and edit commands:

```ts
export function transact(label: string, recipe: (draft: ModelState) => void): void {
  const state = useStore.getState();
  if (!state.model || state.readOnly) return;
  const [next, patches, inverse] = produceWithPatches(state.model, recipe);
  if (patches.length === 0) return;
  if (batchDepth > 0) {
    batchPatches.push(...patches);
    batchInverse.unshift(...inverse);
    useStore.setState({ model: next, dirty: true });
  } else {
    useStore.setState((s) => ({
      model: next,
      dirty: true,
      undoStack: [...s.undoStack, { label, patches, inverse }].slice(-MAX_UNDO),
      redoStack: [],
    }));
  }
  pruneSelection();
}

export function undo(): void {
  const s = useStore.getState();
  if (s.readOnly) return;
  const tx = s.undoStack[s.undoStack.length - 1];
  if (!tx || !s.model) return;
  useStore.setState({
    model: applyPatches(s.model, tx.inverse),
    dirty: true,
    undoStack: s.undoStack.slice(0, -1),
    redoStack: [...s.redoStack, tx],
  });
  pruneSelection();
}

export function redo(): void {
  const s = useStore.getState();
  if (s.readOnly) return;
  const tx = s.redoStack[s.redoStack.length - 1];
  if (!tx || !s.model) return;
  useStore.setState({
    model: applyPatches(s.model, tx.patches),
    dirty: true,
    undoStack: [...s.undoStack, tx],
    redoStack: s.redoStack.slice(0, -1),
  });
  pruneSelection();
}
```

Extend `replaceModel` without breaking existing call sites:

```ts
export function replaceModel(
  model: ModelState | null,
  fileName: string | null,
  dirty = false,
  options: ReplaceModelOptions = {},
): void {
  useStore.setState((s) => ({
    model,
    fileName,
    dirty,
    readOnly: options.readOnly ?? false,
    undoStack: [],
    redoStack: [],
    selection: { source: 'tree', ids: [] },
    openViewIds: [],
    activeViewId: null,
    activeTool: { kind: 'select' },
    modelEpoch: s.modelEpoch + 1,
  }));
}
```

Guard tool changes:

```ts
export function setActiveTool(tool: Tool): void {
  const state = useStore.getState();
  if (state.readOnly && tool.kind !== 'select') return;
  useStore.setState({ activeTool: tool });
}
```

- [ ] **Step 4: Run read-only and existing ops tests**

Run: `npm test -- tests/readonly.test.ts tests/ops.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/store.ts tests/readonly.test.ts tests/ops.test.ts
git commit -m "Add read-only model state"
```

---

### Task 4: Read-Only Canvas Rendering

**Files:**
- Modify: `src/canvas/ViewEditor.tsx`
- Modify: `src/ui/dock/layout-config.tsx`
- Test: `tests/readonly.test.ts`

- [ ] **Step 1: Add a failing read-only canvas contract test**

Append this static export test to `tests/readonly.test.ts`:

```ts
import { ViewEditor } from '../src/canvas/ViewEditor';

it('exposes ViewEditor as a component that accepts readOnly', () => {
  const props: Parameters<typeof ViewEditor>[0] = { viewId: 'view-1', readOnly: true };
  expect(props.readOnly).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/readonly.test.ts`

Expected: FAIL because `ViewEditor` only accepts `{ viewId: string }`.

- [ ] **Step 3: Refactor `src/canvas/ViewEditor.tsx` to branch cleanly**

Change the exported component signature:

```ts
interface ViewEditorProps {
  viewId: string;
  readOnly?: boolean;
}

export function ViewEditor({ viewId, readOnly: readOnlyProp }: ViewEditorProps) {
  const readOnlyStore = useStore((s) => s.readOnly);
  const readOnly = readOnlyProp ?? readOnlyStore;
  return readOnly ? <ReadOnlyViewEditor viewId={viewId} /> : <EditableViewEditor viewId={viewId} />;
}
```

Rename the current body to `EditableViewEditor`.

Add a read-only component in the same file. It must use `useCanvasViewport`, render nodes/connections, support wheel zoom/scroll via the existing viewport hook, support middle-button panning, and show `ZoomControls`:

```tsx
function ReadOnlyViewEditor({ viewId }: { viewId: string }) {
  const model = useStore((s) => s.model);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const emptyMoveDelta = useMemo(() => new Map<string, Point>(), []);

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );
  const { viewport, setViewport, zoomTo, zoomBy, fitToView } = useCanvasViewport(
    viewId,
    svgRef,
    absBounds,
  );

  if (!model || !view) return null;

  return (
    <div className="view-editor read-only">
      <svg
        ref={svgRef}
        className="view-svg"
        style={{ cursor: panRef.current ? 'grabbing' : 'default' }}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: viewport.x,
            originY: viewport.y,
          };
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          setViewport({
            ...viewport,
            x: pan.originX + event.clientX - pan.startX,
            y: pan.originY + event.clientY - pan.startY,
          });
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {view.childIds.map((id) => (
            <NodeView
              key={id}
              model={model}
              nodeId={id}
              moveDelta={emptyMoveDelta}
              resize={null}
              dropParentId={null}
              connectSource={null}
              connectHover={null}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const src = absBounds.get(conn.sourceId);
              const tgt = absBounds.get(conn.targetId);
              if (!src || !tgt) return null;
              return (
                <ConnectionView
                  key={conn.id}
                  conn={conn}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={connectionPolyline(src, tgt, conn.bendpoints)}
                  selected={false}
                />
              );
            })}
          </g>
        </g>
      </svg>
      <ZoomControls viewport={viewport} zoomBy={zoomBy} zoomTo={zoomTo} fitToView={fitToView} />
    </div>
  );
}
```

Import `Point` from `src/canvas/geometry.ts` because `NodeView` requires `moveDelta: Map<string, Point>`.

- [ ] **Step 4: Pass read-only through dock view panels**

In `src/ui/dock/layout-config.tsx`, update `ViewPanel`:

```tsx
function ViewPanel(props: IDockviewPanelProps<{ viewId: string; readOnly?: boolean }>) {
  return (
    <div className="view-panel">
      <ViewEditor viewId={props.params.viewId} readOnly={props.params.readOnly} />
    </div>
  );
}
```

No other dock changes are needed for M1 because `ViewerShell` does not use `DockLayout`.

- [ ] **Step 5: Run typecheck and read-only tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test -- tests/readonly.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/ViewEditor.tsx src/ui/dock/layout-config.tsx tests/readonly.test.ts
git commit -m "Add read-only canvas rendering"
```

---

### Task 5: Read-Only Properties Inspection

**Files:**
- Modify: `src/ui/PropertiesPanel.tsx`
- Modify: `tests/readonly.test.ts`

- [ ] **Step 1: Write a failing read-only properties test**

Append to `tests/readonly.test.ts`:

```ts
import { resolveTarget } from '../src/ui/properties/target';

it('still resolves selected object details in read-only mode', () => {
  const editable = createEmptyModel('Inspectable');
  replaceModel(editable, null, false, { readOnly: true });
  const id = addElement('BusinessActor', 'Actor');

  expect(id).toBeDefined();
  expect(resolveTarget(state().model!, 'tree', [state().model!.info.id])?.name).toBe('Inspectable');
});
```

This test should fail before Task 3 is complete because `addElement` is blocked in read-only mode. Update it immediately in Step 3 to build the model before `replaceModel`.

- [ ] **Step 2: Run the test and verify the current failure**

Run: `npm test -- tests/readonly.test.ts`

Expected: FAIL with the assertion around the test model setup.

- [ ] **Step 3: Correct the test setup**

Replace the test body with:

```ts
it('still resolves selected object details in read-only mode', () => {
  const model = createEmptyModel('Inspectable');
  replaceModel(model, null, false);
  const id = addElement('BusinessActor', 'Actor');
  const loaded = state().model!;

  replaceModel(loaded, null, false, { readOnly: true });

  expect(resolveTarget(state().model!, 'tree', [id])?.name).toBe('Actor');
});
```

- [ ] **Step 4: Modify `PropertiesPanel` to honor `readOnly`**

Add:

```ts
const readOnly = useStore((s) => s.readOnly);
```

Pass `disabled={readOnly}` to every `CommitInput`, `select`, checkbox, color input, range input, and action button that mutates state.

Change `PropertiesTable` signature:

```tsx
function PropertiesTable({ target, readOnly }: { target: Target; readOnly: boolean }) {
  const props = target.properties ?? [];
  const commit = (next: Property[]) => {
    if (!readOnly) setProperties(target.conceptId!, next);
  };
  // existing render continues
}
```

Disable property editing buttons:

```tsx
<button
  className="tb-btn small"
  title="Remove property"
  disabled={readOnly}
  onClick={() => commit(props.filter((_, j) => j !== i))}
>
  x
</button>

<button
  className="tb-btn add-prop"
  disabled={readOnly}
  onClick={() => commit([...props, { key: '', value: '' }])}
>
  + Add property
</button>
```

Render the Appearance tab only when editable:

```tsx
{(['main', 'properties', ...(readOnly ? [] : ['appearance'])] as Tab[]).map((t) => (
  // existing tab button
))}
```

If `tab === 'appearance' && readOnly`, call `setTab('main')` in a `useEffect`:

```ts
useEffect(() => {
  if (readOnly && tab === 'appearance') setTab('main');
}, [readOnly, tab]);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/readonly.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PropertiesPanel.tsx tests/readonly.test.ts
git commit -m "Make properties read-only in viewer mode"
```

---

### Task 6: Viewer Shell

**Files:**
- Create: `src/ui/ViewerShell.tsx`
- Modify: `src/styles.css`
- Test: `tests/readonly.test.ts`

- [ ] **Step 1: Write a failing exported component test**

Append to `tests/readonly.test.ts`:

```ts
import { ViewerShell } from '../src/ui/ViewerShell';

it('exposes ViewerShell props for loaded and error states', () => {
  const loadedProps: Parameters<typeof ViewerShell>[0] = {
    status: 'loaded',
    sourceLabel: 'shared link',
    onOpenCopy: () => undefined,
  };
  const errorProps: Parameters<typeof ViewerShell>[0] = {
    status: 'error',
    message: 'Broken link',
    onOpenEditor: () => undefined,
  };

  expect(loadedProps.status).toBe('loaded');
  expect(errorProps.status).toBe('error');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/readonly.test.ts`

Expected: FAIL because `src/ui/ViewerShell.tsx` does not exist.

- [ ] **Step 3: Implement `src/ui/ViewerShell.tsx`**

Create:

```tsx
import { useEffect, useMemo } from 'react';
import { ViewEditor } from '../canvas/ViewEditor';
import { openView, setSelection, useStore } from '../model/store';
import { PropertiesPanel } from './PropertiesPanel';

type ViewerShellProps =
  | {
      status: 'loading';
      sourceLabel: string;
      onOpenEditor: () => void;
    }
  | {
      status: 'error';
      message: string;
      onOpenEditor: () => void;
    }
  | {
      status: 'loaded';
      sourceLabel: string;
      onOpenCopy: () => void;
    };

export function ViewerShell(props: ViewerShellProps) {
  if (props.status === 'loading') {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>Opening shared model</h1>
          <p>{props.sourceLabel}</p>
        </div>
      </div>
    );
  }

  if (props.status === 'error') {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>Could not open shared model</h1>
          <p>{props.message}</p>
          <button className="welcome-btn" onClick={props.onOpenEditor}>
            Open Archi Online
          </button>
        </div>
      </div>
    );
  }

  return <LoadedViewerShell sourceLabel={props.sourceLabel} onOpenCopy={props.onOpenCopy} />;
}

function LoadedViewerShell({ sourceLabel, onOpenCopy }: { sourceLabel: string; onOpenCopy: () => void }) {
  const model = useStore((s) => s.model);
  const activeViewId = useStore((s) => s.activeViewId);
  const views = useMemo(() => (model ? Object.values(model.views) : []), [model]);

  useEffect(() => {
    if (!model || activeViewId || views.length === 0) return;
    openView(views[0].id);
  }, [activeViewId, model, views]);

  if (!model) {
    return (
      <div className="viewer-shell">
        <div className="viewer-empty">
          <h1>No model loaded</h1>
        </div>
      </div>
    );
  }

  const selectedViewId = activeViewId ?? views[0]?.id ?? '';

  return (
    <div className="viewer-shell">
      <header className="viewer-toolbar">
        <div className="viewer-title">
          <strong>{model.info.name}</strong>
          <span>{sourceLabel}</span>
        </div>
        <label className="viewer-view-picker">
          <span>View</span>
          <select
            value={selectedViewId}
            onChange={(event) => {
              openView(event.target.value);
              setSelection('tree', [event.target.value]);
            }}
          >
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button className="tb-btn" onClick={onOpenCopy}>
          Open a copy in the editor
        </button>
      </header>
      <main className="viewer-main">
        <section className="viewer-canvas">
          {selectedViewId ? (
            <ViewEditor viewId={selectedViewId} readOnly />
          ) : (
            <div className="viewer-empty">
              <h1>No views in this model</h1>
            </div>
          )}
        </section>
        <aside className="viewer-properties">
          <PropertiesPanel />
        </aside>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Add viewer CSS**

Append to `src/styles.css`:

```css
/* Read-only viewer */
.viewer-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg);
}

.viewer-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--toolbar-bg);
}

.viewer-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-right: auto;
}

.viewer-title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-title span,
.viewer-view-picker span {
  color: var(--text-dim);
  font-size: 12px;
}

.viewer-view-picker {
  display: flex;
  align-items: center;
  gap: 6px;
}

.viewer-view-picker select {
  font: inherit;
  max-width: min(280px, 38vw);
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.viewer-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
}

.viewer-canvas {
  min-width: 0;
  min-height: 0;
  display: flex;
  border-right: 1px solid var(--border);
  background: #fff;
}

.viewer-properties {
  min-height: 0;
  display: flex;
  background: var(--panel-bg);
}

.viewer-empty {
  margin: auto;
  max-width: 460px;
  padding: 24px;
  text-align: center;
  color: var(--text-dim);
}

.viewer-empty h1 {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 20px;
}

.view-editor.read-only .view-svg {
  touch-action: none;
}

@media (max-width: 760px) {
  .viewer-toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .viewer-title {
    flex-basis: 100%;
  }

  .viewer-main {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(180px, 32vh);
  }

  .viewer-canvas {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/readonly.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ViewerShell.tsx src/styles.css tests/readonly.test.ts
git commit -m "Add read-only viewer shell"
```

---

### Task 7: Viewer Startup Branch

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/model/store.ts`
- Modify: `src/persistence/files.ts`
- Test: `tests/share.test.ts`

- [ ] **Step 1: Add tests for viewer URL detection**

Append to `tests/share.test.ts`:

```ts
import { isViewerLocation } from '../src/App';

it('detects explicit and fragment-triggered viewer URLs', () => {
  expect(isViewerLocation(new URL('https://example.test/?mode=viewer'))).toBe(true);
  expect(isViewerLocation(new URL('https://example.test/#m=abc'))).toBe(true);
  expect(isViewerLocation(new URL('https://example.test/#gist=abc'))).toBe(true);
  expect(isViewerLocation(new URL('https://example.test/#raw=https%3A%2F%2Fexample.test%2Fm.archimate'))).toBe(true);
  expect(isViewerLocation(new URL('https://example.test/'))).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/share.test.ts`

Expected: FAIL because `isViewerLocation` is not exported.

- [ ] **Step 3: Export `loadModelText` from `src/persistence/files.ts`**

Change:

```ts
function loadModelText(text: string, fileName: string): void {
```

to:

```ts
export function loadModelText(text: string, fileName: string): void {
```

This gives the viewer copy path the same parse/replace behavior as file open when needed later. Do not emit `model.opened` from viewer mode.

- [ ] **Step 4: Add `cloneModelForEditing` in `src/model/store.ts`**

Append:

```ts
export function cloneModelForEditing(model: ModelState): ModelState {
  return typeof structuredClone === 'function'
    ? structuredClone(model)
    : JSON.parse(JSON.stringify(model));
}
```

- [ ] **Step 5: Refactor `src/App.tsx` startup**

Add imports:

```ts
import { useEffect, useState } from 'react';
import { cloneModelForEditing, openView, replaceModel, redo, undo, useStore } from './model/store';
import { loadSharedModelFromLocation, parseShareFragment } from './persistence/share';
import { ViewerShell } from './ui/ViewerShell';
```

Replace the module-level `booted` flag with separate runtime flags:

```ts
let editorBooted = false;
let viewerBooted = false;
let extensionEventBridgeStarted = false;
```

Add the app-mode type at module level:

```ts
type AppMode =
  | { kind: 'editor' }
  | { kind: 'viewer-loading'; sourceLabel: string }
  | { kind: 'viewer-loaded'; sourceLabel: string }
  | { kind: 'viewer-error'; message: string };
```

Export viewer detection:

```ts
export function isViewerLocation(url: URL): boolean {
  if (url.searchParams.get('mode') === 'viewer') return true;
  return parseShareFragment(url.hash).kind !== 'none';
}
```

Add editor and viewer boot helpers above `App`:

```ts
async function bootEditorRuntime(restoreWorkspace: boolean): Promise<void> {
  if (editorBooted) {
    useStore.setState({ booted: true });
    return;
  }
  editorBooted = true;
  await Promise.all([
    restoreWorkspace ? restoreAutosave() : Promise.resolve(false),
    hydrateSettingsStore(),
    hydrateExtensionStore(),
    hydrateExtensionPackageStore(),
  ]).finally(() => {
    startAutosave();
    useStore.setState({ booted: true });
    reloadEnabledExtensions();
    if (!extensionEventBridgeStarted) {
      extensionEventBridgeStarted = true;
      startExtensionEventBridge();
    }
    void extensionRegistry.emitEvent('app.ready');
  });
}

async function bootViewerRuntime(setMode: (mode: AppMode) => void): Promise<void> {
  if (viewerBooted) return;
  viewerBooted = true;
  try {
    await hydrateSettingsStore();
    const loaded = await loadSharedModelFromLocation(window.location);
    replaceModel(loaded.model, loaded.fileName, false, { readOnly: true });
    const firstView = Object.keys(loaded.model.views)[0];
    if (firstView) openView(firstView);
    useStore.setState({ booted: true });
    setMode({ kind: 'viewer-loaded', sourceLabel: loaded.sourceLabel });
  } catch (error) {
    useStore.setState({ booted: true });
    setMode({
      kind: 'viewer-error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
```

Add state inside `App`:

```ts
const [mode, setMode] = useState<AppMode>(() =>
  isViewerLocation(new URL(window.location.href))
    ? { kind: 'viewer-loading', sourceLabel: 'shared model' }
    : { kind: 'editor' },
);
const [editorBoot, setEditorBoot] = useState({ restoreWorkspace: true });
```

Replace the existing single startup `useEffect` with one viewer effect and one editor effect:

```ts
useEffect(() => {
  if (mode.kind !== 'viewer-loading') return;
  void bootViewerRuntime(setMode);
}, [mode.kind]);

useEffect(() => {
  if (mode.kind !== 'editor') return;
  void bootEditorRuntime(editorBoot.restoreWorkspace);

  const onKey = (e: KeyboardEvent) => {
    const inText =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable);
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (useStore.getState().readOnly && ['s', 'o', 'z', 'y'].includes(key)) return;
    if (key === 's') {
      e.preventDefault();
      void saveModel(false);
    } else if (key === 'o') {
      e.preventDefault();
      void openModel();
    } else if (!inText && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (!inText && key === 'y') {
      e.preventDefault();
      redo();
    }
  };
  window.addEventListener('keydown', onKey);

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (useStore.getState().dirty) e.preventDefault();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}, [mode.kind, editorBoot.restoreWorkspace]);
```

Add copy/editor handlers before the final return:

```tsx
const openEditorHome = () => {
  history.replaceState(null, '', new URL('.', window.location.href));
  replaceModel(null, null, false, { readOnly: false });
  setEditorBoot({ restoreWorkspace: true });
  setMode({ kind: 'editor' });
};

const openCopyInEditor = () => {
  const model = useStore.getState().model;
  if (!model) return;
  history.replaceState(null, '', new URL('.', window.location.href));
  replaceModel(cloneModelForEditing(model), null, true, { readOnly: false });
  setEditorBoot({ restoreWorkspace: false });
  setMode({ kind: 'editor' });
};
```

Render viewer states before editor shell:

```tsx
if (mode.kind === 'viewer-loading') {
  return <ViewerShell status="loading" sourceLabel={mode.sourceLabel} onOpenEditor={openEditorHome} />;
}
if (mode.kind === 'viewer-error') {
  return <ViewerShell status="error" message={mode.message} onOpenEditor={openEditorHome} />;
}
if (mode.kind === 'viewer-loaded') {
  return <ViewerShell status="loaded" sourceLabel={mode.sourceLabel} onOpenCopy={openCopyInEditor} />;
}
```

Keep the existing editor return:

```tsx
return (
  <>
    <AppShell />
    <AppDialogHost />
  </>
);
```

The `openCopyInEditor` path must use `restoreWorkspace: false`; otherwise `restoreAutosave()` can overwrite the copied shared model before the user sees it. Viewer boot must not call `restoreAutosave`, `startAutosave`, `hydrateExtensionStore`, `hydrateExtensionPackageStore`, `reloadEnabledExtensions`, `startExtensionEventBridge`, or `extensionRegistry.emitEvent('app.ready')`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- tests/share.test.ts tests/readonly.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/model/store.ts src/persistence/files.ts tests/share.test.ts
git commit -m "Add viewer startup mode"
```

---

### Task 8: Toolbar Share Flow

**Files:**
- Modify: `src/ui/Toolbar.tsx`
- Test: `tests/share.test.ts`

- [ ] **Step 1: Add a focused share decision test**

Append to `tests/share.test.ts`:

```ts
import { shareDecisionForInline } from '../src/ui/Toolbar';

it('chooses inline links under the threshold and gist links over it', () => {
  expect(shareDecisionForInline(100)).toBe('inline');
  expect(shareDecisionForInline(INLINE_SHARE_THRESHOLD)).toBe('inline');
  expect(shareDecisionForInline(INLINE_SHARE_THRESHOLD + 1)).toBe('gist');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/share.test.ts`

Expected: FAIL because `shareDecisionForInline` is not exported.

- [ ] **Step 3: Implement share helpers in `src/ui/Toolbar.tsx`**

Add imports:

```ts
import { serializeArchimate } from '../model/io/archimate-xml';
import {
  INLINE_SHARE_THRESHOLD,
  encodeModelToInlineShare,
  gistShareHref,
  getRememberedGistId,
  saveShareGistForModel,
} from '../persistence/share';
import {
  getStoredGitHubToken,
  setStoredGitHubToken,
} from '../persistence/github';
import { showPromptDialog } from './AppDialog';
```

Add the testable decision helper:

```ts
export function shareDecisionForInline(encodedLength: number): 'inline' | 'gist' {
  return encodedLength <= INLINE_SHARE_THRESHOLD ? 'inline' : 'gist';
}
```

Add clipboard helper:

```ts
async function copyShareLink(href: string): Promise<void> {
  await navigator.clipboard.writeText(href);
  await showAlertDialog({
    title: 'Share link copied',
    message: href,
    details: 'Anyone with this link can read the model data contained in the link or referenced gist.',
  });
}
```

Add the share command:

```ts
export async function shareModel(): Promise<void> {
  const model = useStore.getState().model;
  if (!model) return;

  const inline = encodeModelToInlineShare(model);
  if (shareDecisionForInline(inline.encodedLength) === 'inline') {
    await copyShareLink(inline.href);
    return;
  }

  const useGist = await showConfirmDialog({
    title: 'Use GitHub Gist?',
    message: 'This model is too large for a reliable URL-only share link.',
    details: 'A gist stores the .archimate file in GitHub. Secret gists are unlisted, but anyone with the link can read them.',
    confirmLabel: 'Use Gist',
    cancelLabel: 'Cancel',
  });
  if (!useGist) return;

  let token = await getStoredGitHubToken();
  if (!token) {
    const entered = await showPromptDialog({
      title: 'GitHub token',
      message: 'Enter a GitHub personal access token with gist scope.',
      placeholder: 'ghp_...',
      confirmLabel: 'Save token',
      cancelLabel: 'Cancel',
    });
    if (!entered) return;
    await setStoredGitHubToken(entered);
    token = entered.trim();
  }

  const rememberedGistId = await getRememberedGistId(model.info.id);
  const makePublic = rememberedGistId
    ? false
    : await showConfirmDialog({
        title: 'Gist visibility',
        message: 'Secret is recommended. Choose Public only when the model may be indexed and listed publicly.',
        details: 'This choice applies when creating a gist. Re-sharing an existing gist keeps its current visibility.',
        confirmLabel: 'Public',
        cancelLabel: 'Secret',
      });

  const xml = serializeArchimate(model);
  const saved = await saveShareGistForModel({
    token,
    modelId: model.info.id,
    xml,
    fileName: `${model.info.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model'}.archimate`,
    public: makePublic,
  });
  await copyShareLink(gistShareHref(saved.id));
}
```

Handle errors in the button call rather than throwing:

```ts
async function runShareModel(): Promise<void> {
  try {
    await shareModel();
  } catch (error) {
    await showAlertDialog({
      title: 'Could not share model',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}
```

- [ ] **Step 4: Add the toolbar button**

Place it after Save As:

```tsx
<button
  className="tb-btn"
  title="Share model"
  disabled={!hasModel}
  onClick={() => void runShareModel()}
>
  Share...
</button>
```

Do not render or enable Share in read-only mode. Add:

```ts
const readOnly = useStore((s) => s.readOnly);
```

and set:

```tsx
disabled={!hasModel || readOnly}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/share.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Toolbar.tsx tests/share.test.ts
git commit -m "Add model share action"
```

---

### Task 9: End-To-End Validation And Manual Browser Checks

**Files:**
- Modify: `docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md` if any M1 assumptions changed during implementation.

- [ ] **Step 1: Run the focused tests**

Run:

```bash
npm test -- tests/share.test.ts tests/github.test.ts tests/readonly.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the repository gates**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`

Expected: Vite starts on `http://localhost:5173/` or the next available port.

- [ ] **Step 4: Verify inline share manually**

In the browser:

1. Open the normal editor.
2. Load `public/examples/Archisurance.archimate` from the Welcome panel.
3. Use `Share...`.
4. If the Archisurance payload exceeds `INLINE_SHARE_THRESHOLD`, create a new empty model in the editor and use it for the inline branch.
5. Open the copied link in a fresh browser profile or private window.

Expected:

- Viewer opens without asking for GitHub auth.
- Toolbar editing controls are absent.
- The view selector opens views.
- Mouse wheel pans/zooms, Ctrl+wheel zooms, and zoom buttons work.
- Properties show name, documentation, and properties but do not allow edits.
- Reloading the normal editor still restores the previous autosaved editor session, proving viewer mode did not autosave over it.

- [ ] **Step 5: Verify gist-backed share manually**

In the browser:

1. Open Archisurance.
2. Use `Share...`.
3. Provide a PAT with `gist` scope.
4. Choose `Secret`.
5. Open the copied gist-backed viewer link in a fresh browser profile.
6. Re-share the same model and inspect the network request or gist timestamp.

Expected:

- First share creates a gist.
- Viewer opens the gist-backed model with no auth in a fresh browser profile.
- Second share updates the same remembered gist id for `model.info.id`.
- The copied viewer link keeps the `#gist=<id>` shape.

- [ ] **Step 6: Verify public raw URL loading**

Open:

```text
http://localhost:5173/?mode=viewer#raw=https%3A%2F%2Fraw.githubusercontent.com%2FThomasRohde%2Farchi-online%2Fmain%2Fpublic%2Fexamples%2FArchisurance.archimate
```

If the default branch changes before implementation, get the branch name with `git remote show origin` and update this check to the same `public/examples/Archisurance.archimate` raw path on that branch.

Expected: viewer opens the model without a token and without starting autosave.

- [ ] **Step 7: Verify open-copy behavior**

From any viewer link, click `Open a copy in the editor`.

Expected:

- URL no longer has `?mode=viewer` or a share fragment.
- Normal editor shell appears.
- Model is editable.
- File name is unsaved.
- Dirty indicator is visible so the user can save the copy.
- Extension and autosave boot are active again for the editor session.

- [ ] **Step 8: Stop the dev server**

Stop the Vite process with `Ctrl+C`.

- [ ] **Step 9: Commit validation doc updates if needed**

If implementation changed a planned M1 assumption, update the Phase 1 section in `docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md` with the actual decision and commit it:

```bash
git add docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md
git commit -m "Document model sharing milestone 1 decisions"
```

Skip this commit when no planning assumptions changed.

## Self-Review Notes

- Spec coverage: R1 is covered by Tasks 3-7; R2 by Task 1; R3 by Tasks 2 and 8; R4 by Tasks 1, 2, and 7; R5 by Tasks 6 and 7; R6 by Tasks 1, 2, and 8.
- Placeholder scan: this plan avoids deferred implementation language in task steps; each code step names the file, function, and behavior to implement.
- Type consistency: share APIs use `ModelState`, `LoadedSharedModel`, `SaveGistRequest`, and `SavedGist` consistently across `share.ts`, `github.ts`, `Toolbar.tsx`, and `App.tsx`.
- Execution boundary: this is M1 only. Visual diff and GitHub repo open/save/compare remain in the existing M2/M3 roadmap.
