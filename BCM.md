# BCM — Packed Business Capability Maps

Design & implementation plan for a first-class capability-mapping scripting extension:
nested Capability rectangles, packed layouts, no relationship lines — on both the
jArchi scripting surface and a bundled extension. **Aesthetics is the key requirement**
of the layout engine; §2 grounds every layout decision in published visualization
research.

> Note: per the repo convention (CLAUDE.md), planning artifacts normally live under
> `docs/superpowers/` (gitignored) and are not committed. Keep this file out of commits
> or move it there when convenient.

## 1. Context & goals

Capability modeling is visualized as **packed rectangles**: Capability elements nested
inside parent Capabilities, tiled to fill the parent, with no relationship lines drawn.
The app already has every primitive needed (nesting via `parentId` + parent-relative
`bounds`, `layoutView` bulk apply, `setNodeStyle`), but **no packing/treemap layout
exists anywhere** — the only auto-layout is ELK layered (flat, edge-driven,
`src/model/layout/elk-graph.ts`).

**Confirmed scope decisions:**

| Decision | Choice |
|---|---|
| Hierarchy source | Composition + Aggregation relationships (Composition wins conflicts); generic over element types, defaulting to the roots' types |
| Cell sizing | Both modes, switchable: uniform grid cells (default, classic BCM look) and weighted treemap (area ∝ numeric property) |
| Delivery | Both surfaces: core jArchi wrapper APIs for user `.ajs` scripts + bundled extension with menus and settings panel |
| Extras | Heat-map coloring + legend, sync/refresh of existing maps, per-level styling, root picker + depth limit |

**Verified codebase facts that shape the design:**

- Extensions receive `$` and `model` wrappers directly (`src/extensions/runtime.ts`),
  so the extension calls the same wrapper APIs scripts use — **no `app.layout.packed`
  verb** (avoids a second, drifting API surface).
- `view.createLegend` derives entries from concept *types* visible in the view
  (`src/model/legend.ts`) — it cannot render value buckets. The heat-map legend must be
  **custom-built** (group + colored notes).
- `JView.layout` (wrappers.ts) does absolute→relative conversion itself; the packing
  engine emits **parent-relative bounds already**, so ops call `layoutView`
  (`src/model/ops/layout.ts:14`) directly and skip the round-trip.
- New views are created inline (pattern: `src/model/ops/generate-view.ts`) with
  `defaultFolderId(model,'diagrams')` (`src/model/ops/concepts.ts:76`) and
  `attachNode` (`src/model/ops/draft.ts:69`), committed via `transactWithSelection`.
- The UI nesting-relationship dialog (`src/ui/automatic-relationships.ts`) is UI-only;
  programmatic construction bypasses it — no prompts, no auto relationship lines.
- `model-tree.context` menu triggers carry `{targetId, selectionIds}` (ModelTree.tsx),
  so a generate command can read the right-clicked element. Menu items have no `when`
  clause — commands self-validate.
- `tests/extension-examples.test.ts:12` hardcodes the `exampleIds` folder list — it
  must be extended for a new bundled extension.
- Scripts run via `runScript` and extension commands via `registry.runCommand` are both
  wrapped in `runBatch` → multi-transact ops collapse to **one undo step** on both
  surfaces automatically.

## 2. Aesthetic requirements — research foundation

A capability map is a *communication artifact* (poster, steering-committee slide), not
an analysis scatterplot: it must look deliberate, tidy, and document-like. The
treemap/space-filling literature gives concrete, measurable criteria. Each requirement
below (R1–R7) is normative for the engine; §3 shows how the algorithms satisfy them.

**R1 — Comfortable aspect ratios, not forced squares.** Squarified treemaps drive
every rectangle's aspect ratio toward 1 (Bruls, Huizing & van Wijk 2000), but the
perceptual study by Kong, Heer & Agrawala (2010) found that squares are *not* optimal
for area comparison — extreme elongation is what hurts, while moderate elongation
reads fine and can even aid comparison of similar shapes. Consequence: containers
target a band of roughly **[1.0, 2.0] W/H with default `targetAspect` 1.6**
(≈ golden ratio — the familiar proportion of published BCM posters), and the cost
function penalizes deviation from the target *symmetrically in log space* rather than
minimizing toward 1.

