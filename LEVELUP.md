# LEVELUP.md — Analysis, Navigation & Editing Power-ups

A seven-phase arc that closes the next tier of desktop-Archi parity gaps:
analysis tooling (Analysis tab, Navigator, Validator), editing polish
(align/match-size, duplicate), viewpoint enforcement, and an Outline
(minimap) panel.

**This document is the approved design doc for the whole arc** (per the
feature workflow in CLAUDE.md). Before starting a phase, copy its task
checklist into a short dated plan file in `docs/superpowers/plans/`
(e.g. `2026-07-05-levelup-phase-1-analysis-tab.md`), then implement.

Each phase is **independently shippable**. Do them in order — they are
sorted easiest → hardest, and Phase 6 depends on Phase 5. Finish and verify
one phase completely before touching the next.

---

## Ground rules (do not skip)

These restate and extend CLAUDE.md for this arc. Violating any of them is a
bug even if the feature "works":

1. **Every model mutation goes through an op in `src/model/ops/*.ts`**, each
   wrapping `transact()` from `src/model/store.ts`. New op files must be
   re-exported from the barrel `src/model/ops.ts`. Never call
   `useStore.setState` to change `model`.
2. **`src/model/` stays free of React imports.** New query/validation
   modules (`analysis.ts`, `validation.ts`, `data/viewpoints.ts`) are pure
   functions over `ModelState`.
3. **Fidelity to Archi is the spec** for behavior semantics. Where this doc
   says "port from Archi", fetch the Java source from
   `github.com/archimatetool/archi` (raw.githubusercontent.com works well)
   and transcribe the logic — do not invent. Where our app has no equivalent
   concept (e.g. no "primary selection"), this doc states the approved
   deviation; follow it.
4. **Read-only mode:** the store has a `readOnly` flag. All new mutating UI
   (context-menu items, keyboard shortcuts, buttons) must be hidden or
   inert when `useStore.getState().readOnly` is true. Read-only panels
   (Analysis, Navigator, Outline, Validator) work in read-only mode.
5. **Verification gate per phase** (all three, in order):
   - `npm test` — all existing tests plus the phase's new test file pass.
   - `npm run build` — typecheck + build clean.
   - Drive the real app: `npm run dev`, open `http://localhost:5173` with
     playwright-cli, load the Archisurance fixture from `tests/fixtures/`
     via the dev hook `window.__archiLoadXml(xml)`, exercise the feature,
     and screenshot it. Heed the browser-driving gotchas in CLAUDE.md
     (no `import('/src/...')` in page evals; real mouse events only).
6. **One commit per phase**, message `feat: <phase title>`. Don't commit a
   phase that fails its gate.

### Existing seams you will reuse (read these files first)

| Seam | Where |
|---|---|
| Store, selection, `transact`, `runBatch`, `openView`, `setSelection` | `src/model/store.ts` |
| Ops barrel + op modules | `src/model/ops.ts`, `src/model/ops/*.ts` |
| Metamodel (element/relationship type lists, labels) | `src/model/metamodel.ts` |
| Relationship validity matrix | `src/model/rules.ts` (+ generated `src/model/data/relations-matrix.ts`) |
| Model types, `absoluteBounds`, `getConcept` | `src/model/types.ts` |
| Dock panels registry (`TOOL_PANELS`, `components`) | `src/ui/dock/layout-config.tsx` |
| Panel↔toolbar bus pattern | `src/ui/layout-bus.ts` (and the `syncing` guard in `src/ui/DockLayout.tsx`) |
| Properties panel + tabs | `src/ui/PropertiesPanel.tsx` (`type Tab = 'main' | 'properties' | 'appearance'`) |
| Canvas context menus | `src/canvas/view-editor/contextMenu.ts` |
| Static store-free view render (for Outline) | `src/canvas/export/StaticViewSvg.tsx`, `src/canvas/export/view-image.ts` |
| Keyboard shortcuts | `src/App.tsx` (see the existing Ctrl+Z/Ctrl+Y handler) |
| Toolbar shortcut help list | `src/ui/Toolbar.tsx` (`['Ctrl+Z / Ctrl+Y', …]` table) |
| Id generation | `src/model/id.ts` |

