# UX, UI & Performance Review — Archi Online

**Version reviewed:** 1.5.1 (commit `4183584`, 2026-07-15)
**Method:** three-phase workflow — (1) code survey of the rendering/state/UI hot paths, (2) live session against the real app (Vite dev server driven via Playwright: Archisurance example plus a generated 400-node stress view), (3) production bundle and load analysis of `dist/`.

**Measurements taken during the live session** (Chrome, 1600×950, dev build — production is faster in absolute terms, but the relative costs hold):

| Scenario | Result |
| --- | --- |
| Drag one node, Archisurance Layered View (~60 nodes) | 59 FPS — smooth |
| Drag one node, stress view (400 nodes / 200 connections) | **39 FPS, 1 744 ms of long tasks during a 4.5 s drag** |
| Wheel pan, stress view | 60 FPS |
| Ctrl+wheel zoom, stress view | 120 FPS (display-limited) |
| Production build load (localhost preview) | FCP ~0.5 s, ~2.0 MB transferred, 8 JS requests |

**Overall:** the app is in very good shape. Archi fidelity is excellent, the welcome screen / contextual toolbar help / settings panel are genuinely polished, keyboard support on the canvas is broad (arrows, F2, clipboard, zoom), console is clean, and undo batching works. The findings below are ranked by user impact; each includes a suggested fix.

---

## 1. Performance

### P1 — HIGH: Node drag re-renders the entire view on every pointer move

**Evidence:** measured 39 FPS with 1.7 s of accumulated long tasks while dragging a single node on a 400-node view. The cause is structural:

- Every pointer move calls `setInter` (`src/canvas/view-editor/useViewEditorInteractions.ts:131`, used throughout the move/resize/bend handlers), which re-renders `EditableViewEditor` — and with it **all** `NodeView` → `NodeFigure` trees and all `ConnectionView`s (`src/canvas/ViewEditor.tsx:308-345`).
- There is **no `React.memo`, `useDeferredValue`, or `useTransition` anywhere in `src/`** (verified by grep), so nothing short-circuits the per-frame re-render.
- Per render, `EditableViewEditor` also rebuilds `createNestedConnectionVisibilityResolver`, **two** `createConnectionRouteResolver` instances, and `deriveLiveViewState` (`src/canvas/ViewEditor.tsx:247-274`), and every node/connection with a `labelExpression` re-runs `evaluateLabelExpression` (`src/canvas/view-editor/NodeView.tsx:65-67`, `ViewEditor.tsx:341`).