**R2 — Reading order is sacred.** BCMs are read like a document: left→right,
top→bottom, in alphabetical or strategic-importance order. Shneiderman & Wattenberg
(2001, *Ordered Treemap Layouts*) and Bederson, Shneiderman & Wattenberg (2002)
introduced a *readability* metric (how continuous the visual scan of the ordered items
is) and showed order-preserving layouts vastly outperform squarify's greedy
re-ordering on it. Consequence: **sorting is a separate, explicit pre-step; the
packing algorithms themselves never permute sibling order.** Grid rows fill strictly
left→right, top→bottom in sibling order.

**R3 — Grid alignment for uniform cells (quantum principle).** When items are the
same size, they must land on an exact shared grid — this is the *Quantum Treemap*
guarantee (Bederson et al. 2002, built for photo thumbnails in PhotoMesa): all cell
dimensions are integer multiples of a fixed quantum. Alignment is also among the
strongest empirically-validated layout aesthetics (Purchase 1997, graph-drawing
aesthetics studies). Consequence: **grid mode treats the leaf cell as the quantum**
`q = (leafWidth, leafHeight)`; within any container whose children are all leaves,
every x-coordinate is a multiple of `q.w + gutter` and every row a multiple of
`q.h + gutter` — perfect row *and column* alignment, never approximate.

**R4 — Minimal raggedness.** A half-empty last row and rows of visibly different
widths are the number-one "auto-generated" tell. This is exactly the optimal
line-breaking problem: Knuth & Plass (1981) showed that choosing breakpoints to
minimize the *sum of squared slack* over all lines produces globally balanced
paragraphs where greedy first-fit produces one terrible last line. Consequence: **row
partitioning uses Knuth–Plass-style dynamic programming over the ordered sibling
sequence**, minimizing an aesthetic cost (below), instead of greedy shelf filling or a
single fixed column count.

**R5 — Uniform, bounded whitespace.** Gestalt proximity: equal spacing is what makes
siblings read as a group and the nesting read as hierarchy. Gutters and padding are
constants, never stretched to justify a row (no "flexible glue" between boxes — slack
is collected at the row end and minimized by R4, not distributed). The cost function
additionally penalizes total whitespace so the packing stays compact.

**R6 — Stability across updates.** Re-running layout after a small model change must
not scramble the map — users build spatial memory of "their" capability landscape.
Treemap-stability research (Sondag, Speckmann & Verbeek 2018, *Stable Treemaps via
Local Moves*; Vernier, Sondag et al. 2020, quantitative stability/quality comparison
across 14 algorithms) shows the cheapest effective stabilizer is **order
preservation**, and that greedy *insertion* of new items into an existing order beats
global recomputation for stability. Consequence: `layoutPacked`/`syncPacked` default
to **preserving the existing sibling order from the view** (`sort: 'none'` semantics,
reading current `childIds`), inserting new children at their sorted position among
surviving siblings; untouched subtrees keep byte-identical relative bounds. Full
local-moves optimization is explicitly out of scope for v1 (documented future work).

**R7 — Label legibility sets minimum dimensions; luminance encodes depth.** A cell
that cannot fit its label fails as communication. Title-band height is derived from
the level-0/1 font: `titleBandHeight ≈ ceil(sizePt · 96/72 · 1.6)` (line height +
breathing room; default 30px fits 12pt bold). Leaf minimums default to the standard
120×55 element size, comfortably above legibility floors. For depth encoding, cushion
treemaps (van Wijk & van de Wetering 1999) demonstrated that per-level shading is what
makes deep hierarchy structure readable without borders alone; the flat-design
analogue used here is the **monotone luminance ramp** of the per-level fills (§5):
darker = closer to root, so hierarchy is legible even where nesting borders coincide.

**References**

- Bruls, M., Huizing, K., van Wijk, J.J. (2000). *Squarified Treemaps.* Proc. Joint Eurographics/IEEE TCVG Symposium on Visualization.
- Shneiderman, B., Wattenberg, M. (2001). *Ordered Treemap Layouts.* IEEE InfoVis.
- Bederson, B.B., Shneiderman, B., Wattenberg, M. (2002). *Ordered and Quantum Treemaps: Making Effective Use of 2D Space to Display Hierarchies.* ACM Transactions on Graphics 21(4).
- Kong, N., Heer, J., Agrawala, M. (2010). *Perceptual Guidelines for Creating Rectangular Treemaps.* IEEE TVCG 16(6) (InfoVis).
- Knuth, D.E., Plass, M.F. (1981). *Breaking Paragraphs into Lines.* Software: Practice and Experience 11.
- Purchase, H.C. (1997). *Which Aesthetic Has the Greatest Effect on Human Understanding?* Proc. Graph Drawing.
- van Wijk, J.J., van de Wetering, H. (1999). *Cushion Treemaps: Visualization of Hierarchical Information.* IEEE InfoVis.
- Sondag, M., Speckmann, B., Verbeek, K. (2018). *Stable Treemaps via Local Moves.* IEEE TVCG 24(1).
- Vernier, E., Sondag, M., Comba, J., Speckmann, B., Telea, A., Verbeek, K. (2020). *Quantitative Comparison of Time-Dependent Treemaps.* Computer Graphics Forum 39(3).

