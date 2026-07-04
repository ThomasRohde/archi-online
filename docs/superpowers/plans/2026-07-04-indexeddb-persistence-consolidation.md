# IndexedDB Persistence Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production `localStorage` usage and make all browser-local Archi Online persistence IndexedDB-backed before the app has compatibility obligations.

**Architecture:** Add one small async key-value adapter over `idb-keyval`, then route autosave, scripts, settings, dock layout, extension source records, extension packages, and extension private storage through it. Because this is greenfield, do not add LocalStorage import/backfill code; update tests, examples, and docs to the new async storage contract.

**Tech Stack:** Vite, React, TypeScript, Zustand, `idb-keyval`, Vitest `jsdom`.

---

## Greenfield Scope

- Remove all production `localStorage` reads/writes.
- Do not preserve existing LocalStorage data.
- Keep `idb-keyval` as the IndexedDB implementation.
- Keep settings and dock layout persisted, but hydrate them asynchronously.
- Change extension private storage from synchronous `app.storage.get/set` to async `Promise` methods now, while the extension API is still greenfield.
- Keep package install persistence failure-aware: package installs should not update UI state if IndexedDB rejects the write.

## File Structure

- Create `src/persistence/keyval.ts`: shared async persistence adapter and injectable test driver type.
- Modify `src/persistence/autosave.ts`: use the shared adapter instead of direct `idb-keyval` calls.
- Modify `src/ui/ScriptPanel.tsx`: use the shared adapter instead of direct `idb-keyval` calls.
- Modify `src/settings/app-settings.ts`: make load/persist async and add an exported hydration function.
- Modify `src/App.tsx`: hydrate settings and extension stores before extension reload and app boot completion.
- Modify `src/ui/DockLayout.tsx`: read/write/reset layout through IndexedDB.
- Modify `src/extensions/extension-store.ts`: hydrate source records asynchronously and persist through IndexedDB.
- Modify `src/extensions/package-store.ts`: hydrate packages asynchronously and make package mutations return `Promise<void>`.
- Modify `src/extensions/app-api.ts`: make extension private storage async.
- Modify `src/extensions/types.ts` and `src/scripting/jarchi-dts.ts`: type `app.storage` as async.
- Modify `src/ui/ExtensionsPanel.tsx`: await package/source persistence operations where failure matters.
- Modify `extensions/**/*.js`: update example extensions to use async `app.storage`.
- Modify `docs/wiki/Extension-API.md`: document async private extension storage.
- Modify tests under `tests/`: replace LocalStorage expectations with async IndexedDB-driver expectations.

## Tasks

### Task 1: Add Shared IndexedDB Adapter

**Files:**
- Create: `src/persistence/keyval.ts`
- Test support in existing tests as needed.

- [ ] **Step 1: Create the adapter**

Add this module:

```ts
import { del, get, set } from 'idb-keyval';

export interface AsyncKeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export const indexedDbStore: AsyncKeyValueStore = { get, set, del };

export function memoryKeyValueStore(initial?: Iterable<[string, unknown]>): AsyncKeyValueStore & {
  data: Map<string, unknown>;
} {
  const data = new Map(initial);
  return {
    data,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      data.set(key, value);
    },
    async del(key: string) {
      data.delete(key);
    },
  };
}
```

- [ ] **Step 2: Replace direct `idb-keyval` imports**

Update `src/persistence/autosave.ts` and `src/ui/ScriptPanel.tsx` to import `indexedDbStore` and call `indexedDbStore.get/set/del`. Keep the same keys and behavior.

- [ ] **Step 3: Verify no behavior change**

Run:

```bash
npm test -- tests/archimate-xml.test.ts tests/jarchi.test.ts
```

Expected: PASS. These are smoke tests that autosave-related imports and script runtime imports still compile in the test graph.

### Task 2: Move Settings To Async IndexedDB Hydration

**Files:**
- Modify: `src/settings/app-settings.ts`
- Modify: `src/App.tsx`
- Modify: `tests/settings.test.ts`

- [ ] **Step 1: Update settings tests first**

Change the persistence tests to use `memoryKeyValueStore` and async calls:

