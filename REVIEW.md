# UX, UI & Performance Review — Archi Online

**Version reviewed:** 1.7.0 (commit `3b98eba`, 2026-07-16)
**Method:** three-phase workflow — (1) code survey of the rendering/state/UI hot paths including the new connection-anchor feature, (2) live session against the real app (Vite dev server driven via Playwright: Archisurance example plus the built-in 400-node/200-connection canvas benchmark), (3) production build and load analysis of `dist/`.

**Measurements taken during the live session** (Chrome, 1600×950; drag numbers on the dev build — production is faster in absolute terms, but the relative costs hold):

| Scenario | Result |
| --- | --- |
| Drag one node, benchmark view (400 nodes / 200 connections) | frame time p50 **19 ms**, p90 **33.5 ms**, max 49 ms; only 272 ms of long tasks across a ~34 s drag session |
| Same scenario at 1.5.1 (previous review) | 39 FPS with **1 744 ms** of long tasks in a 4.5 s drag |
| Wheel pan + Ctrl+wheel zoom, benchmark view | p50 20 ms, p90 25 ms |
| Production first load (localhost preview) | FCP **412 ms**, **375 KB** transferred, 3 JS requests (was ~2.0 MB / 8 requests) |
| Production bundle | main chunk 349 KB gz; exchange-XML/XSD stack now a lazy 504 KB gz chunk; PWA precache 5.25 MB (was ~16 MB) |
| Console during the whole session | zero errors, zero warnings |

**Overall:** 1.7.0 is a major step up from 1.5.1. Every HIGH/MEDIUM finding of the previous review was implemented properly and verified working live: memoized node/connection rendering with interaction-version keys, auto-open + fit of the first view, ARIA tree with full keyboard navigation and F2 rename, `ModalSurface` dialogs (Escape, focus trap), palette disabled without an editable view, a shortcut registry driving the help dialog, worker-based autosave serialization, virtualized tree rows, deferred tree search, a complete light/dark/system theme, PWA runtime-caching for Monaco, and lazy exchange-XML/image-js. Viewports, theme, and the workspace all survive reload; the `beforeunload` guard fires only when dirty.

The findings below are what's left — ranked by user impact, each with a suggested fix. Nothing here is HIGH severity for a single-model, medium-size workflow; the top two matter most for multi-model workspaces and large models.

---

## 1. UX

### U1 — MEDIUM: A near-miss on an endpoint-handle drag silently rewires the relationship

**Evidence (live):** with a connection selected, the endpoint handles are 8 px circles in *view* units (≈6.7 px on screen at the 84 % fit zoom — they shrink further as you zoom out). Dragging the source handle to re-anchor it on the same element, but releasing 2 px below the element's edge, dropped the endpoint inside the enclosing "Archisurance" element — and **silently changed the FlowRelationship's source element** in the semantic model. Undo restores it (good), and cross-view reconnects do prompt (`requestConnectionReconnection`, `src/ui/connection-reconnection.ts:25`), but a single-view reconnect commits without any confirmation, and during the drag both outcomes look identical: the preview line and target highlight are green ("valid") whether the drop will *move an anchor* or *rewire the relationship* (`PendingReconnectionOverlay`, `src/canvas/view-editor/overlays.tsx:166`).

**Suggested fix (all three are small):**
1. Make the handles zoom-independent and easier to grab: render `r={4 / viewport.zoom}` (or a screen-space overlay) plus an invisible fat hit circle (e.g. 12 px), the same trick `ConnectionView` uses for its 12 px transparent click path.
2. Differentiate the drag feedback: when the hovered target is the connection's *current* endpoint (an anchor move), color the preview line/highlight with `--canvas-anchor` amber instead of green, and only show green for a valid *different* target. A one-line status-bar hint ("Move anchor" / "Reconnect to X") would remove all ambiguity.
3. Treat the enclosing container specially: when the drop point is within a few pixels of the current endpoint's boundary, prefer the anchor-move interpretation even if the hit test finds the parent (the `REUSE_DISTANCE`-style tolerance already exists in `connection-anchor-edit.ts`).

### U2 — MEDIUM: Status-bar zoom (and cursor position) is wrong when more than one model is open

**Evidence (live):** with Archisurance (fit 84 %) and the benchmark model (30 %) both open, the status bar showed **30 %** while the Actor Cooperation view was the active tab and its zoom overlay showed 84 %; switching tabs back and forth never corrected it. Cause: `EditableViewEditor` publishes to the singleton canvas status behind `const isActive = useStore((s) => s.activeViewId === viewId)` (`src/canvas/ViewEditor.tsx:176-179`) — but that store is the *session's* store, so one view per session is always "active" and whichever rendered last wins the status bar. The cursor x/y publisher is gated the same way (`ViewEditor.tsx:234`).