## 3. Workstream 1 — Packing engine (pure geometry)

**New file: `src/model/layout/packed-tree.ts`** — React-free, store-free,
deterministic; a sibling of `elk-graph.ts` in style (types + pure functions).

```ts
export interface PackedTreeNode {
  id: string;
  name?: string;                       // sort key
  weight?: number;                     // treemap leaf weight; non-finite/<=0 -> 1
  children?: readonly PackedTreeNode[];
}

export interface AestheticWeights {
  aspect?: number;                     // default 1
  raggedness?: number;                 // default 0.5
  whitespace?: number;                 // default 0.25
}

export interface PackedTreeOptions {
  mode?: 'grid' | 'treemap';           // default 'grid'
  algorithm?: 'auto' | 'squarify' | 'strip';  // treemap only; default 'auto' (see below)
  leafWidth?: number;                  // default 120   (grid quantum width)
  leafHeight?: number;                 // default 55    (grid quantum height)
  padding?: number;                    // container inner padding, default 12
  gutter?: number;                     // sibling gap, default 12
  titleBandHeight?: number;            // default derived from level font (~30 for 12pt bold)
  targetAspect?: number;               // container W/H goal, default 1.6
  sort?: 'name' | 'weight' | 'none';   // PRE-step only (R2); default 'name'; 'none' = input order
  columns?: number;                    // grid: fixed items-per-row override (skips DP)
  aesthetics?: AestheticWeights;       // cost-function weights (R1/R4/R5)
  minCellWidth?: number;               // treemap floor, default 60
  minCellHeight?: number;              // treemap floor, default 30
}

export interface PackedTreeLayout {
  /** Bounds PARENT-RELATIVE; root entries relative to (0,0). */
  nodes: Record<string, Bounds>;
  size: { width: number; height: number };
}

export function layoutPackedTree(
  roots: readonly PackedTreeNode[],
  options?: PackedTreeOptions,
): PackedTreeLayout;
```

### 3.1 Grid mode (default) — quantum-aligned packing with balanced row breaking

Recursive bottom-up; satisfies R1–R5.

1. **Depth-first sizing:** each child's size is computed first (leaf =
   `leafWidth × leafHeight` — the quantum; container = its packed extent).
2. **Order (R2):** siblings are sorted once as a pre-step (`name` → stable text
   compare then id; `weight` → descending, then name, then id; `none` → input order),
   then **never permuted by packing**. Rows fill strictly left→right, top→bottom.
3. **Row partitioning (R4 — Knuth–Plass DP):** choose row breaks over the ordered
   sequence by dynamic programming. `best(i)` = minimal total cost of laying out
   children `i..n`; transition tries each break `j ≥ i` forming row `i..j`
   (row width = Σ widths + gutters, row height = max height in row). Total cost of a
   complete partition (extent `W × H`, rows `r_1..r_R`):

   ```
   aspectDev  = |ln((W/H) / targetAspect)|                       (R1, log-symmetric)
   raggedness = Σ_rows (W − W_row)² / (R · W²)                   (R4, normalized)
   whitespace = 1 − (Σ child areas) / (W · H)                    (R5, compactness)
   cost       = wa·aspectDev + wr·raggedness + ww·whitespace     (weights from `aesthetics`)
   ```

   Because `W` (the max row width) couples rows, run the DP once per candidate width
   budget: candidate set = the n prefix widths (width of the first k items + gutters,
   k = 1..n); rows must not exceed the budget; evaluate the full cost per candidate
   and keep the global best. Complexity O(n³) worst case — fine for realistic sibling
   counts (n ≤ ~50 per parent); above n = 100, fall back to the O(n²) fixed-k scan
   (pick k minimizing the same cost). `columns` bypasses the DP entirely (fixed k, for
   users who want an exact column count). All ties broken by fewest rows, then id —
   fully deterministic.