New tool panels added to `TOOL_PANELS` + the `components` map appear in the
Views menu automatically (the toolbar reads `TOOL_PANELS` via the layout
bus). Update `tests/dock-layout-config.test.ts` when you add panels.

---

## Phase 1 — Properties "Analysis" tab

Desktop Archi's Properties view has an **Analysis** tab: for the selected
concept it lists *Model Relations* (every relationship touching it) and
*Used in Views* (every view containing it). Pure read-only queries.

### 1.1 Query module: `src/model/analysis.ts` (React-free)

```ts
import type { ModelState, ArchimateRelationship, DiagramView } from './types';

/** All relationships whose source or target is conceptId, source-first then target, each sorted by name. */
export function modelRelations(state: ModelState, conceptId: string): ArchimateRelationship[];

/** Views containing the element (a node with elementId === id) or relationship
 *  (a connection with relationshipId === id), sorted by name. */
export function viewsUsing(state: ModelState, conceptId: string): DiagramView[];

/** First diagram node (element) or connection (relationship) representing conceptId in viewId, else undefined. */
export function findInView(state: ModelState, viewId: string, conceptId: string): string | undefined;
```

Implementation is a linear scan over `state.relationships` / `state.nodes` /
`state.connections`. No caching — models are small enough; React re-runs on
store change.

### 1.2 UI: `src/ui/properties/AnalysisTab.tsx`

- Extend `Tab` in `PropertiesPanel.tsx` to `'main' | 'properties' | 'analysis' | 'appearance'`
  and render the tab for element and relationship targets (not folders,
  views, notes, groups). The tab is available in read-only mode.
- Two sections with headers **Model Relations** and **Used in Views**:
  - Relationship rows: `<relationship label> (<source name> → <target name>)`
    using `relationshipLabel()` from `metamodel.ts`. Click → `setSelection('tree', [rel.id])`.
  - View rows: view name. Click → `openView(view.id)`, then if
    `findInView` returns an id, `setSelection('view', [thatId])`.
- Empty states: "No relations." / "Not used in any view."

### 1.3 Tests: `tests/analysis.test.ts`

Build a small model via ops (`createEmptyModel`, `addElement`,
`addRelationship`, `addView`, `addElementNodeToView`, …) and assert:
- `modelRelations` returns both incoming and outgoing, ordered as specced.
- `viewsUsing` finds element usage via nodes and relationship usage via
  connections, and returns `[]` for unused concepts.
- `findInView` returns a node id for elements, a connection id for
  relationships, `undefined` when absent.
Also extend `tests/properties-panel.test.ts`: the Analysis tab renders rows
for a concept with one relation and one view.

**Acceptance:** select "Customer" in loaded Archisurance → Analysis tab lists
its relationships and views; clicking a view row opens that view with the
node selected. Gate per ground rule 5.

---

## Phase 2 — Navigator panel

Port of Archi's **Navigator** view (Archi source:
`com.archimatetool.editor/src/com/archimatetool/editor/views/navigator/`):
an expandable tree that walks the relationship graph from a root concept,
downstream (outgoing) or upstream (incoming).

### 2.1 Behavior (Archi semantics)

- **Root** = the most recently selected element or relationship *from the
  model tree or a view*. When selection changes to a concept, the navigator
  re-roots — unless **pinned**.
- Each tree row is a concept. Children of an element = relationships where
  it is the source (downstream mode) or target (upstream mode); each
  relationship row's child is the other-end element. Show
  `relationshipLabel(type)` + name on relationship rows; element rows show
  the type icon area can be plain text + element name (icons optional).
