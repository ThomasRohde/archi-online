# ELK Layout Extension Design

## Summary

Add an optional ELK layout extension for Archi Online. The app will bundle
`elkjs` and expose a narrow extension-facing layout helper, while the user
workflow lives in a packaged example extension under `extensions/elk-layout`.

This keeps ELK reliable and testable without forcing the large ELK runtime into
`.archi-ext` package storage. It also proves the diagram automation APIs added
for extensions: active view discovery, selection inspection, absolute bounds,
connection routes, and transactional `view.layout(...)`.

## Goals

- Provide command-driven automatic diagram layout using ELK.
- Keep ELK as an optional extension capability, not a built-in toolbar feature.
- Use a host-provided `elkjs` dependency instead of bundling ELK inside the
  extension archive.
- Support selection-first layout with whole-view fallback.
- Route only scoped connections and preserve unrelated manual bends.
- Persist extension preferences in browser/profile-local extension storage.
- Apply layout through existing model transactions, undo/redo, dirty state, and
  XML serialization.

## Non-Goals

- No live automatic relayout on every model change.
- No remote extension install, marketplace, or package update system.
- No recursive group/internal layout in v1.
- No new model persistence format.
- No direct exposure of raw Zustand state as the extension contract.

## Approach

Use a host layout service plus a thin extension package.

The app adds `elkjs` as a dependency and exposes a small extension API:

```ts
app.layout.elk(request: ElkLayoutRequest): Promise<ElkLayoutResult>;
```

The package in `extensions/elk-layout` registers commands, menus, a dockable
panel, and browser-local preferences. Extension code calls the host helper
rather than importing ELK directly. This avoids package-size pressure and keeps
ELK's implementation details out of extension source.

## Public API

The first API should be intentionally narrow:

```ts
interface ElkLayoutRequest {
  view?: JView;
  scope?: 'selection-or-view' | 'view' | 'selection';
  direction?: 'right' | 'down' | 'left' | 'up';
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeRouting?: 'preserve' | 'orthogonal' | 'splines';
  recursive?: false;
}

interface ElkLayoutResult {
  scope: 'selection' | 'view';
  nodeCount: number;
  connectionCount: number;
  routedConnectionCount: number;
  elapsedMs: number;
}
```

Semantics:

- `view` defaults to `app.views.active()`.
- `scope: 'selection-or-view'` uses selected root visuals when at least two
  layoutable selected nodes exist, otherwise all top-level nodes in the view.
- `scope: 'selection'` layouts selected root visuals only and no-ops when fewer
  than two selected nodes exist.
- `scope: 'view'` layouts all top-level nodes in the active view.
- `recursive` is present for future compatibility but must be `false` or
  omitted in v1.
- Numeric options are clamped before ELK is invoked.

Add the declaration to `src/scripting/jarchi-dts.ts` under `app.layout`.

## Extension UX

The `extensions/elk-layout` package contributes:

- `Extensions` menu item: `ELK Layout...`
- View/selection context menu item: `Layout with ELK`
- Dockable panel: `ELK Layout`
- Optional toolbar button only if it does not crowd the existing toolbar

Panel controls:

- Direction: right, down, left, up
- Node spacing
- Layer spacing
- Edge routing: preserve, orthogonal, splines
- Scope preview: selected nodes or whole active view
- Apply
- Reset defaults

Preferences are stored through `app.storage` under the extension ID. They are
browser/profile-local and are not model data.

## Layout Scope Rules

The default command behavior is selection-first fallback:

1. Read `app.views.active()`.
2. Read `app.selection.visuals()`.
3. Reduce selected visuals to layout roots. If a selected visual has a selected
   ancestor, keep the ancestor and drop the child.
4. If at least two selected roots remain, layout those roots.
5. Otherwise layout all top-level nodes in the active view.

For selection layout:

- Include a connection only when both endpoints are in the selected root scope.
- Apply ELK routes only to included connections.
- Preserve all unrelated connection bends.

For whole-view layout:

- Include top-level nodes and all connections whose endpoints are included.
- Apply ELK edge sections to included connections when routing is not
  `preserve`.