4. **Quantum alignment (R3):** for a container whose children are all leaves, every
   row is `k·(q.w+gutter) − gutter` wide and rows stack at `q.h + gutter` pitch —
   exact column *and* row grid, by construction. Mixed containers (leaf + container
   children) keep exact sizes; alignment holds within each uniform run. Rows are
   top-aligned, items left-aligned; slack collects at row end (R5 — no stretched
   glue).
5. **Container size:** inner extent + `2·padding` horizontally + `titleBandHeight`
   top + `padding` bottom (R7). Children offset by `(padding, titleBandHeight)`.
6. **Root list** is packed the same way at a virtual origin (gutters only, no padding,
   no title band).

### 3.2 Treemap mode — order-aware squarified/strip hybrid

Top-down; leaf area ∝ weight. Satisfies R1/R2 via the `algorithm` rule:

- **`'auto'` (default):** if `sort` is `'weight'`, use **squarified** (Bruls et al.
  2000) — its internal descending-weight order *equals* the displayed sibling order,
  so it is order-preserving in effect while giving the best aspect ratios. Otherwise
  (`'name'`/`'none'` — order matters), use **strip treemap** (Bederson et al. 2002) —
  the layout shown to give the best readability/aspect-ratio trade-off for ordered
  data: items placed in sibling order into horizontal strips, strip height chosen so
  the average aspect ratio of the strip's items is closest to the target.
- Explicit `'squarify'` / `'strip'` override the rule.

Mechanics (both algorithms):

1. Effective leaf weight = `finite && > 0 ? weight : 1`, pre-clamped so each cell ≥
   `minCellWidth × minCellHeight` (clamping skews strict proportionality for tiny
   weights — documented). Container weight = recursive descendant sum.
2. Root rect: `area = totalWeight · unitArea` (`unitArea = leafWidth · leafHeight` =
   area of a weight-1 leaf), `width = sqrt(area · targetAspect)` (R1: the *whole map*
   also targets the aspect band).
3. Per container: content rect = container rect inset by `padding`
   (left/right/bottom) + `titleBandHeight` (top). Squarify: rows along the shorter
   side, admit items while the row's `worst()` aspect does not degrade. Strip:
   horizontal strips in order. `gutter` applied by shrinking each cell `gutter/2` per
   shared edge (clamped to min size) — uniform visual gaps (R5). Recurse into
   containers.
4. Integer output: round edges, derive sizes from rounded edges — no rounding gaps or
   overlaps.

### 3.3 Stability contract (R6)

`layoutPackedTree` itself is a pure function of its input order — stability is
delivered by the *callers* (§4) feeding it the right order:

- Repack of an existing view: tree built from current view nesting **in current
  `childIds` order** with `sort: 'none'` → identical input ⇒ identical output
  (deterministic), small input changes ⇒ localized output changes (only ancestors of
  the change re-size; sibling order everywhere else untouched).
- Sync: new children are **inserted** at their sorted position among surviving
  siblings (greedy insertion — Vernier et al. 2020 show this preserves the mental map
  far better than global re-sort); survivors keep their relative order even if their
  names changed.

## 4. Workstream 2 — Hierarchy derivation

**New file: `src/model/composition-tree.ts`** — flat module next to
`analysis-graph.ts` (`src/model/analysis.ts` already exists; do not create an
`analysis/` directory).

```ts
export interface CompositionTreeOptions {
  rootIds: readonly string[];                       // element ids
  elementTypes?: readonly ElementType[];            // child filter; default = union of root types
  relationshipTypes?: readonly RelationshipType[];  // default [Composition, Aggregation]; order = priority
  depth?: number;                                   // levels below roots; default unlimited
  direction?: 'source-is-parent' | 'target-is-parent'; // default 'source-is-parent'
}

export interface CompositionTreeNode {
  elementId: string;
  depth: number;                                    // 0 = root
  children: CompositionTreeNode[];
}

export interface CompositionTreeResult {
  roots: CompositionTreeNode[];
  parentOf: Record<string, string>;                 // child -> chosen parent
  duplicates: Record<string, string[]>;             // child -> rejected parents (multi-parent report)
  cyclesBroken: { relationshipId: string; sourceId: string; targetId: string }[];
  elementIds: string[];                             // stable pre-order
}

export function deriveCompositionTree(
  model: ModelState,
  options: CompositionTreeOptions,
): CompositionTreeResult;
```

Algorithm:

1. One pass over `model.relationships` builds `parent → [{relId, relType, childId}]`
   adjacency for allowed relationship types (whole→part per `direction`). Children must
   pass `elementTypes`; roots included regardless.
