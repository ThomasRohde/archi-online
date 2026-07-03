# Script Extension System V2 Design

## Summary

Archi Online V2 scripting should keep the V1 trusted, browser/profile-local extension model, but add a real local package format for import and export. V2 packages are installed only into the current browser profile. They are not synced, fetched from remote sources, shared through `.archimate` files, or added to model undo history.

The V2 package format should be manifest-first and archive-based. A `.archi-ext` file is a zip archive containing `manifest.json`, `main.js`, optional extra scripts, optional assets, and optional human-readable docs. Installed packages are validated, persisted locally, flattened into the existing V1 runtime record shape, and loaded through the current extension registry.

## Goals

- Add local package import and export for extensions.
- Preserve V1 extension loading, source editing, runtime registry, event, command, menu, toolbar, panel, dialog, and storage behavior.
- Support multi-file extensions and bundled assets without adding remote install, marketplace, account sync, or an untrusted sandbox.
- Make package records compatible with later plugin tooling and static contribution validation.
- Keep extension data browser-local and outside `.archimate` files.

## Non-Goals

- No remote repository, URL, marketplace, or GitHub install in V2.
- No cross-browser or account synchronization.
- No permission prompts or untrusted sandbox.
- No arbitrary React component package loading.
- No model schema changes.
- No static manifest-only contribution runtime in the first V2 implementation; executable `main.js` still registers live contributions.

## Package Format

V2 introduces `.archi-ext`, a zip archive with normalized POSIX-style paths.

Required files:

- `manifest.json`
- `main.js`, or the path named by `manifest.main`

Optional files:

- `scripts/*.js`
- `assets/*`
- `README.md`
- package-owned JSON/text data files

The manifest shape is:

```ts
interface ExtensionManifestV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  contributes?: {
    commands?: StaticCommandContribution[];
    menus?: StaticMenuContribution[];
    toolbar?: StaticToolbarContribution[];
    panels?: StaticPanelContribution[];
    events?: StaticEventContribution[];
  };
}
```

Example `manifest.json`:

```json
{
  "schemaVersion": 2,
  "id": "local.audit-tools",
  "name": "Audit tools",
  "version": "0.2.0",
  "description": "Model audit commands and panels.",
  "main": "main.js",
  "contributes": {
    "commands": [],
    "menus": [],
    "toolbar": [],
    "panels": [],
    "events": []
  }
}
```

Static `contributes` fields are optional in V2. They are intended for validation, discoverability, and later tooling. Runtime registration through `main.js` remains the source of truth for live commands, menus, toolbar buttons, panels, and event handlers.

## Storage Architecture

V2 should keep the V1 runtime registry intact and split persistence into two layers:

- `InstalledExtensionPackage`: the canonical installed package record.
- `LocalExtensionRecord`: the flattened V1-compatible runtime record.

Package install record:

```ts
interface InstalledExtensionPackage {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: ExtensionManifestV2;
  files: Record<string, InstalledPackageFile>;
  installedAt: number;
  updatedAt: number;
}

interface InstalledPackageFile {
  mediaType?: string;
  encoding: 'utf8' | 'base64';
  content: string;
}
```

The runtime loader derives a V1-compatible record from the installed package:

```ts
{
  id: package.id,
  name: package.name,
  version: package.version,
  enabled: package.enabled,
  source: readPackageTextFile(package, package.manifest.main),
  createdAt: package.installedAt,
  updatedAt: package.updatedAt
}
```

This means the existing registry, command runner, event bridge, and dock panel host can continue to work. The new package installer owns archive parsing, manifest validation, file normalization, package persistence, and conversion to runtime records.

Text files such as `main.js`, `scripts/*.js`, `README.md`, and JSON files should use `encoding: 'utf8'`. Binary assets should use `encoding: 'base64'` with a detected or inferred media type. Runtime object URLs created for assets are cache entries, not persisted state; they should be revoked when a package reloads, unloads, or is uninstalled.

Storage can remain in `localStorage` for V2 if package limits are conservative. The public manifest/package model should not depend on that storage choice. If package size becomes a problem, a later V2.x can move `files` and assets to IndexedDB while keeping the same manifest and runtime APIs.

## Import, Export, And Management UI

The existing Extensions panel should gain package-level actions:

- **Import package**: select a `.archi-ext` archive, validate it, and install it into the current browser profile.
- **Export package**: export the selected package-owned extension back to `.archi-ext`.
- **Export source package**: wrap a V1 single-source extension into a valid V2 package.
- **Package details**: show manifest ID, version, description, main file, package file list, installed time, and updated time.
- **Reload package**: re-run the package through the existing extension runtime.
- **Uninstall package**: remove the installed package and clear its live registry contributions.

Package-owned extensions should be visibly different from V1 source extensions:

- metadata comes from `manifest.json`;
- source can be viewed;
- direct source edits are disabled by default;
- if the user chooses to edit source, the app should convert the package into a local override/draft instead of silently mutating the installed package.

This avoids ambiguity between imported package contents and local experiments. V1 source extensions remain editable as they are today.

Import/update flow:

