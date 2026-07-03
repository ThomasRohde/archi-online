# Extension Packages

Extension packages are local `.archi-ext` archives. They let an extension bundle
`manifest.json`, `main.js`, optional docs, JSON config, images, and other assets
into one importable file.

Packages are installed only into the current browser/profile. They are not
fetched remotely, synced by the app, or stored in `.archimate` model files.

## Build Example Packages

The repository includes example package source under `extensions/`.

Build archives:

```bash
node extensions/build-archives.mjs
```

Generated archives are written to `extensions/dist/` and are ignored by Git.

Import a generated `.archi-ext` file through the app's **Extensions** panel.
Imports show a trust warning because packages run local extension code with full
access to the current model and browser profile.

## Package Layout

Typical package:

```text
manifest.json
main.js
README.md
data/config.json
assets/icon.svg
```

`manifest.json` and the manifest `main` file are required.

## Manifest

```json
{
  "schemaVersion": 2,
  "id": "examples.model-audit-dashboard",
  "name": "Model Audit Dashboard",
  "version": "0.1.0",
  "description": "Counts model content and reports warnings.",
  "main": "main.js",
  "contributes": {
    "commands": [
      {
        "id": "examples.model-audit-dashboard.run",
        "title": "Run model audit",
        "description": "Count model content and store the latest audit result."
      }
    ],
    "menus": [
      {
        "id": "examples.model-audit-dashboard.menu.run",
        "label": "Run model audit",
        "command": "examples.model-audit-dashboard.run",
        "location": "extensions.menu"
      }
    ],
    "toolbar": [
      {
        "id": "examples.model-audit-dashboard.toolbar",
        "label": "Audit",
        "command": "examples.model-audit-dashboard.run"
      }
    ],
    "panels": [
      {
        "id": "examples.model-audit-dashboard.panel",
        "title": "Model Audit"
      }
    ],
    "events": [
      {
        "name": "selection.changed"
      }
    ]
  }
}
```

Static `contributes` metadata documents expected runtime contributions. The
actual runtime behavior still comes from `main.js`.

## Validation Rules

Package import validates:

- `schemaVersion` must be `2`
- `id`, `name`, `version`, and `main` must be non-empty strings
- package paths must be relative, normalized, and use `/`
- paths cannot contain `..`, `.`, empty segments, leading `/`, or backslashes
- `manifest.json` must exist
- the manifest `main` file must exist and be UTF-8 text
- installed package records are bounded by file count and stored content size
- oversized compressed archives are rejected before decompression

## Assets

Package-owned extensions can read files:

```js
var readme = app.assets.text("README.md");
var config = app.assets.json("data/config.json");
var iconUrl = app.assets.url("assets/icon.svg");
```

Binary assets are stored as base64 records in the installed package and exposed
as data URLs through `app.assets.url()`.

## Import, Export, And Source Packages

The **Extensions** panel supports:

- importing `.archi-ext` package archives
- uninstalling imported packages
- exporting installed packages
- exporting source extensions as package archives
- converting a package main file to editable source
- reloading enabled extensions

Source extensions remain editable in the browser. Package-owned extensions are
loaded from imported package contents.

Converting a package to source keeps only the package `main` file. The app warns
when bundled files would be lost because `app.assets.*` only works for
package-owned extensions.

## Example Packages

The repo includes these example packages:

- `model-audit-dashboard` - commands, toolbar, menu, panel, packaged JSON rules,
  SVG asset, dialogs, and private storage.
- `selection-workbench` - selection commands, context menu integration, event
  handling, private storage, and panel rendering.
- `package-showcase` - package metadata, manifest access, bundled README, JSON,
  and SVG asset APIs.
- `event-log-console` - event bridge listeners, event storage, panel rendering,
  and clear/open commands.
- `elk-layout` - app-hosted ELK layout API usage, context-menu commands, a
  dockable settings panel, packaged JSON defaults, and private storage.

Related pages:

- [[Extension API|Extension-API]]
- [[Development|Development]]