2. Level-by-level BFS from de-duplicated roots. Per level, collect all candidate
   `(parentId, relType, relId, childId)` claims, then per child pick the winner by:
   relationship-type priority (Composition beats Aggregation) → parent name → parent
   id. Losers recorded in `duplicates`.
3. Cycle safety: reject claims whose child is an ancestor of the claiming parent (walk
   `parentOf`) or already placed at a shallower level; ancestor rejections go to
   `cyclesBroken`.
4. Children within a parent sorted by name/id; stop expanding at `depth`.

## 5. Workstream 3 — Core map ops

**New file: `src/model/ops/capability-map.ts`** (pattern:
`src/model/ops/generate-view.ts` — pure prepare, atomic commit), plus
**new `src/model/color-scale.ts`**.

```ts
export interface PackedMapStyle {
  levelFills?: readonly string[];      // explicit per-depth fills
  baseFill?: string;                   // else derived from root type's layer fill
  fontSizes?: readonly number[];       // pt per depth, default [12, 11, 10, 9]; bold at depth 0-1
  parentTextAlignment?: number;        // default 2 (SWT center)
  parentTextPosition?: number;         // default 0 (top)
  leafTextAlignment?: number;          // default 2
  leafTextPosition?: number;           // default 1 (center)
  iconVisible?: 0 | 1 | 2;             // default 2 (hidden)
  applyStyling?: boolean;              // default true; false = geometry only
}

export interface PackedMapOptions {
  rootIds: readonly string[];
  elementTypes?: readonly ElementType[];
  relationshipTypes?: readonly RelationshipType[];
  depth?: number;
  weightProperty?: string;             // element property parsed as float; fallback 1
  layout?: PackedTreeOptions;
  style?: PackedMapStyle;
}
```

### `buildPackedMapView(store, options & {name?, open?})`

`deriveCompositionTree` → map to `PackedTreeNode` (weights read from element
properties) → `layoutPackedTree` → construct `DiagramView`
(`folderId: defaultFolderId(model, 'diagrams')`) and `ElementNode`s **directly in the
draft** via `attachNode`, with parent-relative bounds and per-level style fields baked
in at construction (`fillColor`, `fontStyle`, `textAlignment`, `textPosition`,
`iconVisible`, `alpha`). If `titleBandHeight` is not given, derive it from the
container level's font size (R7). No `addElementNodeToView` per node, no auto-connect,
no connections at all. Commit via
`transactWithSelection('Generate Capability Map', …)`; `openView` unless
`open === false`. Returns `{viewId, nodeIds, elementIds, duplicates, size}`.

### `applyPackedMapLayout(store, viewId, {scopeNodeIds?, weightProperty?, layout?})`

Repacks the **existing view nesting** — the tree is read from node `childIds`
(element nodes only; notes/groups untouched), not from relationships. **Defaults to
`sort: 'none'`** so the current sibling order — including any manual reordering the
user has done — is preserved (R6). Scope roots default to the view's top-level element
nodes; each scope root keeps its current x/y and only width/height + descendant bounds
are replaced. Engine output is already parent-relative → apply via
`layoutView(nodeUpdates, [], store)` directly. Returns `{nodeCount, size}`.

### `syncPackedMapView(store, viewId, options)`

One undo step (callers are already inside `runBatch`):

1. Derive the desired tree from the model (default roots = elementIds of the view's
   top-level element nodes).
2. Index existing element nodes by `elementId` (recursive walk; first occurrence wins,
   extras reported).
3. Reparent survivors whose current parent node ≠ node of the desired parent element —
   one `commitMove` entries array (`src/model/ops/movement.ts:44`).
4. Add missing elements as new `ElementNode`s under their parent's node with
   level-default styling, **inserted at their sorted position among surviving
   siblings** (greedy insertion, R6) — survivors are not re-sorted.
5. Delete stale element nodes with `deleteViewObjects` (survivors were reparented away
   first, so subtree deletion is safe).
6. Repack via `applyPackedMapLayout` (order-preserving).
7. Never touch style fields of surviving nodes — user styling preserved by
   construction.

Returns `{added, removed, reparented}`.

### Per-level styling (`src/model/color-scale.ts`)

- `deriveLevelFills(baseHex, levels)` — level 0 = `ELEMENT_TYPE_MAP[type].fill`
  (Capability → strategy layer `#f5deaa`), each deeper level mixed ~18% further toward
  white: a **monotone luminance ramp** so depth stays legible without relying on
  borders alone (R7 / cushion-treemap principle); `mixHex(a, b, t)` helper.