- **Toolbar buttons** (small buttons in the panel header area, like other
  panels): direction toggle (⬇ downstream / ⬆ upstream), 📌 pin toggle,
  ⌂ home (re-root to current selection now).
- **Double-click** an element row → it becomes the new root.
- **Single-click** a row → `setSelection('tree', [conceptId])` so the
  Properties panel follows. This click must **not** re-root the navigator:
  wrap the call in a module-level `internalSelection` guard flag, exactly
  like the `syncing` guard pattern in `src/ui/DockLayout.tsx`, and have the
  re-root effect skip while it's set.
- Cycles are inevitable (A→B→A). Do not pre-expand recursively: build
  children lazily on expand, and cap auto-expansion at the root's first
  level. An expanded path may repeat concepts — that is fine (Archi allows
  it) because laziness prevents infinite trees.

### 2.2 Files

- `src/ui/NavigatorPanel.tsx` — the panel. Local state: `rootId`,
  `direction: 'out' | 'in'`, `pinned`, `expanded: Set<string>` keyed by
  *tree path* (e.g. `parentPath + '/' + id`), not by concept id, so repeats
  expand independently.
- Relationship queries: add to `src/model/analysis.ts`:
  ```ts
  export function outgoingRelationships(state: ModelState, conceptId: string): ArchimateRelationship[];
  export function incomingRelationships(state: ModelState, conceptId: string): ArchimateRelationship[];
  ```
- Register panel id `navigator`, title `Navigator`, in `TOOL_PANELS` and
  `components` in `src/ui/dock/layout-config.tsx`. Position: docked with
  the `models` panel (`referencePanel: 'models', direction: 'within'`) when
  present, else `{ direction: 'left' }`. Do **not** add it to
  `buildDefaultLayout` — users opt in via the Views menu.

### 2.3 Tests: `tests/navigator.test.ts`

- `outgoingRelationships` / `incomingRelationships` correctness (pure).
- Component test (jsdom, following the style of `tests/properties-panel.test.ts`):
  render with a model in the store, select an element, assert the root row
  and first-level relationship rows appear; toggle direction; pin then
  change selection and assert root unchanged.

**Acceptance:** open Navigator from the Views menu on Archisurance, click
elements in the model tree and watch it re-root; drill down two levels;
screenshot. Gate per ground rule 5.

---

## Phase 3 — Align, match size & distribute

Canvas commands over a multi-selection of nodes, using **PowerPoint**
semantics (superseding the original GEF/Archi union-box design — see
`docs/superpowers/plans/2026-07-06-levelup-phase-3-powerpoint-align.md`).

### 3.1 Op: `src/model/ops/alignment.ts` (re-export from `ops.ts`)

```ts
export type AnchorMode = 'first' | 'last';
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type MatchMode = 'width' | 'height' | 'both';
export type DistributeMode = 'horizontal' | 'vertical';
export function alignNodes(ids: string[], mode: AlignMode, anchor: AnchorMode): void;  // transact('Align')
export function matchSize(ids: string[], mode: MatchMode, anchor: AnchorMode): void;   // transact('Match Size')
export function distributeNodes(ids: string[], mode: DistributeMode): void;            // transact('Distribute')
```

Semantics (all geometry in **absolute** view coordinates via
`absoluteBounds()` from `src/model/types.ts`, then written back relative to
each node's parent — subtract the parent chain's offset):

- Filter `ids` to element/group/note/ref **nodes** (ignore connection ids),
  preserving selection order. Drop any node whose ancestor is also in the
  set (moving the parent already moves it) — walk `parentId` chains.
- **Anchor** = the reference element that Align/Match snap the rest to,
  either the **first** or **last** of the filtered set. The caller passes
  this from the `alignmentAnchor` setting (`alignmentAnchorMode(settings)`),
  default **last selected**. Require ≥ 2 nodes, else no-op.
