# Multi-model Workspace Independent Review

Reviewed: all uncommitted tracked changes and untracked files against `HEAD` (561fbe2), 2026-07-10.
Method: full read of the new/changed model, UI, persistence, and extension layers; `npm test`
(363/363 pass); `npm run build` (clean); live verification against `npm run dev` in Chrome via
playwright-cli, including a two-session workspace built by loading the Archisurance example twice
(which yields two models with **identical internal object IDs** — the highest-risk configuration,
and one reachable in two clicks).

## Executive assessment

The core architecture is sound and well-tested: per-session Zustand stores created by
`createModelStore()` (`src/model/store.ts:81`), an ordered workspace registry with MRU activation
(`src/model/workspace.ts`), composite `view:<sessionId>:<viewId>` dock identities, session-scoped
transfer bundles with full deep-copies and fresh-ID remapping (`src/model/transfer.ts`), and
versioned whole-workspace IndexedDB persistence (`src/persistence/autosave.ts`). Cross-model paste,
Desktop-Archi paste semantics, Paste as Reference, per-session undo/save/dirty/MRU, and extension
session identity were all verified working, in unit tests and in the live app.

The release risk is concentrated in one architectural seam: **only `deleteViewObjects` and
`duplicateViewObjects` accept an explicit target store; every other mutation op
(`deleteItems`, `renameItem`, `commitMove`, `moveItemsToFolder`, `addElement*`, `reorderNode`,
alignment, drop handling, …) still resolves the globally active store at call time.** The UI papers
over this with `onPointerDownCapture` activation on view panels and session trees, which covers
pointer flows — but keyboard-only focus and HTML5 drag/drop bypass activation. I reproduced a
silent wrong-model deletion in the browser (P1 below). A second confirmed P1 lets same-model paste
materialize visuals for concepts that no longer exist, which persists broken references into
`.archimate` output. Both are localized fixes, not redesigns.

## Findings

### P1-1 — Tree keyboard operations mutate the globally active model, not the tree's own model

- **File:** `src/ui/ModelTree.tsx:736-741` (Delete → `deleteItems(sel.ids)`; F2 → rename flow at
  `:444-447` via `renameItem`), with the same unscoped pattern at `:487` (`duplicateItems`),
  `:497`/`:568` (`deleteItems` from context menus), `:596` (`moveItemsToFolder` on folder drop),
  and `:528/:540/:551/:561` (`addElement`, `addView`, `createC4TemplateView`, `addFolder`).
- **Evidence:** The keydown handler reads the selection from the *scoped* store
  (`modelStore.getState().selection`) but mutates through `deleteItems()`, which internally uses
  the *active* store (`src/model/ops/deletion.ts:48`, no store parameter). Activation only happens
  on `pointerdown`/`click` capture (`ModelTree.tsx:711-716`); focusing the tree with the keyboard
  (Tab, or focus restoration) does not activate it.
- **Browser reproduction (verified):** Load the Archisurance example twice (Welcome panel). Click
  "Intermediary" (id 507) in model 1's tree; click a row in model 2's tree (model 2 becomes
  active); move focus back to model 1's tree with the keyboard; press Delete. Result: model **2**
  lost element 507 (`undoStack` top = `Delete` in session 2, tree 2 no longer shows the row) while
  model 1 — whose tree visibly held the selection — kept it. Session 2 was marked dirty and the
  wrong-model deletion was immediately picked up by workspace autosave.
- **Impact:** Silent cross-model data corruption whenever two open models share object IDs (same
  file opened twice, example loaded twice, a model and its Save-As copy). With disjoint IDs the
  Delete is a silent no-op — the user believes the item was deleted but it was not.
- **Recommended correction:** Thread the owning `ModelStore` through every op reachable from
  session-scoped UI (add the optional `store` parameter, as already done for
  `deleteViewObjects`/`duplicateViewObjects`), and/or activate the session in a `focus` capture
  handler on the tree, not only on pointerdown.