**Suggested fix (in order of payoff):**
1. Wrap `NodeView` and `ConnectionView` in `React.memo`. To make that effective, stop passing the volatile interaction state (`moveDelta`, `resize`, `dropParentId`, `connectHover`) into every node — a node's props change only if *it* is affected. Pass primitives (e.g. `dx`/`dy` numbers, `isDropTarget` boolean) computed per node in the parent, so memo comparison works.
2. Move the live-drag translation out of React entirely: during a move, apply `transform` directly to the dragged nodes' `<g>` elements (refs are already reachable via `data-node-id`), and only commit through the store on pointer-up. This is what makes GEF/Archi feel instant and caps drag cost at O(selection) instead of O(view).
3. Memoize the route/visibility resolvers with `useMemo` keyed on `[model, liveAbs, settings]`, and cache `evaluateLabelExpression` results keyed on `(id, expression, model)` (a `WeakMap`-based cache like `assetDataUrl`'s in `src/model/assets.ts:20` fits).

### P2 — MEDIUM: Main bundle is 2.87 MB raw / ~958 KB gzipped

**Evidence:** `dist/assets/index-*.js` = 3.0 MB (958 KB gz). Monaco and elkjs are already lazy-loaded (good), but the main chunk still statically includes:

- the ArchiMate Exchange import/export stack including the libxml2-wasm XSD validator glue — reachable statically via `src/persistence/files.ts:7` → `src/model/io/exchange-xml.ts` → `exchange-xml/validation.ts:8`;
- `image-js` (TIFF decode / PNG encode), imported statically in `src/model/assets.ts:1` but only needed when a TIFF image is added;
- `lucide-react`, `dockview`, the generated 3 973-line relations matrix (these are legitimately core).

**Suggested fix:** make the exchange-XML entry points dynamic imports (`ExportExchangeDialog` and the `isExchangeXml`/`parseExchange` branch in `files.ts` are natural seams — the parse path is already async), and lazy-import `image-js` inside `createModelAsset`'s TIFF branch. That alone should cut several hundred KB gz from first load. Optionally add `build.rollupOptions.output.manualChunks` to split stable vendors (react, dockview) for better long-term caching.

### P3 — MEDIUM: Autosave serializes the whole model to XML on the main thread after every edit burst

**Evidence:** every transaction triggers `schedulePersist` (800 ms debounce) → `persistWorkspace` → `serializeArchimateDocument(state.model)` for each changed session (`src/persistence/autosave.ts:47-53`, `113-117`). On a several-thousand-element model this runs full XML serialization on the UI thread right after the user pauses — precisely when they expect responsiveness.

**Suggested fix:** move serialization into a Web Worker (the model is plain data and already `structuredClone`-able, see `cloneModelForEditing` in `src/model/store.ts:411`), or store the Immer patches incrementally and only serialize on save/idle (`requestIdleCallback`) as a fallback.

### P4 — MEDIUM: Model tree renders every row and re-runs search over all sessions on each model change

**Evidence:** `ModelTree` has no virtualization — a 5 000-element model produces 5 000+ row divs. `searchModelTree` runs for every open session on every `modelRevision` bump, and `collectTreeSearchCatalog` rebuilds the catalog likewise (`src/ui/ModelTree.tsx:229-246`). Fine at Archisurance scale (verified live), but it degrades on the large models the multi-model workspace invites.

**Suggested fix:** windowed rendering for tree rows (flatten visible rows — collapse state already exists — and render only the viewport slice; no library needed at this row height), plus `useDeferredValue` on the search query so typing in the filter doesn't block on full-model searches.

### P5 — LOW: PWA precache downloads ~16 MB on first visit

**Evidence:** `vite.config.ts` raises `maximumFileSizeToCacheInBytes` to 8 MB specifically so Monaco's 7 MB `ts.worker` is precached, and the glob precaches all JS including all Monaco workers (`css.worker` 1 MB, `html.worker` 0.7 MB…) — paid by every first-time visitor even if they never open the script editor.

**Suggested fix:** exclude the Monaco worker/editor chunks from `globPatterns` and register a `runtimeCaching` route (CacheFirst) for them instead, so scripting users still get offline support after first use.

### P6 — LOW: Status-bar coordinates re-render on every mouse pixel

**Evidence:** `onCanvasPointerMove` publishes cursor x/y to the `useCanvasStatus` store on every pointer move (`src/canvas/ViewEditor.tsx:213-219`), re-rendering the status bar continuously. Cheap, but it's free to fix: throttle to `requestAnimationFrame`, or write to a ref-backed DOM node.

---

## 2. UX

### U1 — HIGH: Opening a model/example leaves the canvas empty, and opening a view shows it un-fitted

**Evidence (live):** after "Load Archisurance example", the canvas area still shows the Welcome tab; the user must find the Views folder in the tree (the hint text helps, but it's a dead end on mobile-sized trees with 120 elements sorted above the Views folder). After double-clicking a view, it renders at 100 % anchored top-left — the Layered View was cut off on the right and bottom until manually zoomed (`useCanvasViewport` initializes `{ zoom: 1, x: 20, y: 20 }`, `src/canvas/view-editor/useCanvasViewport.ts:17-19`; viewports live in a module-level map that doesn't survive reload).

**Suggested fix:** (a) when a model loads with no view open, auto-open its default/first view (Archi's tree order is preserved, so "first view" is deterministic); (b) on first open of a view in a session, call the existing `fitToView()` when the diagram doesn't fit the visible canvas at 100%; (c) persist per-view viewports in the workspace autosave record so reopening feels continuous.

### U2 — MEDIUM: The model tree is unusable from the keyboard

**Evidence:** tree rows are plain `div`s — `tabIndex` −1, no `role`, no key handling beyond Ctrl+F on the container (`src/ui/ModelTree.tsx:103-196`, container at `:383-388`). A keyboard-only user cannot select, expand, open, or rename anything in the tree; a screen reader announces nothing meaningful. This is the single largest accessibility gap — the rest of the app (toolbar, palette, dialogs) is well-labelled, which this contrast makes more visible.

**Suggested fix:** implement the standard ARIA tree pattern: `role="tree"` / `role="treeitem"` + `aria-expanded`, a roving tabindex, Up/Down to move, Left/Right to collapse/expand, Enter to open views, F2 to rename. The selection model already exists; this is markup + one key handler on the container.

### U3 — MEDIUM: Ad-hoc modals (Keyboard shortcuts, image picker) lack Escape, focus trap, and dialog semantics

**Evidence (live):** the Keyboard-shortcuts modal did not close on Escape, and at a 700 px-high window its Close button was clipped off-screen with no scroll. These modals are raw `createPortal` divs with only backdrop-click close (`src/ui/Toolbar.tsx:806-836` image picker, `:837-856` shortcuts) — while `AppDialog.tsx` already implements proper dialog behavior elsewhere.

**Suggested fix:** route both through `AppDialog` (or extract a shared `Modal` wrapper): `role="dialog"` + `aria-modal`, Escape to close, focus trap and focus restore, and `max-height` with internal scrolling.

### U4 — LOW: Palette tools are active when no editable view is open

**Evidence (live):** on the welcome screen (no model), every palette tool is enabled and clickable; clicking silently sets a tool that can never be used. Toolbar buttons in the same state are correctly disabled.

**Suggested fix:** disable palette buttons (`disabled` + tooltip "Open a view to use the palette") when there is no active editable view — the same condition the toolbar already computes.

### U5 — LOW: Shortcuts dialog is incomplete and hand-maintained

**Evidence:** the dialog omits Ctrl+X (implemented at `useViewEditorInteractions.ts:1170`), Ctrl+Alt+N (advertised in the New-model tooltip), and Ctrl+Shift+Z redo (`App.tsx:255-258`).

**Suggested fix:** derive the table from a single shortcut registry shared with the handlers (even a typed constant list both sides import), so the dialog can't drift.

### U6 — LOW: First-run layout leads with developer-facing panels

**Evidence (live):** the default layout shows Extensions ("0 installed", "Create an extension") as a visible right-hand tab and Scripting next to Properties. For the primary persona (architect opening their first model) these are noise.

**Suggested fix:** default the right dock to Settings (or Properties) with Extensions/Scripting available via the "Show or reopen panels" menu; keep the current layout for returning users via the persisted dockview layout.

---

## 3. UI / Visual

### V1 — MEDIUM: No dark theme, and theming is blocked by hardcoded colors

**Evidence:** `:root` defines a tidy CSS-variable palette but only light values; there is no `prefers-color-scheme` block and no theme setting (`src/styles.css:1-16`; no theme key in `src/settings/app-settings.ts`). Hardcoded hexes appear both in CSS (`border-bottom: 1px solid #a7c8f1`, `src/styles.css:~70`) and in components (selection/highlight strokes `#2a6cc4`/`#1d9e46`/`#c43a3a` in `src/canvas/view-editor/NodeView.tsx:95`, tree icon `#5c5c5c` in `ModelTree.tsx:81`).

**Suggested fix:** finish tokenizing the *chrome* (panels, toolbar, tree, dialogs, selection handles) into CSS variables and add a dark variant behind `prefers-color-scheme` plus a settings override. Deliberately keep the diagram canvas Archi-faithful (white canvas, spec colors) in both themes — that keeps the fidelity-to-Archi rule intact while the app around it themes.

### V2 — LOW: Focus visibility is inconsistent

**Evidence:** several controls remove the outline and replace it with a subtle border-color change only (`.prop-input:focus`, `src/styles.css:1989`; `outline: none` at `:741`, `:1023`, `:2627` etc.), while other components define proper `:focus-visible` rings (tree filter `:774`, visualiser `:1343`). Keyboard users get a strong ring in some panels and near-nothing in others.

**Suggested fix:** adopt one global rule — `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }` — and delete the per-component `outline: none` overrides unless they provide an equivalent.

### V3 — LOW: Muted text is borderline on tinted backgrounds

**Evidence:** `--text-dim: #6b7480` passes WCAG AA on white (≈4.6:1) but drops to ≈4.3:1 on `--bg: #eef2f6`, where it is used for hints and empty-state text.

**Suggested fix:** darken `--text-dim` to ~`#5f6874` (≥4.5:1 on both backgrounds); no visual redesign needed.

### V4 — INFO: Small polish notes from the live session

- The palette reflows between 2/3/4 columns with the dock width; group labels (STR/BUS/…) stay aligned, but at some widths a lone overflow chevron appears on the Palette tab — worth a quick look at min-width for the palette panel.
- Empty-state, dirty-indicator (`● unsaved`), element/relationship counts, and the per-view zoom readout in the status bar are all excellent — keep them.
- The contextual toolbar-help strip is a strong feature; consider a small "hide" affordance for expert users since it permanently costs a row of vertical space.

---

## 4. What's already strong (keep doing this)

- **Archi fidelity** — figures, colors, palette grouping, context-menu verbs, and relationship rules all match desktop Archi closely; round-trip safety is enforced by tests.
- **Canvas keyboard support** — arrows (+Shift for grid steps), F2/double-click rename, Delete, Ctrl+A/C/X/V/D, Ctrl+0/Home zoom — verified working live.
- **Toolbar/palette accessibility labels** — every icon button has a descriptive accessible name with its shortcut; the contextual help strip doubles as discoverability.
- **Settings panel** — searchable, sectioned, shows defaults, per-setting reset. Model-tree search options persist across sessions.
- **Architecture for undo** — every mutation is a patch-recorded transaction; script runs batch to one undo step; selection restore on undo/redo.
- **Chunking discipline where it matters most** — Monaco and elkjs are already off the critical path.
- **Clean console** — zero errors/warnings through the entire live session.

## 5. Suggested priority order

1. **P1** drag-path memoization / imperative drag transform (biggest felt win, unlocks large models)
2. **U1** auto-open + fit-to-view (first-session impression)
3. **U2** tree keyboard accessibility (a11y gap, low effort)
4. **P2** lazy-load exchange-XML + image-js (first-load win, low risk)
5. **U3** unify modals on AppDialog (small, removes real bugs)
6. **V1** theme tokens + dark mode (high demand, medium effort)
7. **P3/P4** worker autosave, tree virtualization (needed before "enterprise-size" models)
8. Remaining LOW items opportunistically.
