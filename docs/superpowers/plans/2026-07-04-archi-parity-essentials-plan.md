---
title: "feat: Archi parity essentials — view image export, tree search, presentation mode, Open Exchange & CSV"
type: feat
status: completed
date: 2026-07-04
origin: docs/brainstorms/2026-07-04-archi-parity-essentials-requirements.md
---

# ✨ Archi Parity Essentials

## Overview

Close the five highest-friction parity gaps with desktop Archi, in two
fronts: **daily-driver essentials** (get a diagram out as an image, find
things in big models, present views full-screen) and **interop** (ArchiMate
Open Exchange format, Archi-format CSV). Each phase is independently
shippable. Fidelity to Archi's behavior and file formats is the spec
(see origin: docs/brainstorms/2026-07-04-archi-parity-essentials-requirements.md).

Requirements R1–R9 below refer to the origin document's IDs.

## Problem Statement

A desktop Archi user fails within minutes of a real session: no way to
export a view as an image for a deck, no way to search a large model tree,
no way to exchange models with other tools. These gaps decide whether the
app can be a daily modeler or stays a demo. (Magic Connector was found to
already exist — the pending-connection overlay offers valid types from the
relations matrix, `src/canvas/view-editor/useViewEditorInteractions.ts:146` —
so it is **not** part of this arc.)

## Proposed Solution

Five features on existing seams:

1. **View image export (R1–R3)** — a pure, store-free SVG render of a view,
   serialized to standalone SVG, rasterized to PNG, and written to the
   clipboard.
2. **Model tree search (R5)** — type-ahead filter with concept-type filter
   in `ModelTree`.
3. **Presentation mode (R4)** — full-screen overlay hosting the existing
   read-only view renderer with keyboard view navigation.
4. **Open Exchange import/export (R6–R7)** — new `src/model/io/exchange-xml/`
   sibling of `archimate-xml/`, ported from Archi's
   `org.opengroup.archimate.xmlexchange` plugin.
5. **CSV export/import (R8–R9)** — `src/model/io/csv/`, ported from Archi's
   `com.archimatetool.csv` plugin.

## Technical Approach

### Phase 1 — View image export (R1, R2, R3)

**Seam:** `ViewEditor` already decomposes into pure `NodeView` +
`ConnectionView` over `computeAbsBounds(model, viewId)`
(`src/canvas/ViewEditor.tsx`, `src/canvas/view-editor/bounds.ts`). Extract a
static render component with no store subscriptions, no viewport hook, no
interactions.

**Tasks:**
- [ ] `src/canvas/export/StaticViewSvg.tsx` — pure `(model, viewId, options) → <svg>`
      reusing `NodeView`/`ConnectionView`; no selection, no handles, no
      overlays. Verify `NodeView`/`ConnectionView` take everything via props
      (they render inside the same tree today); lift any store reads.
- [ ] `src/canvas/export/view-image.ts` —
      `computeContentBounds(model, viewId)`: union of absolute node bounds
      **plus connection bendpoints and connection label extents** (labels can
      extend past node bounds), plus a margin (default per Archi's exporter).
      `renderViewSvg(...)`: render `StaticViewSvg` offscreen (detached
      container via `createRoot`, `flushSync`), serialize with
      `XMLSerializer`, embed a minimal `<style>` block + explicit
      `font-family: 'Segoe UI', system-ui, -apple-system, sans-serif`
      (matches `src/styles.css:38`; audit which canvas styles come from CSS
      classes and inline them — the exported SVG must be self-contained).
      `renderViewPng(...)`: SVG blob → `Image` → `<canvas>` at scale
      (1×/2×/4×) with white or transparent background → `toBlob('image/png')`.
- [ ] Clipboard copy: `navigator.clipboard.write([new ClipboardItem({'image/png': promise})])`
      using the promise form (Safari requires it); feature-detect and show a
      toast/dialog fallback ("copy not supported — use PNG export") where
      `ClipboardItem` is unavailable (Firefox variants).
- [ ] UI: Toolbar entry + view-tab/canvas context menu: "Export view as
      image…" opens an `AppDialog` (format PNG/SVG, scale, margin,
      background) and "Copy view as image". Save via
      `src/persistence/files.ts` download/save-picker helpers; default
      filename = sanitized view name.
- [ ] Reference: Archi's image export + `com.archimatetool.export.svg`
      plugin for margin/scale defaults. The dialog UX may be simplified vs
      desktop (fidelity rule targets rendering, not Eclipse dialog layout).

**Edge cases:** empty view (export tiny margin-only image, matching Archi);
selection must never leak into export; nested-child absolute bounds come
from `computeAbsBounds` (already handles nesting).