- **Missing regression test:** tree keydown Delete/F2/duplicate with the tree focused but a
  different session active (the existing `tests/view-shortcuts.test.ts` covers this scenario for
  the canvas, not the tree).

### P1-2 — Same-model paste creates visuals for concepts deleted after copy; broken references are persisted

- **File:** `src/model/transfer.ts:337-339` (`elementId: idMap.get(source.elementId) ??
  source.elementId`), `:360-362` (same fallback for `relationshipId`), `:341` (same for
  `refViewId`). Nothing checks that the fallback ID still exists in the target draft.
- **Evidence / browser reproduction (verified):** Select a node on the canvas, Ctrl+C, right-click
  → **Delete from Model**, then paste into the same view (context-menu Paste or Ctrl+V). The paste
  transaction succeeds and creates a diagram node whose `elementId` (`275` in my run) is absent
  from `model.elements`. It renders as a blank default-styled box, and — critically —
  `serializeArchimate` writes it out and the XML re-parses in this app, so the dangling
  `archimateElement` reference flows into workspace autosave and into saved `.archimate` files.
- **Impact:** Corrupted model files. Desktop Archi resolves `archimateElement` references at load
  time; a reference to a nonexistent ID produces load errors there, so the corruption exports to
  the ecosystem the project treats as its spec. The same hole exists for connections whose
  relationship was deleted after copy, and ref nodes whose target view was deleted.
- **Recommended correction:** In `pasteTransferBundle`, when a concept ID is not in the `idMap`
  *and* not present in the draft, clone it from the bundle (the bundle already carries full copies
  of every element/relationship/view) instead of pasting a dangling reference — this also matches
  Desktop Archi, where paste re-creates missing concepts.
- **Missing regression test:** copy → delete concept from model → paste (same view, other view,
  and tree destinations).

### P2-1 — Canvas Ctrl+V/Ctrl+C/Ctrl+A/F2/arrow shortcuts are dead after clicking empty canvas; docs promise otherwise

- **File:** `src/canvas/view-editor/useViewEditorInteractions.ts:564-650` (all shortcuts live only
  on the SVG's React `onKeyDown`); `src/canvas/ViewEditor.tsx:105-141` (the new window-level
  fallback covers **only** Delete and Ctrl+D).
- **Evidence / browser reproduction (verified twice):** Clicking a *node* focuses the SVG and the
  shortcuts work. Clicking *empty canvas* (the natural "click where you want to paste" gesture)
  leaves `document.activeElement` on `BODY`; a subsequent Ctrl+V does nothing (undo stack
  unchanged, no error). My first paste attempt during this review no-op'd for exactly this reason.
- **Impact:** The primary documented flow fails silently. `docs/wiki/User-Guide.md:73`, `:135`, and
  `:321` (and `CHANGELOG.md:14`) promise `Ctrl+C`/`Ctrl+V` copy/paste "including across models";
  in practice it only works if the last click landed on a shape. This is partly pre-existing, but
  this change added the window-level pattern for Delete/Ctrl+D and shipped documentation that now
  overstates Ctrl+V.
- **Recommended correction:** Extend the guarded window-level handler in `ViewEditor` to Ctrl+C and
  Ctrl+V (with the same `ownsActiveModel`/input-target/read-only guards), or focus the SVG on every
  canvas `pointerdown`.
- **Missing regression test:** a DOM-focus-accurate test (keydown dispatched on `document.body`)
  for Ctrl+V; the existing tests dispatch directly on the SVG or window and pass regardless.

### P2-2 — Activating another session flips the center tab group to that session's view

- **File:** `src/ui/DockLayout.tsx:246-249` — the workspace-sync effect runs on every
  `workspaceRevision`/`activeSessionId` change and force-calls
  `api.getPanel(view:<active>:<activeViewId>)?.api.setActive()`.