```ts
const s = memoryKeyValueStore([[SETTINGS_STORAGE_KEY, saved]]);
await expect(loadSettings(s)).resolves.toEqual(saved);

await persistSettings({ ...DEFAULT_SETTINGS, gridSize: 22 }, s);
expect(s.data.get(SETTINGS_STORAGE_KEY)).toEqual({ ...DEFAULT_SETTINGS, gridSize: 22 });
```

- [ ] **Step 2: Make settings load/persist async**

Replace the Storage-based helper with the shared adapter:

```ts
import { indexedDbStore, type AsyncKeyValueStore } from '../persistence/keyval';

export async function loadSettings(
  storage: AsyncKeyValueStore = indexedDbStore,
): Promise<AppSettings> {
  try {
    const raw = await storage.get<unknown>(SETTINGS_STORAGE_KEY);
    return normalizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function persistSettings(
  settings: AppSettings,
  storage: AsyncKeyValueStore = indexedDbStore,
): Promise<void> {
  try {
    await storage.set(SETTINGS_STORAGE_KEY, normalizeSettings(settings));
  } catch {
    /* IndexedDB failures should not block editing */
  }
}
```

- [ ] **Step 3: Add store hydration**

Keep the store default synchronous, but hydrate it during app startup:

```ts
export async function hydrateSettingsStore(): Promise<void> {
  useSettingsStore.setState({ settings: await loadSettings() });
}

function commit(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  void persistSettings(normalized);
  return normalized;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  setSetting: (key, value) =>
    set((state) => ({ settings: commit(updateSetting(state.settings, key, value)) })),
  resetSetting: (key) =>
    set((state) => ({ settings: commit(resetSetting(state.settings, key)) })),
  resetAll: () => set({ settings: commit(resetSettings()) }),
}));
```

- [ ] **Step 4: Hydrate at boot**

In `src/App.tsx`, import `hydrateSettingsStore` and await it before setting `booted: true`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/settings.test.ts
```

Expected: PASS.

### Task 3: Move Dock Layout To IndexedDB

**Files:**
- Modify: `src/ui/DockLayout.tsx`
- Existing tests may not cover dock layout directly; rely on typecheck and build.

- [ ] **Step 1: Read layout asynchronously**

In the one-time init effect, replace `localStorage.getItem(LAYOUT_KEY)` with:

```ts
const raw = await indexedDbStore.get<unknown>(LAYOUT_KEY);
if (raw) {
  try {
    api.fromJSON(raw);
    restored = true;
  } catch (e) {
    console.warn('layout restore failed', e);
  }
}
```

Wrap the effect body in an inner async function and guard it with a `cancelled` flag in the cleanup.

- [ ] **Step 2: Write layout as structured data**

Replace layout save with:

```ts
void indexedDbStore.set(LAYOUT_KEY, api.toJSON()).catch(() => {
  /* quota/serialization issues are non-fatal */
});
```

- [ ] **Step 3: Reset layout by deleting the key**

Replace `localStorage.removeItem(LAYOUT_KEY)` with:

```ts
void indexedDbStore.del(LAYOUT_KEY);
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

### Task 4: Move Extension Source And Package Stores To IndexedDB

**Files:**
- Modify: `src/extensions/extension-store.ts`
- Modify: `src/extensions/package-store.ts`
- Modify: `src/App.tsx`
- Modify: `src/ui/ExtensionsPanel.tsx`
- Modify: `tests/extensions.test.ts`
- Modify: `tests/extension-packages.test.ts`

- [ ] **Step 1: Rewrite source/package store tests as async**

Use `memoryKeyValueStore` and store structured arrays directly:

```ts
const s = memoryKeyValueStore();
await persistExtensionRecords([record], s);
await expect(loadExtensionRecords(s)).resolves.toEqual([record]);
```

For package failures, use an async throwing store:

```ts
const throwing = {
  async get<T>() {
    return undefined as T | undefined;
  },
  async set() {
    throw new DOMException('quota exceeded', 'QuotaExceededError');
  },
  async del() {},
};

await expect(persistInstalledPackages([pkg], throwing)).rejects.toThrow(
  /Could not persist extension packages/,
);
```