V1 does not recursively rearrange children inside groups. Group contents move
with their parent group because the group node's bounds are moved through the
existing diagram model.

## ELK Graph Mapping

The host helper builds an ELK graph from the stable scripting wrappers:

- `JVisual.id` becomes the ELK node ID.
- `visual.absoluteBounds()` provides width and height.
- `view.connections()` provides candidate edges.
- `connection.source` and `connection.target` map to ELK edge endpoints.

Default ELK options:

```ts
{
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': String(nodeSpacing),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
  'elk.edgeRouting': 'ORTHOGONAL'
}
```

Direction mapping:

- `right` -> `RIGHT`
- `down` -> `DOWN`
- `left` -> `LEFT`
- `up` -> `UP`

Edge routing mapping:

- `preserve`: do not apply ELK edge sections.
- `orthogonal`: request and apply orthogonal edge sections.
- `splines`: request splines if supported; otherwise fall back to orthogonal and
  report that fallback in the result or panel status.

## Applying Results

After ELK resolves:

1. Convert ELK node positions to absolute view-space bounds.
2. Preserve each node's current width and height unless ELK returns valid
   dimensions.
3. Convert ELK edge sections to intermediate `JPoint[]` routes.
4. Call `view.layout({ nodes, connections })` once.

This creates one normal undo entry named by the existing layout operation, marks
the model dirty, refreshes the canvas, and serializes to `.archimate` through
current XML behavior.

## Error Handling

The host helper should reject invalid requests before applying model changes.

Cases:

- No active view: reject with `No active view`.
- Empty view: return a zero-count result.
- Selection-only scope with fewer than two nodes: return a zero-count result.
- Invalid direction or routing mode: use defaults after clamping/normalization.
- Invalid spacing: clamp to a sensible range.
- ELK failure: reject with the ELK error message and do not mutate the model.
- Missing endpoints or stale IDs: skip only during graph extraction before ELK;
  do not partially apply a layout after ELK has run.

The extension command should surface errors in the panel and use
`app.dialogs.info(...)` for command-triggered failures when the panel is not
visible.

## Files

Likely implementation files:

- `package.json`
- `package-lock.json`
- `src/extensions/layout/elk.ts`
- `src/extensions/app-api.ts`
- `src/scripting/jarchi-dts.ts`
- `tests/extensions-elk-layout.test.ts`
- `extensions/elk-layout/manifest.json`
- `extensions/elk-layout/main.js`
- `extensions/elk-layout/README.md`
- `extensions/elk-layout/data/defaults.json`
- `extensions/README.md`

## Testing Strategy

Unit and integration tests:

- Host helper layouts a simple active view and applies node bounds.
- Selection-first fallback uses selected roots when at least two selected nodes
  exist.
- Whole-view fallback is used when selection has fewer than two layoutable
  visuals.
- Selected child plus selected parent is reduced to the parent root.
- Selection-only routing updates only connections whose endpoints are both in
  scope.
- Whole-view routing applies route points for included connections.
- `edgeRouting: 'preserve'` leaves existing bends unchanged.
- ELK failure does not mutate model state.
- Packaged command can call `app.layout.elk(...)`.
- `extensions/elk-layout` builds into an `.archi-ext` archive.

Verification commands:

```bash
npm test
npm run typecheck
npm run build
node extensions/build-archives.mjs
```

## Rollout Plan

1. Add `elkjs` and a small host helper that can layout a supplied graph.
2. Add `app.layout.elk(...)` and declarations.
3. Implement graph extraction from `JView`/selection.
4. Implement result application through `view.layout(...)`.
5. Add the `extensions/elk-layout` package and panel.
6. Add tests for host helper behavior and package loading.
7. Build extension archives and verify the package can be imported manually.

## Self-Review

- Placeholder scan: no placeholder sections remain.
- Internal consistency: ELK is app-bundled, while UI and preferences live in an
  optional extension package.
- Scope check: this is one coherent implementation slice and avoids recursive
  group layout and live relayout.
- Ambiguity check: selection-first fallback, route preservation, and whole-view
  routing behavior are explicitly defined.