- **Evidence (verified):** With model 2's view on screen, clicking any row in model 1's tree
  (activation via pointerdown capture) immediately switched the visible center tab to model 1's
  view. The same forced re-activation fires after every model transaction, so a model change made
  while a non-view panel (e.g. Welcome) holds the center tab yanks the tab back to the view.
- **Impact:** Users cannot browse or edit a second model's tree without the editor switching
  diagrams under them — Desktop Archi does not switch diagrams on tree clicks. (DOM focus is *not*
  stolen — typing in the Properties panel while this fires was verified uninterrupted, thanks to
  the origin-tagged `setActive` in the bundled dockview fork — so the damage is tab churn, not
  input loss. It also incidentally prevents cross-model tree→canvas drops onto a tab in the same
  group, since the source model's view replaces the target before the drop.)
- **Recommended correction:** Only call `setActive` when the dock's current active panel disagrees
  with a *changed* `activeSessionId`/`activeViewId` pair (e.g. track the last applied pair), and
  never re-assert it merely because `workspaceRevision` ticked.

### P2-3 — Workspace recovery permanently discards the autosaved XML of sessions that fail to restore

- **File:** `src/persistence/autosave.ts:157-204` (`restoreWorkspace` drops failed records after
  `parseArchimate` throws) together with `:124-155` (`persistWorkspace` rebuilds the record purely
  from live sessions).
- **Evidence:** A session whose XML fails to parse is counted in `failed` and reported via the boot
  alert ("N models could not be restored", `src/App.tsx:104-111`), but it is not carried forward:
  the first state change after boot (activation, opening a view, any edit) re-persists the
  workspace record without it, deleting the only copy of what may be a dirty, never-saved model.
- **Impact:** A transient parse regression or a partially written IDB record escalates into
  permanent data loss, contradicting the recovery dialog's implication that the data still exists.
- **Recommended correction:** Carry unparseable session records through `persistWorkspace`
  untouched (keep the raw record alongside live sessions), or move them under a
  `archi-online.workspace.recovery` key before the next persist.
- **Missing regression test:** `tests/workspace-autosave.test.ts` covers only the happy path; add a
  test that one corrupt session record survives a restore-then-persist cycle while good sessions
  restore.

### P2-4 — Class finding: most canvas/tree ops still route through the implicit active store

- **Files:** `src/model/ops/*` — only `deleteViewObjects` (`movement.ts:102`) and
  `duplicateViewObjects` (`duplicate.ts:135`) accept a store. Unscoped call sites inside
  session-scoped UI include: `commitMove`, `renameItem` (canvas direct-edit commit,
  `useViewEditorInteractions.ts:136-143`), `createElementOnView`/`createC4ElementOnView`/
  `addNoteToView`/`addGroupToView` (`:202-274`), `setConnectionBendpoints` (`:539`),
  `addDroppedItemsToView` → `addElementNodeToView`/`addRefNodeToView`
  (`src/canvas/view-editor/drop.ts`), and in the object context menu `reorderNode`,
  `deleteItems` ("Delete from Model"), `alignNodes`, `distributeNodes`, `matchSize`
  (`src/canvas/view-editor/contextMenu.ts:196-280`).
- **Evidence:** Correctness currently depends on `ViewPanel`'s `onPointerDownCapture` activation
  (`src/ui/dock/layout-config.tsx:336-349`) firing before every mutation. Paths that mutate
  without a preceding pointerdown on the owning panel break the assumption: HTML5 drop (no
  pointerdown on the drop target — dragging from model A's tree onto model B's view in a *separate
  dock group* resolves IDs against B's model but mutates A's store: a no-op for disjoint IDs, a
  wrong-model mutation for twin IDs), and direct-edit commit on blur (clicking another session's
  panel activates it before the editor's blur commit runs, sending `renameItem` to the wrong
  store, where it silently no-ops or renames the twin).
- **Impact:** Same class as P1-1; these instances are harder to reach, so P2, but each is a latent
  wrong-model mutation.
- **Recommended correction:** Same as P1-1 — make the store an explicit parameter across
  `src/model/ops` and pass `modelStore` from the interaction hook and context menus. This also
  makes requirement 2 structurally true instead of activation-dependent.

### P3-1 — Model-root context menu "Paste" enablement is stale

- **File:** `src/ui/ModelTree.tsx:674-702` — `rootMenu` is an IIFE evaluated during render, so
  `canPasteTo('tree')`/`readOnly` are frozen at last-render time. (`folderMenu(folder)` at `:502`
  does not have this bug — it is invoked at menu-open time.)
- **Browser reproduction (verified):** Reload → click a canvas node → Ctrl+C (clipboard non-empty,
  proven by a subsequent successful paste) → right-click the model root: **Paste is disabled**.
  After any model change re-renders the tree, the same menu shows Paste enabled.
- **Recommended correction:** Build `rootMenu` inside the `onContextMenu` callback like
  `folderMenu`.

### P3-2 — Ctrl+O and Ctrl+S globally suppressed while the active model is read-only

- **File:** `src/App.tsx:239` — `if (activeStore?.getState().readOnly && ['s', 'o', 'z', 'y',
  'd'].includes(key)) return;`.
- **Evidence:** Opening a file has nothing to do with the active model's read-only state, and the
  early return happens *before* `preventDefault()`, so Chrome's native "Open file" dialog appears
  instead. Save being blocked (rather than routed to Save As) is also questionable.
- **Recommended correction:** Restrict the read-only guard to the mutating keys (`z`, `y`, `d`) and
  let `saveModel`/`openModel` decide for themselves.

### P3-3 — `clearWorkspace` writes into the shared empty fallback store

- **File:** `src/model/workspace.ts:145-152` — after `setActiveModelStore(null)`,
  `getActiveModelStore().setState({ model: null, fileName: null, dirty: false })` mutates the
  module-level `emptyModelStore` singleton, and only partially (undo stacks, selection, open views
  are left behind from whatever leaked into it).
- **Impact:** Latent state bleed into the fallback store shared by "no session" code paths; no
  user-visible failure found today.
- **Recommended correction:** Reset the empty store with a full `initialState()` replacement, or
  never write to it.

### P3-4 — Context-menu extension triggers omit session identity

- **File:** `src/canvas/view-editor/contextMenu.ts:153-165`, `:282-296`, and
  `src/ui/ModelTree.tsx:449-463` — `view.contextMenu`/`tree.contextMenu` trigger payloads carry
  `x/y/viewId/targetId/selectionIds` but no `sessionId`/`modelId`, unlike the lifecycle events in
  `src/extensions/events.ts` which were correctly upgraded.
- **Impact:** An extension listening to context-menu events in a multi-model workspace must guess
  (assume the active session) which model the menu belongs to — requirement 13 is only partially
  met for these events.
- **Recommended correction:** Add the owning session identity to the trigger objects (the
  `sessionId` is already in scope at every call site).

### P3-5 — Pasted canvas roots take selection order, not source z-order; legacy file-input errors vanish

Two small concrete items, code-verified but not browser-verified:

- `src/model/transfer.ts:147-157` — `createCanvasTransferBundle` orders roots by selection order,
  so pasting two overlapping nodes that were multi-selected back-to-front flips their stacking in
  the target view (Desktop Archi preserves relative z-order).
- `src/persistence/files.ts:52-54` — in the non-File-System-Access fallback, `input.onchange` is an
  async handler whose `loadModelText` errors become unhandled promise rejections; a malformed file
  produces no dialog at all (the FSA path reports via `AggregateError`).

## Requirements coverage

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | No state leakage between sessions | **Partially verified** | Store isolation verified (`tests/workspace.test.ts:19`, including the colliding-ID case at `:62`); violated at the op-routing layer by P1-1/P2-4 |
| 2 | Ops mutate the invoking tree/view's model | **Violated** | True for delete/duplicate/copy/paste on views (`tests/view-shortcuts.test.ts`, browser-verified); false for all other ops (P1-1 browser-verified, P2-4) |
| 3 | Duplicate creates independent elements + internal relationships | **Verified** | `src/model/ops/duplicate.ts:131-256`; `tests/duplicate.test.ts` (updated to assert fresh concepts and relationships) |
| 4 | Same-model paste follows Desktop Archi | **Verified** (one edge violated) | `src/model/transfer.ts:215-241`; `tests/model-transfer.test.ts:248` (concept present → fresh concept) and `:287` (absent → visual referencing existing concept); deleted-concept edge is P1-2 |
| 5 | Paste as Reference reuses concepts, never cross-model | **Verified** | `canPasteAsReferenceTo` requires same session (`src/canvas/clipboard.ts:63-70`); menu disables it cross-model (`contextMenu.ts:95`); `tests/model-transfer.test.ts:315` |
| 6 | Cross-model paste: fresh IDs, full remap | **Verified** | `tests/model-transfer.test.ts:53-171`; browser-verified (pasted element got a fresh ID even though the twin model contained the same source ID; endpoints/parents/connections remapped; bendpoints are endpoint-relative so they translate automatically; styles deep-cloned). Minor z-order caveat: P3-5 |
| 7 | Tree↔view transfers don't copy unrelated content/geometry | **Verified** | `tests/model-transfer.test.ts:147` (tree→view creates visuals) and `:173` (canvas→tree strips geometry, `includeGeometry` logic at `transfer.ts:181`) |
| 8 | Duplicate/paste/delete are single undo transactions | **Verified** | Single `transact` per operation (`transfer.ts:278`, `duplicate.ts:40/:158`, `deletion.ts:48`); undo-stack assertions in `tests/model-transfer.test.ts:71/:193/:280` |
| 9 | Read-only targets reject mutations | **Verified** | `transact` guard (`store.ts:92`); `tests/model-transfer.test.ts:207`; window shortcut guard (`ViewEditor.tsx`); menu disablement checks `readOnly` |
| 10 | Ctrl+D/Delete focus matrix without double execution | **Partially verified** | SVG focus and focus-elsewhere paths verified (tests + browser); no double execution by construction (view handler requires `selection.source === 'view'`, App handler requires `'tree'`, and local handlers `stopPropagation`); **but** wrong-model tree Delete (P1-1) and dead Ctrl+V after empty-canvas click (P2-1) |
| 11 | Restore isolates malformed sessions, preserves valid ones | **Partially verified** | Per-session try/catch + boot alert (`autosave.ts:172-193`, `App.tsx:104`); browser-verified full restore of a two-session dirty workspace incl. beforeunload guard; **but** failed sessions' data is then destroyed (P2-3), and no malformed-record test exists |
| 12 | Save/close/dirty/file-handle/MRU per session | **Verified** | `model-session-actions.ts` + `tests/model-session-actions.test.ts` (cancel/save-fail paths); `files.ts:62-79` same-file detection via `isSameEntry`; MRU fallback `workspace.ts:110-124` + `tests/workspace.test.ts:36`; handle ownership `tests/workspace.test.ts:49` |
| 13 | Extension commands/events carry session identity | **Partially verified** | Lifecycle events and command context verified (`extensions/events.ts`, `registry.ts:160-190`, `tests/extensions-multimodel.test.ts`); context-menu triggers lack identity (P3-4) |
| 14 | Scripting stays active-model scoped | **Verified (structurally)** | Runner and jArchi API are unchanged and use the module-level `useStore`/`transact` proxies, which resolve to the active session's store (`store.ts:184-205`); `__archiStore` dev hook likewise |

## Test assessment

**Commands run:** `npm test` — 51 files, 363 tests, all pass (~29 s). `npm run build` — `tsc -b` +
Vite build clean. Manual browser session against `npm run dev` (Chrome/playwright-cli) as described
throughout.

**Well covered:** transfer-bundle semantics in all four direction/mode combinations including
read-only rejection, reference-cycle termination, and undo boundaries
(`tests/model-transfer.test.ts`); store/session isolation including deliberately colliding object
IDs (`tests/workspace.test.ts`); duplicate independence (`tests/duplicate.test.ts`); dirty-close
choice flows including save-failure and multi-close cancellation
(`tests/model-session-actions.test.ts`); happy-path workspace persistence round-trip
(`tests/workspace-autosave.test.ts`); view-owning-model keyboard dispatch
(`tests/view-shortcuts.test.ts`); identified extension events (`tests/extensions-multimodel.test.ts`).

**False-confidence risks:**

- `tests/view-shortcuts.test.ts` dispatches `keydown` directly on the SVG or `window` with
  activation pre-arranged. It cannot catch either browser-verified failure: focus resting on
  `BODY` after an empty-canvas click (P2-1) or a focused-but-inactive *tree* (P1-1). The test
  names ("…even when another model is globally active") suggest stronger coverage than exists —
  they cover the canvas handlers only.
- `tests/clipboard-context-menu.test.ts` renders menus and clicks items within one React commit,
  so it cannot observe the render-time-vs-menu-time staleness of `rootMenu` (P3-1).
- `tests/workspace-autosave.test.ts` uses the in-memory keyval store and only the happy path — no
  corrupt-record, no quota-failure, no fileHandle-serialization branches.
- All paste tests copy from live, intact models; none exercise paste after the source concept was
  deleted (P1-2).

**Recommended new tests:** (1) tree keydown Delete/F2 with tree focused, other session active,
twin IDs; (2) paste-after-concept-deletion for all destinations; (3) restore with one corrupt
session record followed by a persist — assert the corrupt record survives; (4) root-menu Paste
enablement immediately after a canvas copy; (5) window-level Ctrl+V once P2-1 is fixed; (6) z-order
preservation of pasted canvas roots.

## Manual verification gaps

Things I could not exercise in this environment:

- **Pop-out windows and floating groups** (`addPopoutGroup`/`addFloatingGroup`) with
  session-scoped view panels — including whether the window-level keyboard handlers (which bind to
  the main `window`) work at all inside a popout document.
- **Real File System Access flows**: save/open pickers, permission prompts on restored
  `FileSystemFileHandle`s, `isSameEntry` twin-detection with real handles, and the
  policy-blocked → download fallback (`files.ts:105-141`).
- **IndexedDB persistence across a full browser restart** (I verified same-profile reload restore,
  including dirty flags, open views, active session, and the beforeunload guard — but not handle
  structured-clone survival across restarts, nor the quota-exceeded no-handle retry).
- **PWA launch queue / share-target / `?action=` flows** in an installed PWA context.
- **Cross-model HTML5 drag-and-drop onto a side-by-side dock group** (the P2-4 drop-path analysis
  is code-level; synthesizing trusted cross-panel drag events was not reliable).
- **Extension runtime with real installed extensions** (event bridge and command identity verified
  via unit tests only).
- Whether desktop Archi actually rejects a file containing the P1-2 dangling reference (asserted
  from Archi's EMF loading model, not tested against the Java application).

## Final recommendation

**Ready after listed fixes.**

The multi-model architecture itself — per-session stores, workspace registry, transfer bundles,
composite dock IDs, versioned persistence, session-identified extension events — is correct,
consistently tested, and behaved correctly in live use. I do not recommend committing before
fixing the two P1s: P1-1 (wrong-model tree keyboard mutations; silent cross-model data corruption
in the easily-reached twin-ID workspace) and P1-2 (paste materializing dangling concept references
into persisted files). P2-1 (dead Ctrl+V on the documented flow), P2-2 (tab flipping), and P2-3
(recovery data loss) should follow closely; the P3s are low-risk cleanups. The unifying fix for
P1-1/P2-4 — making the target store an explicit parameter across `src/model/ops` — is mechanical
and aligns the code with the project's own stated requirement that operations mutate the model
owning the invoking surface.
