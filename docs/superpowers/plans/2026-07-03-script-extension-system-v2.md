# Script Extension System V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser/profile-local `.archi-ext` package import/export while keeping existing single-source extensions working.

**Architecture:** V2 packages are validated zip archives persisted in a separate localStorage-backed store, then flattened into the existing `LocalExtensionRecord` runtime contract. The runtime receives optional package context so `app.manifest` and `app.assets` can expose installed package files without changing the registry, Dockview panels, commands, menus, or event bridge.

**Tech Stack:** Vite, React, TypeScript, Zustand, Vitest, Monaco, Dockview, browser `localStorage`, `fflate` for zip import/export.

---

## File Structure

- Create `src/extensions/package-types.ts` for V2 manifest, installed package, file, and package metadata contracts.
- Create `src/extensions/package-validation.ts` for path normalization, manifest validation, package validation, package persistence normalization, text/json/asset helpers, and flattening to `LocalExtensionRecord`.
- Create `src/extensions/package-store.ts` for `archi-online.extension-packages.v2` persistence and Zustand actions.
- Create `src/extensions/package-archive.ts` for `.archi-ext` zip import/export using `fflate`.
- Modify `src/extensions/types.ts` to add optional `origin` on editable source records.
- Modify `src/extensions/extension-store.ts` to preserve valid source/override origins.
- Modify `src/extensions/app-api.ts` and `src/extensions/runtime.ts` to pass package context and expose `app.extension.package()`, `app.manifest.get()`, `app.assets.url/text/json`.
- Modify `src/ui/ExtensionsPanel.tsx` and `src/styles.css` for package import, export, package details, read-only package source, and conversion to editable source.
- Modify `src/scripting/jarchi-dts.ts` for Monaco declarations.
- Add `tests/extension-packages.test.ts` and extend `tests/extensions.test.ts`.

### Task 1: Package Validation Helpers

**Files:**
- Create: `src/extensions/package-types.ts`
- Create: `src/extensions/package-validation.ts`
- Modify: `src/extensions/types.ts`
- Test: `tests/extension-packages.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add tests that exercise the desired public API:

```ts
import { describe, expect, it } from 'vitest';
import {
  flattenInstalledPackage,
  makeInstalledPackage,
  normalizePackagePath,
  readPackageJsonFile,
  readPackageTextFile,
} from '../src/extensions/package-validation';