- **Align:** set each node's absolute position from the anchor box `A`,
  size unchanged. `left`: `x = A.x`; `right`: `x = A.x + A.width - node.width`;
  `center`: `x = A.x + A.width/2 - node.width/2`; `top`/`bottom`/`middle`:
  same on y. The anchor maps to itself and does not move.
- **Match size:** set each node's width/height from the anchor, keeping each
  node's top-left corner fixed.
- **Distribute (PowerPoint equal-gap):** no anchor; needs ≥ 3 nodes. Sort by
  the crossed edge, keep the two outermost fixed, and equalize the gaps
  between adjacent edges. `gap = ((last.pos + last.size) - first.pos - Σsize) / (n-1)`.
- Never touch `parentId` or z-order. One undo step per invocation.

### 3.2 UI wiring

- New setting `alignmentAnchor` (select: First / Last selected, default Last)
  in `src/settings/app-settings.ts`, plus `alignmentAnchorMode(settings)`.
- New icon module `src/canvas/view-editor/alignment-icons.tsx` (14×14
  `currentColor` SVGs) fed to `MenuItem.icon`.
- `src/canvas/view-editor/contextMenu.ts` → `showViewObjectContextMenu` takes
  `settings`; when ≥ 2 filtered nodes, append **Align** (6 items) and **Match
  Size** (Width/Height/Both) submenus; when ≥ 3, also a **Distribute**
  (Horizontally/Vertically) submenu. Each row carries an icon.
- Not shown in read-only mode (the mutating object menu is only wired by the
  editable view editor).

### 3.3 Tests: `tests/alignment.test.ts`

Pure op tests: three nodes at known bounds → assert exact bounds after each
align/match mode against the anchor; the anchor setting flips first↔last; a
nested child inside a selected parent is skipped; nested-but-parent-not-
selected node aligns using absolute coords; distribute equalizes gaps and
keeps the extremes fixed (and is a no-op for < 3 nodes); connections in `ids`
are ignored; single-node/no-change calls create no undo entry.

**Acceptance:** in the browser, Ctrl-click three elements, right-click →
Align Left (all snap to the last-clicked element), Distribute Horizontally
(even gaps); screenshot before/after; Ctrl+Z restores in one step. Gate per
ground rule 5.

---

## Phase 4 — Duplicate (model tree, Ctrl+D)

Port of Archi's `DuplicateCommandHandler` (search the Archi repo for that
class): duplicates **elements** and **views** from the model tree. Not
relationships, not folders (matches Archi).

### 4.1 Op: `src/model/ops/duplicate.ts` (re-export from `ops.ts`)

```ts
/** Duplicate tree items (elements and views only; others ignored).
 *  Returns new ids. One undo step for the whole call. */
export function duplicateItems(ids: string[]): string[];
```

Semantics (verify against the Java before coding; the below is the expected
result):

- **Element:** deep-copy (new id from `src/model/id.ts`), name gets
  `" (copy)"` appended, same `type`, `documentation`, `properties`
  (deep-copied array), same folder (append to that folder's `itemIds`).
  Relationships are **not** copied and do not point at the copy.
- **View:** copy the view object (new id, `" (copy)"`, same folder,
  `viewpoint`, `connectionRouterType`, properties). Then deep-copy every
  diagram node in the view (walk `childIds` recursively), preserving
  z-order, nesting, bounds, and all style fields, with an old→new id map.
  Element nodes keep the **same `elementId`** (a duplicated view shows the
  same concepts). Copy every `DiagramConnection` of the view whose source
  **and** target ids are both in the id map, remapping
  `sourceId`/`targetId`/`viewId` and keeping the same `relationshipId` and
  bendpoints. Rebuild `sourceConnectionIds`/`targetConnectionIds` on the
  copied nodes (`attachNode`/`attachConnection` in `src/model/ops/draft.ts`
  are the existing helpers for this — read them first).
- Wrap everything in a single `transact('Duplicate', …)`.
- After the op, callers select the copies: `setSelection('tree', newIds)`.

### 4.2 UI wiring

- `src/ui/ModelTree.tsx` context menu: add **Duplicate (Ctrl+D)** when the
  selection contains at least one element or view; disabled in read-only.
- `src/App.tsx` keyboard handler: Ctrl+D → if selection source is `'tree'`,
  call `duplicateItems(selection.ids)` and select the result. Follow the
  existing handler's guards (ignore when focus is in an input/textarea/
  Monaco, ignore in read-only) and `preventDefault()` so the browser
  bookmark dialog never opens.