- Parents: `textPosition 0` (top) + `textAlignment 2` — parents are ordinary
  `ElementNode`s with nested children; the label renders in the top strip and the
  engine's `titleBandHeight` keeps children clear of it. Leaves: `textPosition 1`
  (center).
- `fontSizes` clamp to the last entry for deeper levels; bold at depths 0–1;
  `iconVisible 2` by default. All overridable; `applyStyling: false` = geometry only.

## 6. Workstream 4 — Core scripting API

All additions documented as **"additive Archi Online APIs"** (the established phrasing
in Scripting-API.md, used for `view.layout`). Where jArchi has an equivalent, use
jArchi's exact names/semantics.

**Modify `src/scripting/jarchi/wrappers.ts`** (thin 1–5 line delegates — the file is
already ~1600 lines):

1. **`JVisual` style accessors** (get/set pairs delegating to
   `setNodeStyle([this.id], {...}, boundModelStore(this))`, same pattern as the
   existing `gradient` setter):
   - jArchi-compatible: `fontSize: number`, `fontName: string`,
     `fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic'` (mapped to internal
     `FontStyle {family, sizePt, bold, italic}` via `src/model/font-style.ts`),
     `textAlignment` (SWT 1/2/4), `textPosition` (0/1/2), `figureType`, `borderType`.
   - Archi Online additive: `iconVisible: 0 | 1 | 2`.
2. **`JView.layoutPacked(options?)`** → `applyPackedMapLayout`. Options:
   `{mode, algorithm, leafWidth, leafHeight, padding, gutter, titleBandHeight,
   targetAspect, sort, columns, aesthetics, weightProperty, scope?: JVisual[]}`
   (scope defaults to whole view; `sort` defaults to `'none'` — preserve view order,
   R6). Returns `{nodeCount, size}`. Synchronous — no `await` needed in `.ajs`
   scripts.
3. **`JView.syncPacked(options?)`** → `syncPackedMapView`; returns
   `{added, removed, reparented}`.
4. **`JView.applyHeatmap(options)`** → see §8.
5. **`JModel.createPackedView(options): JView`** — generic name, nothing
   Capability-hardcoded:
   `{roots: JConcept | JConcept[] | string[], name?, elementTypes?,
   relationshipTypes?, depth?, mode?, weightProperty?, layout?, style?, open?}`.
   Validates roots are elements bound to the same store. `elementTypes` defaults to
   the roots' own types → Capability maps fall out naturally.

**Modify `src/scripting/jarchi-dts.ts`** — extend `JARCHI_SCRIPT_DTS` (ArchiVisual,
ArchiView, ArchiModel) and mirror in `JARCHI_EXTENSION_DTS`; required for Monaco
IntelliSense. `tests/jarchi-dts.test.ts` guards dts/wrapper parity — update it.

**Decision — no `app.layout.packed`:** the extension runtime injects `$`/`model`, and
unlike ELK (async bridge predating the wrapper surface) the packed API is synchronous
and complete on the wrappers. `src/extensions/app-api.ts` stays untouched.

## 7. Workstream 5 — Bundled extension

**New folder: `extensions/capability-map/`** (template: `extensions/elk-layout/`).

- `manifest.json` — schemaVersion 2, id `examples.capability-map`; commands, menus,
  panel declared.
- `data/defaults.json` — defaults/limits: mode, algorithm, leafWidth/Height, padding,
  gutter, titleBandHeight, targetAspect, sort, depth, aesthetics weights,
  weightProperty, heatmapProperty, heatmapPalette, levelFills.
- `main.js` commands (menu items have no `when` clause → each command self-validates
  and reports via `app.dialogs.info` on invalid selection):

| Command | Menus | Behavior |
|---|---|---|
| `examples.capability-map.generate` | `model-tree.context`, `extensions.menu` | Roots from `context.trigger.targetId`, fallback `context.selectionIds`; `model.createPackedView({roots, ...storedOptions})` |
| `examples.capability-map.repack` | `view.context`, `selection.context` | `app.views.active().layoutPacked({...options, scope: app.selection.visuals()})` |
| `examples.capability-map.sync` | `view.context` | `view.syncPacked(options)` + result counts dialog |
| `examples.capability-map.heatmap` | `view.context`, `extensions.menu` | `view.applyHeatmap({property, palette, legend})` |
| `examples.capability-map.open` | `extensions.menu` | Opens the settings panel |