**Acceptance:** exported PNG/SVG is pixel-faithful to the canvas for the
Archisurance views; clipboard paste works into an image-accepting app on
Chromium; unit tests cover `computeContentBounds` and SVG serialization
(snapshot); playwright drive verifies a real export downloads.

### Phase 2 — Model tree search (R5)

**Seam:** `src/ui/ModelTree.tsx`.

**Tasks:**
- [ ] Search box pinned at the top of the tree panel: case-insensitive
      substring match on **name**, over elements, relationships, views, and
      folders; optional concept-type filter (reuse type lists from
      `src/model/metamodel.ts`).
- [ ] While filtering: show only matches with their ancestor folders
      auto-expanded (desktop Archi filters the tree in place); clearing the
      filter restores the previous expansion state.
- [ ] Selecting a match selects the concept (Properties panel follows, as
      selection already drives it); double-click on a view still opens it.
- [ ] Keyboard: shortcut to focus the box (avoid bare Ctrl+F — browser
      find); Esc clears and returns focus to the tree.
- [ ] Match Archi's search-widget scope where cheap: name always; type
      filter; documentation-text search only if it falls out naturally
      (origin defers this decision to planning — **decision: name + type
      now, documentation search deferred**).

**Acceptance:** in a 500+ element model, typing narrows the tree live with
no perceptible lag; a vitest test covers the filter predicate + ancestor
expansion logic.

### Phase 3 — Presentation mode (R4)

**Seam:** `ViewEditor readOnly` variant (`src/canvas/ViewEditor.tsx:27`)
already renders chrome-free, selection-light views; the viewer shell proves
the reuse path.

**Tasks:**
- [ ] `src/ui/PresentationMode.tsx` — portal overlay (`position: fixed;
      inset: 0`) rendering `<ViewEditor viewId readOnly>`; request
      `Element.requestFullscreen()` on entry, degrade gracefully to the
      overlay if the request is denied. **Do not touch dockview** — the
      overlay approach sidesteps the maximized-group layout-persistence
      gotcha (CLAUDE.md).
- [ ] Navigation: ←/→ and PgUp/PgDn step through the model's views in
      model-tree order (flattened diagrams folder); Esc exits (native
      fullscreen exit must also unmount the overlay — listen to
      `fullscreenchange`); fit-to-view on each view entry; pan/zoom stays
      live.
- [ ] Minimal HUD: view name + "n / total", auto-fading; no other chrome.
- [ ] Entry points: toolbar button + keyboard shortcut (browser reserves
      F11; pick an available binding and document it in the shortcuts help).

**Acceptance:** a multi-view model can be walked end-to-end full-screen with
arrows; Esc always returns to an intact editor layout (verify layout JSON
unchanged); playwright drive covers enter → navigate → exit.

### Phase 4 — Open Exchange format import/export (R6, R7)

**Seam:** mirror `src/model/io/archimate-xml/` (parse.ts / serialize.ts /
xml.ts) as `src/model/io/exchange-xml/`. **Port from Archi's
`org.opengroup.archimate.xmlexchange` plugin** (`XMLModelImporter`,
`XMLModelExporter`, `XMLExchangeUtils`) — do not invent mappings. That
plugin's test data supplies fixtures (vendor one OEF sample + note it in
the third-party notices file, as done for other Archi-derived assets).

**Mappings to port exactly (each has a home in our model already):**
- [ ] Concept types → OEF `xsi:type` names, incl. `AndJunction`/`OrJunction`
      ↔ our `junctionType` (`src/model/types.ts:36`).
- [ ] Identifiers: OEF ids must be NCName — port Archi's id conversion and
      keep a stable id map so round-trips don't churn ids.
- [ ] `properties` → global `<propertyDefinitions>` table + per-object
      `propertyDefinitionRef`.
- [ ] Folders ↔ `<organizations>` item tree (all top-level folder types,
      `src/model/types.ts:59`).
- [ ] Views: our parent-relative node bounds ↔ OEF absolute coordinates
      (Archi's `convertToAbsoluteBounds` equivalent; we have the data in
      `computeAbsBounds`); relative bendpoints ↔ OEF absolute waypoints via
      `bendpointPositions`/`toRelativeBendpoint` (`src/canvas/geometry.ts`).
- [ ] Styles: fill/line/font colors, alpha 0–255 ↔ OEF opacity, line width,
      font strings — port Archi's exact conversions.
- [ ] Notes → `Label`, groups → `Container`, diagram references and
      nested/connection-to-connection cases: match whatever Archi does,
      including what it drops.
- [ ] Relationship extras: `accessType`, Influence `strength`, Association
      `directed` — port attribute names/values.