- Add `['Ctrl+D', 'Duplicate']` to the shortcut help table in `Toolbar.tsx`.

### 4.3 Tests: `tests/duplicate.test.ts`

- Element duplicate: new id, `" (copy)"` name, same folder, properties
  deep-copied (mutating the copy's properties leaves the original intact).
- View duplicate on a view with: a nested child, a connection between two
  copied nodes, and a connection to a node *outside* the copied view (must
  not be copied). Assert node count, connection remapping, same
  `elementId`s, z-order preserved, and lossless original.
- Whole call is one undo step: `undoStack` grows by exactly 1; `undo()`
  removes all copies.
- Round-trip: duplicate a view in the Archisurance model, serialize with
  the archimate-xml serializer, re-parse, and assert the copied view
  survives (guards against inventing fields the serializer drops).

**Acceptance:** Ctrl+D on an Archisurance view in the tree → "(copy)" view
opens/renders identically; Ctrl+Z removes it. Gate per ground rule 5.

---

## Phase 5 — Viewpoint enforcement in the palette

Views already store a `viewpoint` id (see `setViewpoint` in
`src/model/ops/concepts.ts` and the picker in `PropertiesPanel.tsx`), but
nothing enforces it. Port Archi's `ViewpointManager`
(`com.archimatetool.model/src/com/archimatetool/model/viewpoints/ViewpointManager.java`)
so palette element entries not allowed by the active view's viewpoint are
greyed out and inert — Archi's default behavior.

### 5.1 Data: `src/model/data/viewpoints.ts` (hand-ported, React-free)

Fetch `ViewpointManager.java` from the Archi repo and transcribe the
default viewpoints table — same discipline as `icons.tsx` (1:1 port, cite
the source in a header comment). The viewpoint **ids must match** the keys
already in `VIEWPOINT_ID_TO_NAME` (`src/model/io/exchange-xml/mapping.ts`);
cross-check and fail loudly (test) if a ported id is missing there.

```ts
import type { ElementType } from '../metamodel';

export interface ViewpointDef {
  id: string;            // Archi viewpoint id, e.g. 'application_usage'
  name: string;          // display name
  elementTypes: readonly ElementType[]; // allowed element types (empty = allow all)
}
export const VIEWPOINTS: readonly ViewpointDef[] = [ /* ported table */ ];

/** '' / undefined viewpoint, junctions, and empty allow-lists allow everything (Archi behavior). */
export function isAllowedElementInViewpoint(viewpointId: string | undefined, type: ElementType): boolean;
```

Note from the Java: `ViewpointManager` allows connectors (Junction) in
every viewpoint, and a viewpoint with no declared classes allows all —
verify both while porting. Relationships are never restricted.

### 5.2 UI: `src/ui/Palette.tsx`

- Read the active view's viewpoint:
  `useStore((s) => s.activeViewId ? s.model?.views[s.activeViewId]?.viewpoint : undefined)`.
- Element entries whose type fails `isAllowedElementInViewpoint` get a
  `palette-item-disabled` class (add to `src/styles.css`: `opacity: 0.35;
  pointer-events: none;` — pointer-events off makes them unclickable and
  undraggable in one stroke) and `title="Not allowed by this view's viewpoint"`.
- Relationship, note, group, C4, and magic-connector entries are never
  disabled. No active view / no viewpoint → nothing disabled.

### 5.3 Tests: `tests/viewpoints.test.ts`

- Every `VIEWPOINTS` id exists in `VIEWPOINT_ID_TO_NAME` and vice versa.
- Spot-check three viewpoints against the ArchiMate 3.2 spec via the ported
  table (e.g. a business-layer element allowed, a technology element
  rejected in a business-only viewpoint; junction always allowed).
- Extend `tests/palette.test.ts`: with an active view whose viewpoint
  restricts, the right entries carry `palette-item-disabled`.

**Acceptance:** set a viewpoint on an Archisurance view via Properties →
palette greys immediately; clear it → palette restores. Screenshot both.
Gate per ground rule 5.

---

## Phase 6 — Model Validator panel *(depends on Phase 5)*

Port of Archi's Validator. In the Archi repo, find the checkers by
searching for `ValidatorView` and files matching `*Checker.java`
(they live under `com.archimatetool.editor`, package
`…editor.model.validator` / `…editor.validation` — trust the search, not
this path). Port **every checker you find**, keeping Archi's severity
(error / warning / advice), rule name, and message wording. Expected set
(verify against source): invalid relationship, duplicate concept names,
unused element, unused relationship, empty view, nested elements without a
relationship, viewpoint violations (uses Phase 5's table), junction rules.

### 6.1 Engine: `src/model/validation.ts` (React-free)

```ts
export type Severity = 'error' | 'warning' | 'advice';
export interface ValidationIssue {
  severity: Severity;
  rule: string;        // stable rule id, e.g. 'invalid-relationship'
  message: string;     // ported wording, with names interpolated
  conceptId?: string;  // element/relationship to select in the tree
  viewId?: string;     // view to open…
  objectId?: string;   // …and diagram node/connection to select in it
}
export function validateModel(state: ModelState): ValidationIssue[];
```

One pure function per checker, composed by `validateModel`. Reuse
`src/model/rules.ts` for relationship validity and Phase 5's
`isAllowedElementInViewpoint` for viewpoint checks.

### 6.2 UI: `src/ui/ValidatorPanel.tsx`

- Panel id `validator`, title `Validator`, registered like Phase 2's panel;
  default position: docked with `scripts` (`direction: 'within'`) when
  present, else `{ direction: 'below' }`. Views-menu opt-in only.
- A **Validate** button runs `validateModel` on demand (Archi validates on
  demand, not live) over `useStore.getState().model`; results in local
  state with a "N errors, N warnings, N advice" summary line.
- Rows grouped by severity (severity glyph ⛔/⚠️/ℹ️, rule, message). Click:
  if `viewId` → `openView(viewId)` + (`objectId` ? `setSelection('view', [objectId])` : nothing);
  else if `conceptId` → `setSelection('tree', [conceptId])`.
- Results don't auto-refresh on model edits; re-clicking Validate does.

### 6.3 Tests: `tests/validation.test.ts`

For each ported checker: build a minimal model exhibiting the issue, assert
exactly one issue with the right rule/severity/target; build the fixed
variant, assert silence. Plus: Archisurance produces **no errors** (it is a
valid model — warnings/advice are allowed; assert
`issues.every(i => i.severity !== 'error')`).

**Acceptance:** run Validate on Archisurance (screenshot); delete an
element that has relationships via a script/`__archiRunScript` to produce a
dangling state — or simpler, add an Assignment between two illegally-typed
elements via `__archiStore` ops — re-validate and see the error; click it
and land on the culprit. Gate per ground rule 5.

---

## Phase 7 — Outline (minimap) panel

A live thumbnail of the active view with the current viewport marked, and
click-to-pan. This is the only phase with cross-component plumbing — build
it in the three stages below and ship after any completed stage.

### 7.1 Stage A — thumbnail

- `src/ui/OutlinePanel.tsx`, panel id `outline`, title `Outline`,
  registered like the other new panels (opt-in; default dock: with
  `models`, `direction: 'within'`).
- Subscribe to `activeViewId` + `model`. Render
  `<svg viewBox="x y w h" …><StaticViewContent model={model} viewId={activeViewId}/></svg>`
  where the viewBox is the view's content bounds + margin. Reuse the
  content-bounds computation inside `src/canvas/export/view-image.ts`
  (export it if it isn't already). CSS: svg `width/height: 100%`,
  `preserveAspectRatio="xMidYMid meet"`, panel background matching the
  canvas. Empty/no active view → centered "No active view".
- This re-renders on every model change; that's fine (same cost as the
  editor itself). Debounce only if visibly janky — don't pre-optimize.

### 7.2 Stage B — viewport rectangle

- New bus `src/canvas/viewport-bus.ts` (module-level, mirroring the shape
  of `src/ui/layout-bus.ts`):
  ```ts
  export interface ViewportInfo { x: number; y: number; zoom: number; width: number; height: number; } // view-space rect of visible area
  export function publishViewport(viewId: string, info: ViewportInfo | null): void;
  export function subscribeViewport(viewId: string, cb: (info: ViewportInfo | null) => void): () => void;
  export function requestPanTo(viewId: string, centerX: number, centerY: number): void; // Stage C
  export function onPanRequest(viewId: string, cb: (cx: number, cy: number) => void): () => void;
  ```
- In `src/canvas/view-editor/useCanvasViewport.ts`, publish on every
  pan/zoom/resize change and publish `null` on unmount (effect cleanup).
- Outline subscribes for the active view and draws a
  `<rect>` (non-scaling stroke, e.g. `stroke="#1976d2" fill="rgba(25,118,210,0.08)"`)
  over the thumbnail in the same view-space coordinates — the shared
  viewBox does all the math.

### 7.3 Stage C — click / drag to pan

- Pointer down or drag on the outline svg → convert client coords to
  view-space via the svg's `getScreenCTM().inverse()` →
  `requestPanTo(activeViewId, x, y)`.
- `useCanvasViewport` registers `onPanRequest` and centers the viewport on
  the requested point at the current zoom.
- Viewport-only change: **not** a model mutation — no `transact`, no dirty
  flag, no undo entry.

### 7.4 Tests: `tests/outline.test.ts`

- viewport-bus: publish/subscribe/unsubscribe, pan request routing,
  `null` on unmount semantics (pure, no DOM).
- Component: with a model + active view in the store, the panel renders an
  svg whose `viewBox` equals the computed content bounds; with no active
  view it renders the empty state.
- Stage B/C interaction is verified in the browser (jsdom has no layout):
  playwright-drive — open Outline, zoom/pan the editor with real mouse
  wheel + drag, watch the rect move (screenshot), click a far corner of the
  outline and confirm the editor recentered (screenshot).

**Acceptance:** the three screenshots above on Archisurance's largest view.
Gate per ground rule 5.

---

## Explicitly out of scope for this arc

Do not start these even if they look adjacent — each needs its own design
doc first:

- **Profiles / specializations** (touches the lossless `.archimate`
  round-trip and the exchange format).
- **Images in diagrams** (`.archimate` becomes a zip archive when images
  are present — a file-format change).
- **HTML report export**, sketch/canvas view types, connection line styles
  / gradients (Archi stores these as `<feature>` elements — an IO change).

## Final checklist (after Phase 7)

- [ ] All seven phases committed individually, each gate green.
- [ ] `npm test` and `npm run build` clean at HEAD.
- [ ] New panels (Navigator, Validator, Outline) all open from the Views
      menu, survive a layout save/restore (reload the app), and behave in
      read-only shared-viewer mode.
- [ ] No React imports anywhere under `src/model/` (`grep -r "from 'react'" src/model` is empty).
- [ ] Update `docs/` app documentation if the wiki workflow from
      `2026-07-03-app-docs-and-github-wiki.md` applies.