- Panel `examples.capability-map.panel`: settings form persisted via
  `app.storage.get/set('options')` — reuse elk-layout's `addSelect`/`addNumber` field
  helper style, plus text inputs for property names and a comma-separated level-fills
  field.
- **Must** add `'capability-map'` to `exampleIds` in
  `tests/extension-examples.test.ts:12` (the folder-list assertion fails otherwise).
  Archives auto-build via `extensions/build-archives.mjs` (directory scan).

## 8. Workstream 6 — Heat map + custom legend

**In `src/model/color-scale.ts`** (pure):

- `numericColorScale(values, {min?, max?, palette}): (v) => string` — piecewise-linear
  RGB interpolation across palette stops; auto min/max from data.
- `categoricalColorScale(values, palette): Map<string, string>` — sorted unique
  values, palette cycled.
- `heatmapBuckets(...)` — numeric: N range buckets `{label: '10 – 20', color}`;
  enum: `{label: value, color}` — feeds the legend.

**In `src/model/ops/capability-map.ts`:**

```ts
applyHeatmapToView(store, {
  viewId, nodeIds?, property,
  mode: 'auto' | 'numeric' | 'enum',   // auto = numeric iff all non-missing values parse finite
  palette?, min?, max?,
  missingColor?,                        // unset = leave missing untouched
  legend?: { x?, y?, title? } | false,
})
```

- Targets all element nodes recursively (or given scope); reads the property from the
  **element**, not the node.
- Groups node ids by resolved color → one `setNodeStyle(ids, {fillColor})` call per
  color. Missing values painted only if `missingColor` set (adds a "No data" bucket).
- **Legend is custom-built** (verified: built-in `createLegend` entries are
  type-derived and cannot represent value buckets): a `GroupNode` titled
  `title ?? 'Heat map: <property>'` containing one small `NoteNode` per bucket
  (`fillColor` = bucket color, text = bucket label), placed at `legend.x/y` or just
  right of the map extent. Same batch, same undo step.
- Wrapper `JView.applyHeatmap` returns `{painted, missing, buckets}`.

## 9. Sequencing (each step ships green)

1. **WS1** `src/model/layout/packed-tree.ts` + `tests/packed-tree.test.ts` — independent, pure.
2. **WS2** `src/model/composition-tree.ts` + `tests/composition-tree.test.ts` — independent, pure.
3. **WS3** `src/model/ops/capability-map.ts` + `src/model/color-scale.ts` + `tests/capability-map.test.ts` (needs 1+2).
4. **WS4** wrappers + dts + Scripting-API docs + `tests/capability-map-scripting.test.ts`, update `tests/jarchi-dts.test.ts` (needs 3) — scripting surface ships here.
5. **WS6** heatmap op + wrapper (needs 3; wrapper rides with/after 4).
6. **WS5** extension + `tests/extensions-capability-map.test.ts` + `tests/extension-examples.test.ts` update + Extension-Packages docs (needs 4).
7. Built-in example script + docs polish + `npm run ci:check`.

## 10. Docs & example script

- `docs/wiki/Scripting-API.md`: new **"Packed layout and capability maps"** section
  (`model.createPackedView`, `view.layoutPacked`, `view.syncPacked`,
  `view.applyHeatmap`), marked additive Archi Online APIs; extend the visual-object
  property table with `fontSize` / `fontName` / `fontStyle` / `textAlignment` /
  `textPosition` / `figureType` / `borderType` / `iconVisible`. Mirror to
  `.wiki-publish/` per repo convention.
- `docs/wiki/Extension-Packages.md`: Capability Map row in the examples table.
- `src/scripting/example-scripts.ts`: add
  `{id: 'builtin-capability-map', name: 'capability map', code: …}` demonstrating
  derive → build → heatmap on selected roots.
- Record the no-`app.layout.packed` decision in the PR description (not the docs).

## 11. Tests & verification

**Unit — `tests/packed-tree.test.ts`** (the aesthetic requirements become executable
invariants):

- Determinism incl. shuffled-input equivalence under `sort:'name'`.
- Pairwise sibling non-overlap; containment within parent content box.
- Grid leaves exactly `leafWidth × leafHeight`; **quantum alignment (R3):** in
  all-leaf containers, every child x ≡ 0 (mod `q.w + gutter`) and rows at
  `q.h + gutter` pitch.
- **Order preservation (R2):** packing never permutes input order — reading cells
  top-to-bottom, left-to-right reproduces the sibling sequence.
