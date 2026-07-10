# Archi Online

[![CI](https://github.com/ThomasRohde/archi-online/actions/workflows/ci.yml/badge.svg)](https://github.com/ThomasRohde/archi-online/actions/workflows/ci.yml)
[![Docs](https://github.com/ThomasRohde/archi-online/actions/workflows/docs.yml/badge.svg)](https://thomasrohde.github.io/archi-online/)
[![Release](https://img.shields.io/github/v/release/ThomasRohde/archi-online)](https://github.com/ThomasRohde/archi-online/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A web-based clone of the [Archi](https://www.archimatetool.com/) ArchiMate® modeling tool,
built with TypeScript + React, and scriptable in JavaScript through a
[jArchi](https://github.com/archimatetool/archi-scripting-plugin)-compatible API.

Everything runs in the browser — no backend. Multiple models can be open at once,
saved as native `.archimate` files that open in desktop Archi (and vice versa), with
the complete workspace autosaved to IndexedDB.

## Features

- **ArchiMate 3.2 metamodel** — all element and relationship types, with the official
  allowed-relationship matrix (generated from Archi's own `relationships.xml`)
- **IDE-style docking layout** ([dockview](https://dockview.dev)) — every view opens as a
  draggable tab; split editors side-by-side, rearrange the Models/Palette/Properties/
  Scripting panels, float groups or pop them out into separate windows, maximize any
  group. Layout persists across sessions; the toolbar **Views** menu reopens closed
  panels and resets the layout
- **Multi-model workspace** — multiple independent model roots, per-model undo/save state,
  cross-model view tabs, tree↔view copy/paste with context-menu actions, and full workspace restore
- **Model tree** — folders, drag-drop, context menus, inline rename
- **View editor** — custom SVG canvas with:
  - drag/resize/nesting with grid snap, marquee selection, copy/paste
  - relationship tools with live validity feedback and a *magic connector*
  - manual bendpoints (drag a connection; double-click a bendpoint to remove)
  - notes, groups, view references, zoom/pan, direct-edit renaming
- **Properties panel** — name/documentation, key-value properties, appearance
  (colors, opacity, text alignment)
- **File compatibility** — lossless `.archimate` round-trip (verified against the
  Archisurance example), File System Access API save/open with download fallback
- **jArchi-style scripting** — `$()` selectors, `model.createElement(...)`,
  `view.add(...)`, properties, relationship traversal (`rels`, `sourceEnds`, …),
  Monaco editor with API IntelliSense, script library with `.ajs` import/export.
  A script run is a single undo step.

```js
// Example script
var actor = model.createElement("business-actor", "Customer");
var svc = model.createElement("business-service", "Claims Service");
var rel = model.createRelationship("serving-relationship", "", svc, actor);

var view = model.createArchimateView("Overview");
var vs = view.add(svc, 40, 120, 140, 60);
var va = view.add(actor, 40, 20, 140, 60);
view.add(rel, vs, va);
view.openInUI();

$("business-actor").each(function (a) { console.log(a.name); });
```

## Development

```bash
npm install
npm run dev        # start dev server on http://localhost:5173
npm test           # vitest: rules matrix, ops/undo, .archimate round-trip, jArchi API
npm run build      # typecheck + production build (static site in dist/)
```

`tools/generate-rules.mjs` regenerates `src/model/data/relations-matrix.ts` from
Archi's relationship matrix (`tools/data/relationships.xml`).

## Sharing Example

A public gist-hosted example model is available for testing the read-only
viewer and share-link flow:

- [Archi Online Capability Model gist](https://gist.github.com/ThomasRohde/d76393598cc8ee09c27f6e829581297e)
- [Open the model in the hosted viewer](https://bitter-mill-c9qn.here.now/?mode=viewer#gist=d76393598cc8ee09c27f6e829581297e)

## Documentation

The live app runs at **https://bitter-mill-c9qn.here.now/**. The documentation
site is published to GitHub Pages at **https://thomasrohde.github.io/archi-online/**,
built with VitePress from the same `docs/wiki/` source and deployed by
[`.github/workflows/docs.yml`](.github/workflows/docs.yml); see
[docs/pages-publishing.md](docs/pages-publishing.md).

The same pages also publish to the
[project wiki](https://github.com/ThomasRohde/archi-online/wiki). The source is
maintained in `docs/wiki/` so documentation changes are reviewed like code:

- [Wiki home](docs/wiki/Home.md)
- [Getting started](docs/wiki/Getting-Started.md)
- [User guide](docs/wiki/User-Guide.md)
- [Archi compatibility](docs/wiki/Archi-Compatibility.md)
- [Scripting API](docs/wiki/Scripting-API.md)
- [Extension API](docs/wiki/Extension-API.md)
- [Extension packages](docs/wiki/Extension-Packages.md)
- [Development](docs/wiki/Development.md)

Run `npm run docs:check` after editing, then `npm run docs:publish-wiki` to
push the pages to the GitHub Wiki (see [docs/wiki-publishing.md](docs/wiki-publishing.md)).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow and [ARCHITECTURE.md](ARCHITECTURE.md) for the
architectural principles changes are reviewed against. Release history is in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).

Some Archi compatibility data and icon geometry are derived from the Archi
project under the MIT License. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architectural principles.

- `src/model/` — pure-TS domain core: metamodel, rules, normalized Zustand store,
  Immer-patch undo/redo, operations, `.archimate` XML I/O
- `src/canvas/` — SVG view editor: figures, connection geometry/decorations,
  pointer-gesture interactions
- `src/scripting/` — jArchi-compatible API and script runner
- `src/ui/` — app shell, dockview layout controller, model tree, palette, properties
  panel, script panel
- `src/persistence/` — file open/save and IndexedDB autosave

ArchiMate® is a registered trademark of The Open Group. This project is not
affiliated with The Open Group or the Archi project.