- [ ] Viewpoint id ↔ OEF viewpoint naming (port Archi's table).
- [ ] Anything OEF cannot represent (e.g. figure variants): match Archi's
      behavior and document the loss in the wiki page for interop.

**Integration:**
- [ ] Open flow: extend `src/persistence/files.ts` picker types with `.xml`;
      sniff the root element (opengroup namespace `<model>` vs
      `<archimate:model>`) to route parser. OEF import loads as a new model
      through the same boot path as `.archimate` open (no undo needed).
- [ ] Export: Toolbar "Export → Open Exchange (.xml)…" reusing save helpers.
- [ ] Tests: `tests/exchange-xml.test.ts` — import the vendored OEF fixture
      and assert model shape; export Archisurance and re-import (round-trip
      equivalence, id stability). Manual gate: desktop Archi opens our
      export without errors.

### Phase 5 — CSV export/import (R8, R9)

**Port from Archi's `com.archimatetool.csv`** (`CSVConstants`,
`CSVExporter`, `CSVImporter`): three files (`{prefix}elements.csv`,
`{prefix}relations.csv`, `{prefix}properties.csv`), exact headers, the model
itself written as the first elements row, delimiter options
(comma/semicolon/tab), UTF-8 with optional BOM, Archi's quoting/escaping
incl. newlines inside quoted fields.

**Tasks:**
- [ ] `src/model/io/csv/constants.ts` + `serialize.ts` + `parse.ts` — a
      small strict CSV writer/reader matching Archi's rules (no new
      dependency); headers and column order transcribed from `CSVConstants`.
      The `Specialization` column (present in current Archi) is written
      empty and ignored on import — profiles are out of scope (origin
      boundary).
- [ ] Export dialog (`AppDialog`): prefix, delimiter, BOM; downloads the
      three files via `files.ts` helpers.
- [ ] Import: multi-file picker (accepts 1–3 files, mapped by filename
      suffix); port Archi's semantics — match by ID → update
      name/documentation/properties, unknown ID → create, relations
      validated against source/target existing in file or model; all
      mutations through `src/model/ops.ts` inside **one `runBatch()`** so
      the whole import is a single undo step; per-row errors collected and
      shown, not thrown one at a time.
- [ ] Tests: `tests/csv.test.ts` — round-trip our export→import; import a
      fixture generated by desktop Archi (vendor + notice); quoting edge
      cases (delimiters, quotes, newlines, BOM).

## System-Wide Impact

- **Interaction graph:** export paths are pure readers (render → serialize)
  with zero store writes; CSV import is the only new mutation surface and
  funnels through `ops.ts`/`runBatch` (undo/redo integrity preserved). OEF
  import reuses the model-load path, so autosave (IndexedDB) and dockview
  panel reconciliation behave exactly as `.archimate` open does.
- **Error propagation:** parser errors (OEF/CSV) surface as the existing
  open-failure dialog path; CSV import aggregates row errors into one
  report. Clipboard/fullscreen API denials degrade to explicit fallbacks,
  never silent no-ops.
- **State lifecycle risks:** a failed CSV import must abort the whole
  `runBatch` (no partially-applied rows). Presentation mode never writes
  layout state — the dockview maximized-group persistence gotcha cannot
  trigger.
- **API surface parity:** jArchi/scripting and the extension `app-api` do
  not gain these capabilities in this arc (view render-to-image and
  exchange export as script commands are natural follow-ups — noted in
  Future Considerations). The read-only viewer could later accept OEF URLs.
- **Integration test scenarios (beyond unit tests):**
  1. Export Archisurance view → PNG, compare dimensions/content bounds.
  2. OEF export → re-import → deep-equal model (modulo documented losses).
  3. CSV import of an Archi-generated file into a non-empty model → one
     undo step reverts everything.
  4. Presentation walk across all views → editor layout JSON identical
     before/after.
  5. Tree search while a view is open → selection sync with Properties.

## Acceptance Criteria

Functional (mapped to origin requirements):
- [x] R1 PNG export with scale + background options, canvas-faithful.
- [x] R2 standalone SVG export (self-contained styles/fonts).
- [x] R3 copy-view-as-image with graceful unsupported-browser fallback.
- [x] R4 full-screen presentation: pan/zoom, arrow-key view stepping, Esc.
- [x] R5 tree search: name filter + type filter, ancestor-preserving,
      selection sync.
- [x] R6 OEF import produces the model desktop Archi would produce.
- [x] R7 OEF export opens cleanly in desktop Archi (round-trip verified;
      desktop-Archi manual gate outstanding — no desktop Archi in this env).
