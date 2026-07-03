# Archi Online

A web-based clone of the [Archi](https://www.archimatetool.com/) ArchiMate® modeling tool,
built with TypeScript + React, and scriptable in JavaScript through a
[jArchi](https://github.com/archimatetool/archi-scripting-plugin)-compatible API.

Everything runs in the browser — no backend. Models are saved as native `.archimate`
files that open in desktop Archi (and vice versa), with autosave to IndexedDB.

## Features

- **ArchiMate 3.2 metamodel** — all element and relationship types, with the official
  allowed-relationship matrix (generated from Archi's own `relationships.xml`)
- **IDE-style docking layout** ([dockview](https://dockview.dev)) — every view opens as a
  draggable tab; split editors side-by-side, rearrange the Models/Properties/Scripting
  panels, layout persists across sessions (toolbar → Reset Layout to restore defaults)
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

## Architecture

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
