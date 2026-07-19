# Extension Packages

An extension package is a `.archi-ext` file — a zip archive that bundles an
extension's `manifest.json`, its main script, and any docs, JSON data, or
image assets into one importable unit. Packages make extensions portable:
export one from your browser, send it to a colleague, and they import it
through their **Extensions** panel.

Packages are installed into the current browser profile only. They are not
fetched remotely, not synced, and never stored in `.archimate` model files.
Imports show a trust warning because packages run local extension code with
full access to the current model and browser profile.

## The Extensions panel

The **Extensions** panel manages both kinds of extensions:

- **Source extensions** — created and edited directly in the panel
  (**Add extension**), with the source stored in the browser.
- **Package-owned extensions** — imported from `.archi-ext` archives and
  loaded from the installed package contents.

Available actions:

| Action | Notes |
| --- | --- |
| Add extension | Create a new editable source extension. |
| Import package | Install a `.archi-ext` archive (shows a trust warning). |
| Enable / disable | Per extension; disabled extensions don't load. |
| Save + Reload | Save edited source and re-run the extension. |
| Export | Save any extension as a `.archi-ext` archive — source extensions are wrapped into a package on export. |
| Convert to source | Turn a package-owned extension into an editable source extension. |
| Delete / uninstall | Removes the extension and its private storage. |
| Reload extensions | Re-run all enabled extensions. |

Errors raised while loading or running an extension are listed per extension
in the panel.

## Package layout

```text
manifest.json      (required)
main.js            (required — the manifest's "main" entry)
README.md
data/config.json
assets/icon.svg
```

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
      { "name": "selection.changed" }
    ]
  }
}
```

`contributes` is descriptive metadata — it documents what the extension is
expected to register, but the actual runtime behavior comes from the code in
`main.js` calling the [[Extension API|Extension-API]].

## Validation rules

Package import validates:

- `schemaVersion` must be `2`,
- `id`, `name`, `version`, and `main` must be non-empty strings,
- file paths must be relative, normalized, and use `/` — no `..`, `.`, empty
  segments, leading `/`, or backslashes,
- `manifest.json` must exist, and the `main` file must exist and be UTF-8
  text,
- at most 200 files per package and 5,000,000 characters of stored content in
  total.

## Assets

Package-owned extensions read their bundled files through `app.assets`:

```js
var readme = app.assets.text("README.md");
var config = app.assets.json("data/config.json");
var iconUrl = app.assets.url("assets/icon.svg");
```

Binary assets are stored base64-encoded and exposed as `data:` URLs through
`app.assets.url()`.

## Bundled examples

The repository ships five example packages under `extensions/`. Build the
importable archives with:

```bash
node extensions/build-archives.mjs
```

The `.archi-ext` files land in `extensions/dist/` (git-ignored); import them
through the Extensions panel.

| Package | Demonstrates |
| --- | --- |
| **Capability Map** (`examples.capability-map`) | The packed capability-map scripting APIs (`model.createPackedView`, `view.layoutPacked`, `view.syncPacked`, `view.applyHeatmap`) driven from tree/view context menus and a settings panel. |
| **ELK Layout** (`examples.elk-layout`) | The `app.layout.elk` automatic-layout API, menu commands, a settings panel, packaged JSON defaults, and private storage. |
| **Model Audit Dashboard** (`examples.model-audit-dashboard`) | Commands, toolbar button, menu item, a panel, packaged audit rules, dialogs, and private storage. |
| **Selection Workbench** (`examples.selection-workbench`) | Selection and context-menu commands, event handling, and a storage-backed selection history panel. |
| **Package Showcase** (`examples.package-showcase`) | Manifest and package metadata access plus bundled README/JSON/SVG assets. |
| **Event Log Console** (`examples.event-log-console`) | The full event bridge (app, model, view, tree, selection), a live log panel, and clear/open commands. |

The example sources are small and readable — they double as templates for
your own extensions.

Related pages:

- [[Extension API|Extension-API]] — the `app` API reference.
- [[Development]] — building the examples from the repository.