- [x] R8 CSV export consumable by desktop Archi's importer (format verified
      against Archi's own constants; desktop manual gate outstanding).
- [x] R9 CSV import matches Archi semantics; single undo step.

Quality gates:
- [x] `npm run build` clean; new vitest suites (`exchange-xml`, `csv`,
      `view-image`, `tree-filter`, `presentation`) green (210 tests).
- [x] Playwright drive per CLAUDE.md: tree search, PNG export (faithful,
      untainted), presentation mode, and CSV 3-file export verified live;
      CSV import verified by unit tests + confirmed menu/file-chooser wiring
      (live store read blocked by playwright session resets in this env).
- [x] Third-party notices updated for vendored Archi fixtures.
- [x] Wiki: new "Import & Export" page; sidebar, toolbar table, and tree
      section updated; shortcuts help updated.

## Success Metrics

- Slide-ready image of any view in ≤ 2 clicks (file or clipboard).
- Archisurance OEF round-trip: archi-online → desktop Archi → archi-online
  without errors or content loss beyond documented lossy fields.
- CSV round-trips with desktop Archi in both directions.
- Any element findable by name in seconds in a 500+ element model.
- A stakeholder walkthrough runs full-screen with zero editor chrome.

## Dependencies & Risks

| Risk | Mitigation |
| --- | --- |
| Canvas styling partially lives in CSS classes → exported SVG not self-contained | Phase-1 audit; embed needed rules in the SVG `<style>`; snapshot test |
| Clipboard `ClipboardItem` variance (Firefox/Safari) | Promise-form write, feature-detect, explicit fallback message |
| OEF spec breadth (viewpoints, nested coords, junctions) | Port Archi's importer/exporter 1:1; vendored fixtures; manual desktop-Archi gate |
| NCName id conversion breaking round-trip id stability | Port Archi's scheme; round-trip test asserts id stability |
| CSV quoting/BOM/CRLF quirks vs Excel and Archi | Transcribe `CSVConstants` rules; fixture generated by desktop Archi |
| `NodeView`/`ConnectionView` hide store reads that block a pure static render | Verified render decomposition first (`ViewEditor.tsx`); lift any stragglers via props |

## Alternatives Considered (from origin)

- **HTML report export** — rejected: share links + the read-only viewer are
  this product's answer to a browsable stakeholder model; avoids a second
  read-only pipeline (origin key decision).
- **Magic Connector** — dropped from scope: already implemented.
- **PDF export, print, templates, format painter** — cut for this arc.
- **Analysis cluster (Navigator/Validator) and profiles/specializations** —
  deliberate follow-up arcs, not this one.

## Future Considerations

- Expose `renderViewAsImage` / OEF export to jArchi scripting and the
  extension `app-api` (jArchi has image-render APIs; parity opportunity).
- Viewer/share links accepting OEF URLs; PWA `file_handlers` for `.xml`.
- Documentation-text search and property search in the tree filter.
- Selection-only image copy (view-level ships first).

## Sources & References

### Origin
- **Origin document:** [docs/brainstorms/2026-07-04-archi-parity-essentials-requirements.md](../../brainstorms/2026-07-04-archi-parity-essentials-requirements.md)
  — key decisions carried forward: clusters A+C over analysis/fidelity;
  formats ported from Archi source, never approximated; share links
  substitute for HTML report; Magic Connector excluded (already exists).

### Internal
- Render seam: `src/canvas/ViewEditor.tsx:27` (read-only split),
  `src/canvas/view-editor/bounds.ts` (`computeAbsBounds`),
  `src/canvas/geometry.ts` (bendpoint conversions).
- File plumbing: `src/persistence/files.ts` (FS Access + download fallback).
- IO pattern to mirror: `src/model/io/archimate-xml/` +
  `tests/archimate-xml.test.ts` (Archisurance round-trip).
- UI infra: `src/ui/Toolbar.tsx`, `src/ui/ContextMenu.tsx`,
  `src/ui/AppDialog.tsx`, `src/ui/ModelTree.tsx`.
- Canvas font stack: `src/styles.css:38`.

### External (porting references — read during implementation)
- Archi OEF plugin: `org.opengroup.archimate.xmlexchange`
  (github.com/archimatetool/archi) — importer/exporter/utils + test data.
- Archi CSV plugin: `com.archimatetool.csv` — constants/exporter/importer.
- Archi image/SVG export: `com.archimatetool.editor` export providers,
  `com.archimatetool.export.svg`.

### Related
- Prior arc (viewer/share) plan:
  `docs/superpowers/plans/2026-07-04-model-sharing-and-review-plan.md`
  (M2 diff will reuse Phase 1's static view render — compounding win).