- [ ] **Step 2: Make load/persist async**

For source records:

```ts
export async function loadExtensionRecords(
  storage: AsyncKeyValueStore = indexedDbStore,
): Promise<LocalExtensionRecord[]> {
  try {
    const raw = await storage.get<unknown>(EXTENSIONS_STORAGE_KEY);
    const parsed = parseExtensionRecords(raw);
    retainedExtensionRecords = parsed.retained;
    return parsed.records;
  } catch {
    retainedExtensionRecords = [];
    return [];
  }
}
```

For package records, use the same structure but preserve rejection on write:

```ts
export async function persistInstalledPackages(
  packages: InstalledExtensionPackage[],
  storage: AsyncKeyValueStore = indexedDbStore,
  options: PersistOptions = {},
): Promise<void> {
  try {
    const normalized = normalizeInstalledPackages(packages);
    const normalizedIds = new Set(normalized.map((pkg) => pkg.id));
    const dropIds = new Set(options.dropRetainedIds ?? []);
    const retained = options.retainUnreadable === false
      ? []
      : retainedInstalledPackageRecords.filter((record) => {
          const id = rawPackageId(record);
          return id && !dropIds.has(id) && !normalizedIds.has(id);
        });
    await storage.set(EXTENSION_PACKAGES_STORAGE_KEY, [...retained, ...normalized]);
    retainedInstalledPackageRecords = retained;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not persist extension packages: ${message}`, { cause: error });
  }
}
```

- [ ] **Step 3: Add store hydration functions**

Source store:

```ts
export async function hydrateExtensionStore(): Promise<void> {
  useExtensionStore.setState({ extensions: await loadExtensionRecords() });
}
```

Package store:

```ts
export async function hydrateExtensionPackageStore(): Promise<void> {
  useExtensionPackageStore.setState({ packages: await loadInstalledPackages() });
}
```

- [ ] **Step 4: Make package mutations awaitable**

Change `upsertPackage`, `removePackage`, and `setPackageEnabled` to return `Promise<void>`. Persist first, then update state:

```ts
upsertPackage: async (pkg) => {
  const state = useExtensionPackageStore.getState();
  const packages = [
    ...state.packages.filter((existing) => existing.id !== pkg.id),
    { ...pkg, updatedAt: Date.now() },
  ];
  const normalized = normalizeInstalledPackages(packages);
  await persistInstalledPackages(normalized, undefined, { dropRetainedIds: [pkg.id] });
  set({ packages: normalized });
},
```

- [ ] **Step 5: Await package writes in the UI**

In `src/ui/ExtensionsPanel.tsx`, update package import:

```ts
await upsertPackage(pkg);
extensionRegistry.clearExtension(pkg.id);
if (existingSource) await remove(existingSource.id);
setSelectedKey(`package:${pkg.id}`);
if (pkg.enabled) runInstalledPackage(pkg);
```

Also make delete/convert/toggle handlers await package/source mutations before mutating runtime state.

- [ ] **Step 6: Hydrate extension stores before reload**

In `src/App.tsx`, import both hydration functions and run them before `reloadEnabledExtensions()`:

```ts
await Promise.all([
  restoreAutosave(),
  hydrateSettingsStore(),
  hydrateExtensionStore(),
  hydrateExtensionPackageStore(),
]);
startAutosave();
useStore.setState({ booted: true });
reloadEnabledExtensions();
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- tests/extensions.test.ts tests/extension-packages.test.ts
```

Expected: PASS.

### Task 5: Make Extension Private Storage Async

**Files:**
- Modify: `src/extensions/app-api.ts`
- Modify: `src/extensions/types.ts`
- Modify: `src/scripting/jarchi-dts.ts`
- Modify: `tests/extensions.test.ts`
- Modify: `tests/extension-examples.test.ts`
- Modify: `extensions/elk-layout/main.js`
- Modify: `extensions/event-log-console/main.js`
- Modify: `extensions/selection-workbench/main.js`
- Modify: `extensions/model-audit-dashboard/main.js`
- Modify: `docs/wiki/Extension-API.md`

- [ ] **Step 1: Update tests to expect async storage**

Change private-storage assertions to:

```ts
await app.storage.set('threshold', 7);
await expect(app.storage.get('threshold')).resolves.toBe(7);
```

When checking persisted data, read through the shared driver or exported private storage helpers instead of `localStorage`.

- [ ] **Step 2: Implement async private storage helpers**

In `src/extensions/app-api.ts`:

```ts
const STORAGE_PREFIX = 'archi-online.extension-storage.v1.';