1. User selects `.archi-ext`.
2. App parses archive and validates the manifest and files.
3. If no extension with the same ID exists, install it.
4. If the same ID exists, prompt for update/replace.
5. If confirmed, replace that package record atomically.
6. If enabled, reload the package into the runtime registry.

Export flow:

1. User selects an installed extension.
2. If package-owned, write its stored manifest and files into a zip.
3. If V1 source-owned, synthesize `manifest.json` and `main.js`.
4. Download as `{id}-{version}.archi-ext`.

## Runtime API V2

V2 should preserve all V1 APIs:

```ts
app.extension(meta)
app.commands.register(id, options)
app.commands.run(id, args?)
app.toolbar.addButton(options)
app.menus.addItem(location, options)
app.panels.register(id, options)
app.panels.show(id)
app.events.on(name, handler)
app.storage.get(key)
app.storage.set(key, value)
app.dialogs.info(title, message)
app.dialogs.confirm(title, message)
app.model.current()
```

V2 adds package-aware helpers:

```ts
app.extension.package()
app.manifest.get()
app.assets.url(path)
app.assets.text(path)
app.assets.json(path)
```

Semantics:

- `app.extension(meta)` still verifies the extension ID and remains valid for V1 scripts.
- `app.extension.package()` returns package metadata for package-owned extensions and `null` for V1 source extensions.
- `app.manifest.get()` returns a frozen copy of the package manifest, or a synthesized V1 manifest for source extensions if useful for consistency.
- `app.assets.url(path)` returns a browser object URL or data URL for package assets.
- `app.assets.text(path)` returns a text file from the installed package.
- `app.assets.json(path)` reads and parses a package JSON file.

Package APIs only expose files from the installed package after path normalization. They must not expose arbitrary browser or filesystem paths.

Asset URL lifetime is owned by the extension runtime. URLs should be stable within one load of a package, then revoked when that package is reloaded, disabled, or uninstalled.

## Validation And Error Handling

Package import should fail fast with specific errors and should not modify installed extensions on failure.

Validation failures:

- missing `manifest.json`;
- invalid manifest JSON;
- unsupported `schemaVersion`;
- missing or invalid `id`, `name`, `version`, or `main`;
- missing main file;
- unsafe file paths such as absolute paths, `..`, empty path segments, or backslashes that normalize ambiguously;
- duplicate paths after normalization;
- package too large for configured limits;
- duplicate installed ID unless the user confirms update/replace.

Runtime failures remain isolated to the failing extension, as in V1:

- failed package reload keeps the package installed;
- live contributions from the failed extension are cleared before reload;
- runtime errors appear in the Extensions panel;
- other extensions continue running;
- model dirty state and undo history are unaffected unless extension code mutates the model through existing model APIs.

Broken package panels should show the existing panel error message rather than crashing Dockview.

## Compatibility

V2 must be backward compatible:

- existing V1 `LocalExtensionRecord` entries continue to load unchanged;
- V1 source extensions can be exported as V2 `.archi-ext` packages;
- V2 packages flatten into V1 runtime records for execution;
- runtime surfaces continue to depend on the registry, not on whether an extension came from a source record or a package record.

The app should support both extension origins in the same browser profile:

- `source` origin: editable V1 source record;
- `package` origin: installed package record with read-only source by default;
- `override` origin: local editable draft derived from a package.

The exact origin field can be added to persisted records or maintained in a parallel package store, but the runtime-facing registry should not need to know the origin to execute contributions.

## Testing Strategy

Unit tests:

- manifest validation accepts a valid V2 package;
- manifest validation rejects each invalid shape with a specific error;
- archive path normalization rejects unsafe paths and duplicate normalized paths;
- package install is atomic when validation fails;
- package install/update replaces only the matching package ID;
- package export/import round trip preserves manifest and files;
- V1 source extension export produces a valid V2 package;
- package flattening produces the expected V1 runtime record;
- package assets can be read through `app.assets.text`, `app.assets.json`, and `app.assets.url`;
- package runtime errors are isolated to that extension.

Focused integration tests:

- enabled package loads after startup through the existing extension runtime;
- package toolbar/menu/panel contributions appear through the registry;
- imported package source is read-only by default in the Extensions panel;
- converting a package to a local override produces an editable source record without mutating the package record.

Browser smoke tests:

- import a `.archi-ext` package and see its command in the Extensions menu;
- open a package panel that uses a bundled asset;
- export the installed package and re-import it into a clean profile;
- update an installed package with the same ID and a newer version;
- failed package import leaves the previous installed package unchanged.

## Rollout Plan

Implement V2 in vertical slices:

1. Manifest and package validation helpers.
2. Zip import/export helpers.
3. Installed package store and flattening into runtime records.
4. Runtime package context and `app.assets`/`app.manifest` APIs.
5. Extensions panel package UI.
6. Browser smoke fixtures for import/export/update.

V1 extensions should remain usable after each slice. No implementation step should require deleting or migrating existing browser-local source extensions.

## Future Work

V2 deliberately stops before remote distribution. Later versions can add:

- package folder development mode;
- remote URL/GitHub install;
- update checks;
- package signing;
- permissions;
- static manifest contribution validation;
- marketplace or team-curated package catalogs.

These future capabilities should build on the V2 manifest and package store instead of changing the runtime registry contract.