describe('extension package validation', () => {
  it('normalizes safe package paths and rejects unsafe paths', () => {
    expect(normalizePackagePath('scripts/audit.js')).toBe('scripts/audit.js');
    expect(() => normalizePackagePath('../main.js')).toThrow(/Unsafe package path/);
    expect(() => normalizePackagePath('/main.js')).toThrow(/Unsafe package path/);
    expect(() => normalizePackagePath('scripts\\audit.js')).toThrow(/Unsafe package path/);
  });

  it('creates an installed package from valid files and flattens it for runtime', () => {
    const pkg = makeInstalledPackage({
      manifest: {
        schemaVersion: 2,
        id: 'local.audit-tools',
        name: 'Audit tools',
        version: '0.2.0',
        description: 'Audit commands.',
        main: 'main.js',
      },
      files: {
        'manifest.json': { encoding: 'utf8', content: '{}' },
        'main.js': { encoding: 'utf8', content: 'app.extension({ id: "local.audit-tools", name: "Audit tools", version: "0.2.0" });' },
        'data/config.json': { encoding: 'utf8', content: '{"threshold":7}' },
      },
      enabled: true,
      now: 100,
    });

    expect(flattenInstalledPackage(pkg)).toMatchObject({
      id: 'local.audit-tools',
      name: 'Audit tools',
      version: '0.2.0',
      enabled: true,
      source: expect.stringContaining('local.audit-tools'),
      createdAt: 100,
      updatedAt: 100,
    });
    expect(readPackageTextFile(pkg, 'main.js')).toContain('app.extension');
    expect(readPackageJsonFile(pkg, 'data/config.json')).toEqual({ threshold: 7 });
  });

  it('rejects invalid manifests and missing main files', () => {
    expect(() =>
      makeInstalledPackage({
        manifest: { schemaVersion: 1, id: 'x', name: 'X', version: '1.0.0', main: 'main.js' } as never,
        files: {},
        enabled: true,
        now: 1,
      }),
    ).toThrow(/schemaVersion/);

    expect(() =>
      makeInstalledPackage({
        manifest: { schemaVersion: 2, id: 'local.missing', name: 'Missing', version: '1.0.0', main: 'main.js' },
        files: { 'manifest.json': { encoding: 'utf8', content: '{}' } },
        enabled: true,
        now: 1,
      }),
    ).toThrow(/main file/);
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/extension-packages.test.ts`

Expected: fail because `src/extensions/package-validation.ts` does not exist.

- [ ] **Step 3: Implement validation helpers**

Create V2 types and helpers with these signatures:

```ts
export interface ExtensionManifestV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  contributes?: Record<string, unknown>;
}

export interface InstalledPackageFile {
  mediaType?: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

export interface InstalledExtensionPackage {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: ExtensionManifestV2;
  files: Record<string, InstalledPackageFile>;
  installedAt: number;
  updatedAt: number;
}
```

Implement `normalizePackagePath`, `makeInstalledPackage`, `readPackageTextFile`, `readPackageJsonFile`, `cloneManifest`, and `flattenInstalledPackage`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/extension-packages.test.ts`

Expected: package validation tests pass.

### Task 2: Package Persistence And Runtime Flattening

**Files:**
- Create: `src/extensions/package-store.ts`
- Modify: `src/extensions/extension-store.ts`
- Modify: `src/extensions/types.ts`
- Modify: `src/extensions/runtime.ts`
- Test: `tests/extension-packages.test.ts`
- Test: `tests/extensions.test.ts`

- [ ] **Step 1: Write failing persistence/runtime tests**

Add tests for `loadInstalledPackages`, invalid JSON fallback, unknown-field ignoring, `persistInstalledPackages`, and package loading through `reloadEnabledExtensions`.

```ts
expect(loadInstalledPackages(storage('{broken'))).toEqual([]);
persistInstalledPackages([pkg], s);
expect(JSON.parse(s.data.get(EXTENSION_PACKAGES_STORAGE_KEY) ?? '[]')[0].id).toBe(pkg.id);
```

For runtime loading, seed `useExtensionStore` with `[]`, seed `useExtensionPackageStore` with one enabled package, call `reloadEnabledExtensions(registry)`, and assert its command is registered.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/extension-packages.test.ts tests/extensions.test.ts`

Expected: fail because package store/runtime integration does not exist.

- [ ] **Step 3: Implement package store and runtime loading**

Add store key `archi-online.extension-packages.v2`, normalized persistence, and Zustand actions:

```ts
interface ExtensionPackageStoreState {
  packages: InstalledExtensionPackage[];
  setPackages(packages: InstalledExtensionPackage[]): void;
  upsertPackage(pkg: InstalledExtensionPackage): void;
  removePackage(id: string): void;
  setPackageEnabled(id: string, enabled: boolean): void;
}
```

Update `reloadEnabledExtensions()` to clear registry/assets, then run enabled source records and enabled flattened package records with package context.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/extension-packages.test.ts tests/extensions.test.ts`

Expected: tests pass.

### Task 3: Package-Aware Runtime API

**Files:**
- Modify: `src/extensions/app-api.ts`
- Modify: `src/extensions/runtime.ts`
- Modify: `src/scripting/jarchi-dts.ts`
- Test: `tests/extensions.test.ts`

- [ ] **Step 1: Write failing API tests**

Add a runtime test that loads a package whose `main.js` reads:

```js
app.extension({ id: "local.assets", name: "Assets", version: "1.0.0" });
app.commands.register("local.assets.read", {
  title: "Read",
  run() {
    app.storage.set("manifestName", app.manifest.get().name);
    app.storage.set("config", app.assets.json("data/config.json").enabled);
    app.storage.set("text", app.assets.text("README.md"));
    app.storage.set("packageId", app.extension.package().id);
  }
});
```

Run the command and assert extension storage contains manifest/package/asset values.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/extensions.test.ts`

Expected: fail because `app.manifest` and `app.assets` are missing.

- [ ] **Step 3: Implement package context and API**

Introduce a runtime context object:

```ts
interface ExtensionRuntimeContext {
  packageRecord?: InstalledExtensionPackage;
  sourceRecord: LocalExtensionRecord;
  assetUrlFor(path: string): string;
}
```

Make `createAppApi(extensionId, registry, context)` return a callable `extension` function with `extension.package()`, plus `manifest.get()`, `assets.text()`, `assets.json()`, and `assets.url()`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/extensions.test.ts`

Expected: tests pass.

### Task 4: `.archi-ext` Archive Import/Export

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/extensions/package-archive.ts`
- Test: `tests/extension-packages.test.ts`

- [ ] **Step 1: Write failing archive round-trip tests**

Add tests for importing a zip with `manifest.json`, `main.js`, and `assets/icon.svg`, exporting it back to bytes, re-importing, and exporting a V1 source record as a package.

```ts
const bytes = createArchiveBytesForPackage(pkg);
const imported = await readExtensionArchive(bytes, 200);
expect(imported.manifest).toEqual(pkg.manifest);
expect(readPackageTextFile(imported, 'main.js')).toContain('app.extension');
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/extension-packages.test.ts`

Expected: fail because archive helpers or `fflate` are missing.

- [ ] **Step 3: Add `fflate` and implement archive helpers**

Run: `npm install fflate@^0.8.2`

Implement `readExtensionArchive`, `createArchiveBytesForPackage`, `createArchiveBlobForPackage`, `createArchiveBytesForSourceRecord`, and `createArchiveBlobForSourceRecord`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/extension-packages.test.ts`

Expected: archive tests pass.

### Task 5: Extensions Panel Package UI

**Files:**
- Modify: `src/ui/ExtensionsPanel.tsx`
- Modify: `src/styles.css`
- Test: `npm run typecheck`

- [ ] **Step 1: Update panel state model**

Build a combined list:

```ts
type ExtensionListItem =
  | { origin: 'source' | 'override'; record: LocalExtensionRecord; packageRecord?: undefined }
  | { origin: 'package'; record: LocalExtensionRecord; packageRecord: InstalledExtensionPackage };
```

Source records remain editable. Package records show flattened source as read-only.

- [ ] **Step 2: Add package actions**

Add buttons for `Import package`, `Export`, `Reload all`, `Convert to source`, and `Delete`/`Uninstall`. Import reads a `.archi-ext`, prompts before replacing the same ID, persists via `useExtensionPackageStore`, removes same-ID source records when replacing, and reloads if enabled.

- [ ] **Step 3: Add package details**

Render manifest description, main file path, installed/updated timestamps, and a scrollable file list for package records.

- [ ] **Step 4: Add styles and verify types**

Run: `npm run typecheck`

Expected: no TypeScript errors.

### Task 6: Full Verification, Commit, And Publish

**Files:**
- All implementation files.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Review diff**

Run:

```bash
git status --short
git diff -- src tests docs package.json package-lock.json
```

Expected: only V2 package implementation, tests, package dependency, and plan file changed.

- [ ] **Step 3: Commit and republish**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-script-extension-system-v2.md src tests package.json package-lock.json
git commit -m "Add script extension package import and export"
npm run build
bash -lc "cd /mnt/c/Users/thoma/Projects/archi-online && /mnt/c/Users/thoma/.agents/skills/here-now/scripts/publish.sh dist --slug bitter-mill-c9qn --client codex --spa"
```

Expected: commit succeeds and here.now updates `https://bitter-mill-c9qn.here.now/`.

## Self-Review

- Spec coverage: package format, validation, local package store, V1 flattening, runtime APIs, import/export UI, V1 source export, and local-only persistence all have implementation tasks.
- Placeholder scan: no task depends on undefined future work; each task names concrete functions and verification commands.
- Type consistency: package type names, storage key, runtime API names, and UI origin names are consistent across tasks.