export async function clearExtensionStorage(extensionId: string): Promise<void> {
  try {
    await indexedDbStore.del(STORAGE_PREFIX + extensionId);
  } catch {
    /* private extension storage cleanup is best-effort */
  }
}

async function readStorage(extensionId: string): Promise<Record<string, unknown>> {
  try {
    const parsed = await indexedDbStore.get<unknown>(STORAGE_PREFIX + extensionId);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStorage(extensionId: string, value: Record<string, unknown>): Promise<void> {
  try {
    await indexedDbStore.set(STORAGE_PREFIX + extensionId, value);
  } catch {
    /* private extension storage failures should not block editing */
  }
}
```

Then expose:

```ts
storage: {
  async get(key: string) {
    return (await readStorage(extensionId))[key];
  },
  async set(key: string, value: unknown) {
    const current = await readStorage(extensionId);
    current[key] = value;
    await writeStorage(extensionId, current);
  },
},
```

- [ ] **Step 3: Update extension API types**

In `src/scripting/jarchi-dts.ts`:

```ts
storage: {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};
```

In `src/extensions/types.ts`, leave commands/events async-compatible and change panels if needed:

```ts
render(container: HTMLElement): void | Promise<void> | (() => void);
```

- [ ] **Step 4: Update example extensions**

Use async command bodies or async helper functions. Example pattern:

```js
async function readOptions() {
  return (await app.storage.get('options')) || {};
}

app.commands.register('examples.elk-layout.apply', {
  title: 'Apply ELK layout',
  async run() {
    var options = await readOptions();
    await app.storage.set('lastResult', { ok: true, options: options });
  }
});
```

For panel renderers, keep `render` synchronous and call an async helper:

```js
app.panels.register('examples.elk-layout.panel', {
  title: 'ELK Layout',
  render(container) {
    void renderPanel(container);
  }
});

async function renderPanel(container) {
  var options = await readOptions();
  container.textContent = JSON.stringify(options);
}
```

- [ ] **Step 5: Update docs**

In `docs/wiki/Extension-API.md`, replace the storage example with:

```js
await app.storage.set("lastRun", new Date().toISOString());
var lastRun = await app.storage.get("lastRun");
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- tests/extensions.test.ts tests/extension-examples.test.ts
```

Expected: PASS.

### Task 6: Remove LocalStorage From Production Code

**Files:**
- Modify any remaining production files reported by search.
- Modify tests only where they intentionally stub browser storage for unrelated behavior.

- [ ] **Step 1: Search for production `localStorage`**

Run:

```bash
rg -n "localStorage|sessionStorage|Storage" src extensions public docs/wiki
```

Expected after implementation: no `localStorage` or `sessionStorage` hits in `src/`, `extensions/`, or `public/`. `docs/wiki` should only mention IndexedDB or async extension storage.

- [ ] **Step 2: Update wording in package validation**

In `src/extensions/package-validation.ts`, change:

```ts
throw new Error('Package is too large for browser-local storage');
```

to:

```ts
throw new Error('Package is too large for browser storage');
```

Keep `MAX_PACKAGE_CONTENT_CHARS = 5_000_000` for now. IndexedDB removes the LocalStorage-specific ceiling, but retaining an explicit package size limit is still useful to protect runtime memory and import UX.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

## Self-Review

- Spec coverage: the plan removes production `localStorage`, keeps all existing persisted categories, and updates extension API/docs/examples to IndexedDB-compatible async storage.
- Placeholder scan: no compatibility import/backfill is included because the app is still greenfield.
- Type consistency: storage adapter methods return Promises; settings and extension store hydration are awaited during app boot; package store mutations are awaitable where UI must surface write failures.