- **Aspect band (R1):** container aspect within [1.0, 2.0] for n = 1..40 uniform
  leaves at default options.
- **Raggedness (R4):** DP result's cost ≤ greedy shelf result's cost on randomized
  heterogeneous inputs; last-row fill for uniform leaves ≥ what any other k achieves.
- **Stability (R6):** with `sort:'none'`, appending one child changes bounds only for
  the affected ancestors' extents — all other relative bounds byte-identical.
- Treemap: leaf-area ∝ weight within tolerance; strip preserves order; `auto` picks
  squarify iff `sort:'weight'`; zero/missing/negative weights; min-cell clamps;
  empty/single-node edge cases.

**Unit — `tests/composition-tree.test.ts`:** chain; diamond multi-parent →
Composition-over-Aggregation + alphabetical fallback + `duplicates` report; self and
mutual cycles; depth limit; type filter; direction option.

**Unit — `tests/capability-map.test.ts`:** build creates view in diagrams folder with
correct nesting/relative bounds/level styles; **single undo step** (follow
`tests/generated-view.test.ts` history assertions); sync add/remove/reparent
preserving survivor `fillColor` **and survivor sibling order**; heatmap painting +
legend group.

**Integration — `tests/capability-map-scripting.test.ts`:** full script through
`runScript` building a map (follow `tests/legend-scripting.test.ts`).

**Extension — `tests/extensions-capability-map.test.ts`:** mirror
`tests/extensions-elk-layout.test.ts` (commands registered, options persisted,
generate command against a seeded store).

**Manual:** `npm run dev`, seed Capabilities + Composition rels, run the built-in
example script via `__archiRunScript`, exercise the extension menus, screenshot via
playwright-cli (per CLAUDE.md browser gotchas) — visually confirm grid alignment,
last-row balance, and the luminance ramp.

**Gate:** `npm run ci:check` (includes docs check, lint, typecheck, tests, build).

## 12. Risks & open questions

- **Composition direction:** derivation defaults to parent = relationship source;
  models drawn part→whole would yield empty trees — the `direction` option is the
  cheap hedge (included).
- **DP cost at scale:** O(n³) worst case per container; guarded by the n > 100
  fallback to the O(n²) fixed-k scan. Realistic BCMs (≤ ~30 children per capability)
  are nowhere near the guard.
- **Strip treemap worst case:** long ordered strips can still produce elongated cells
  when weights vary wildly within a strip; acceptable trade-off for order preservation
  (per Bederson et al.'s own evaluation), and `algorithm:'squarify'` remains one
  option away.
- **Duplicate element occurrences in a view** break sync's elementId→node matching;
  policy: first occurrence wins, extras reported. BCMs shouldn't contain duplicates in
  practice.
- **Treemap min-cell clamping** skews strict area proportionality for tiny weights;
  documented behavior.
- **`minNodeSize` clamp** applies only through `JView.layout`; the packed path calls
  `layoutView` directly, but leaf defaults (120×55) are far above the clamp anyway.
- **Full stability optimization** (local moves, Sondag et al. 2018) is out of scope
  for v1; order preservation + greedy insertion covers the practical need. Revisit if
  users report layout jumping on sync.

## 13. Critical files

| File | Action |
|---|---|
| `src/model/layout/packed-tree.ts` | new — packing engine (quantum grid + DP row breaking; squarify/strip treemap) |
| `src/model/composition-tree.ts` | new — hierarchy derivation |
| `src/model/ops/capability-map.ts` | new — build/repack/sync/heatmap ops (pattern: `src/model/ops/generate-view.ts`) |
| `src/model/color-scale.ts` | new — level fills (luminance ramp), heat-map scales, buckets |
| `src/scripting/jarchi/wrappers.ts` | modify — JVisual style accessors; `JView.layoutPacked/syncPacked/applyHeatmap`; `JModel.createPackedView` |
| `src/scripting/jarchi-dts.ts` | modify — IntelliSense for all additions |
| `src/scripting/example-scripts.ts` | modify — built-in "capability map" script |
| `extensions/capability-map/` (`manifest.json`, `main.js`, `data/defaults.json`) | new — bundled extension (template: `extensions/elk-layout/`) |
| `tests/extension-examples.test.ts` | modify — add `'capability-map'` to `exampleIds` |
| `docs/wiki/Scripting-API.md`, `docs/wiki/Extension-Packages.md` (+ `.wiki-publish/` mirrors) | modify — API docs |