**Suggested fix:** gate publishing on the *workspace-active* session as well — e.g. `const sessionActive = useWorkspaceStore((w) => w.activeSessionId === sessionId)` combined with the existing check — and include it in the effect deps so the newly-activated view republishes its zoom on tab switch. (Alternatively: publish `{sessionId, viewId, zoom}` and let `StatusBar` pick the entry matching the active session.)

### U3 — LOW: Undoing back to the last save point leaves the model marked dirty

**Evidence (live):** edit → Ctrl+Z leaves "● unsaved" in the status bar and the `*` on the tree root, and the `beforeunload` guard still fires, even though the model equals its saved state. Desktop Archi's command stack tracks the save location and reports clean again after undoing back to it.

**Suggested fix:** record the undo-stack depth at save/open in the model store, and derive `dirty` from `undoStack.length !== savedDepth` (redo past the mark re-dirties). This is a small change in `src/model/store.ts` where `dirty` is currently set unconditionally by `transact()`.

### U4 — LOW: Dropping an endpoint drag on empty canvas gives no feedback

**Evidence (live):** releasing an endpoint-handle drag over empty canvas silently snaps the connection back with no indication whether anything happened (in this case nothing did — but after U1 the user can't be sure). A brief invalid cue (red flash of the preview line, or a status-bar "Reconnect cancelled") would close the loop. Also worth noting in the docs: Escape cancels the drag mid-flight (this works — `useViewEditorInteractions.ts:1152`).

---

## 2. Performance

### P1 — MEDIUM: The connection route resolver is rebuilt twice per render and pre-warms every connection in the whole model

**Evidence:** `EditableViewEditor` constructs `storedRoutes` *and* `routes` with `createConnectionRouteResolver` on every render (`src/canvas/ViewEditor.tsx:279`, `:299`), and the resolver's constructor eagerly routes **every connection in `model.connections`** — all views, not just the one on screen (`src/canvas/geometry.ts:157`, done for Manhattan-router determinism). During a drag this runs per pointer-move frame. It is the main remaining contributor to the p90 33.5 ms drag frames on the 400-node benchmark, and it scales with *total model size* rather than visible-view size — a 5 000-connection multi-view model pays ~10 000 route resolutions per dragged frame, twice.

**Suggested fix (in order of payoff):**
1. Restrict the pre-warm loop to the current view: `for (const id of Object.keys(model.connections)) if (model.connections[id].viewId === viewId) resolve(id);` — foreign-view connections resolve to `undefined` anyway because their nodes aren't in `nodeBounds`.
2. Only build `storedRoutes` when it is used: it exists solely for the bendpoint-drag preview (`ViewEditor.tsx:286`), so gate it behind `inter.kind === 'bend'` (a cheap `null` otherwise).
3. Memoize `routes` for the common idle case: when `inter.kind === 'none'` and there are no preview connections, the resolver depends only on `[model, absBounds, isConnectionVisible, settings.useOrthogonalConnectionAnchors]` — a `useMemo` on those keys makes selection changes, hovers, and status updates stop re-routing the view (the read-only editor already does exactly this, `ViewEditor.tsx:475-483`).

### P2 — LOW: Tree-search catalog is rebuilt over all open models on every edit

**Evidence:** `collectTreeSearchCatalog(searchableModels)` recomputes on every `modelRevision` bump (`src/ui/ModelTree.tsx:249-259`), i.e. every transaction in any open model, and `treeSearchCatalogSignature(catalog)` re-stringifies it every render. It's a full O(elements + relationships + views) pass over *all* sessions — fine at Archisurance scale, but it taxes every keystroke-level edit on large multi-model workspaces even when the search UI is closed.

**Suggested fix:** compute the catalog lazily — only while the filter popover/search bar is actually open (`compiled.active || popoverOpen`), or debounce the recompute with the same 800 ms the autosave uses. The results search already early-outs when inactive (`searchModelTree`, `tree-filter.ts:252`), so this is the last always-on cost in the tree.

### P3 — LOW: Per-view route/label caches grow without pruning

**Evidence:** `stableRoutesRef` (`ViewEditor.tsx:123`, `:458`) keeps an entry per connection id for the lifetime of the view editor and is never pruned when connections are deleted; the same session can accumulate entries across large script-driven edits. The label cache is already `WeakMap`-keyed by model snapshot (`label-cache.ts:10`) and self-cleans — good.

**Suggested fix:** when a render observes `routes(conn.id) === undefined` or the connection is gone, delete the map entry; or key the ref's map generation on `model` like the label cache does. One-liner hygiene, prevents slow leaks in day-long sessions.

### P4 — LOW: Every node re-renders when any app setting changes

**Evidence:** `NodeViewComponent` subscribes to the whole settings object (`useSettingsStore((state) => state.settings)`, `src/canvas/view-editor/NodeView.tsx:43`) but uses only the two legend preferences. Changing *any* setting (theme, zoom factors, search toggles…) re-renders every node in every open view — the `memo` comparator can't help because the subscription bypasses it.

**Suggested fix:** select just what's used: `useSettingsStore((s) => s.settings.legendLabels)` and `legendUserColors` (two subscriptions or one shallow-equal tuple). Same pattern is worth an audit in other per-item components (`ModelTreeInner` also takes the full settings object, `ModelTree.tsx:551`).

### P5 — INFO: Main chunk is 1.27 MB raw / 349 KB gz

Down from 2.87 MB / 958 KB at 1.5.1 — the exchange-XML stack (504 KB gz) and `image-js` are now dynamic imports, and Monaco/elk were already lazy. The remaining chunk is legitimately core (React, dockview, lucide, the generated relations matrix). If you want better long-term caching across releases, add `build.rollupOptions.output.manualChunks` to split stable vendors (react/dockview) from app code; otherwise this is done.

---

## 3. UI / Visual

### V1 — Resolved, one nit: the dark theme is thorough

**Evidence (live):** System/Light/Dark setting, `data-theme` + `prefers-color-scheme` fallback, `color-scheme` set for native widgets, all chrome themed (toolbar, tree, palette, properties, settings, dialogs, status bar), theme persisted across reload — and the diagram canvas deliberately stays Archi-faithful white in both themes, which is the right call per the fidelity rule. Nit: the endpoint handles hardcode `fill="#ffffff"` (`overlays.tsx:99`) — correct on the white canvas, but if the canvas ever gets a themed variant, sweep the canvas-overlay hardcodes (`#ffffff` label halo in `ConnectionView.tsx:340` likewise) into `--canvas-*` tokens.

### V2 — LOW: Selection/endpoint handles scale with zoom

**Evidence (live):** endpoint handles, bendpoint handles, and resize handles are drawn in view units, so at 50 % zoom they're half-size targets while strokes elsewhere use `vectorEffect="non-scaling-stroke"` to stay crisp. Desktop Archi draws handles at constant screen size. (Same fix as U1.1 — divide the radius by `viewport.zoom` or render handles in an unscaled overlay group.)

### V3 — INFO: Small polish notes from the live session

- The two-row top chrome (toolbar + always-on "Toolbar help" strip) still costs 78 px; the help strip remains excellent for discovery — the previously suggested "hide" affordance for experts is still worth considering.
- Tab titles for views from different models look identical ("Actor Cooperation view — Archisurance", "400 nodes … — Canvas drag benchmark" is clear, but two models with same-named views would be ambiguous only by suffix — fine for now).
- The status bar's left/center/right zones (selection · counts · file/zoom) read well in both themes; dirty "●" + tree "*" are consistent.

---

## 4. What's already strong (keep doing this)

- **Follow-through** — every actionable finding from the 1.5.1 review shipped in 9da4219, correctly, with tests (`modal-surface.test.ts`, `canvas-viewport-hook.test.ts`, `frame-throttle.test.ts`, `autosave-serializer.test.ts`, …). The review→fix loop is working.
- **Interaction architecture** — interaction-version keys (`live-render.ts`) give memo-friendly per-subtree invalidation without imperative DOM hacks; route reference-stability (`stableRoutePoints`) keeps connection re-renders at zero during pans.
- **Anchor-edit fidelity** — `planConnectionAnchorBendpoints` reproduces GEF's relative-bendpoint math, replaces within `REUSE_DISTANCE`, stabilizes the opposite end, and round-trips losslessly; undo works; jArchi wrappers were extended in the same commit.
- **Autosave** — worker serialization with generation guards against stale writes, `requestIdleCallback` fallback, per-session document cache, viewports and file handles persisted, recovery path for failed restores with a user-visible dialog.
- **Accessibility** — real ARIA tree with roving tabindex, arrows/F2/Enter all working; dialogs trap focus and close on Escape; toolbar buttons carry names + shortcuts; `:focus-visible` ring is consistent.
- **Zero-noise console** across load, drags, reconnects, undo, theme switch, reload.

## 5. Suggested priority order

1. **U1** anchor-vs-reconnect drag feedback + bigger handles (protects model semantics — the only data-integrity-adjacent item)
2. **U2** status-bar publishing gated on the active session (visible bug in every multi-model workspace)
3. **P1** route-resolver scoping/gating/memoization (biggest remaining drag cost; required before "enterprise-size" models)
4. **U3** dirty-tracking via save-point depth (cheap, removes false "unsaved" warnings)
5. **P4** narrow settings subscriptions (one-line change, broad effect)
6. **P2/P3** tree-catalog laziness, cache pruning (hygiene before large-model workloads)
7. **V2/U4** zoom-independent handles, cancel feedback (fold into the U1 work)
