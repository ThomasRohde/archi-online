# Diagram Automation API Design

## Summary

Add a general diagram automation API to the scripting and extension system. The
API should make view graph traversal, selection inspection, bulk layout, and
connection route editing first-class script capabilities. ELK layout is the
forcing use case, but the design should also support align/distribute tools,
diagram cleanup commands, custom routing, view audits, and scripted visual
transformations.

The API should expose stable wrappers and small DTOs instead of requiring
extensions to inspect `app.model.current()` internals. Mutations should continue
to use existing model operations and transactions so undo/redo, dirty state,
XML serialization, and UI refresh behavior remain consistent with canvas edits.

## Goals

- Allow extensions to discover the active view and current selection.
- Allow scripts to traverse diagram nodes and connections from a `JView`.
- Allow scripts to inspect parent/child relationships and absolute visual
  bounds.
- Allow scripts to read and write connection routes using both raw Archi
  bendpoints and layout-engine-friendly absolute route points.
- Allow layout engines to apply many node and connection changes in one
  transaction.
- Keep ELK possible without adding ELK as a dependency in this API slice.

## Non-Goals

- Do not implement ELK in this slice.
- Do not expose raw Zustand state as the preferred scripting contract.
- Do not add a new model persistence format.
- Do not change how bounds or bendpoints are serialized to `.archimate`.
- Do not replace existing simple setters such as `visual.bounds = ...`.

## Approach Options

### Option 1: Minimal ELK Unlock

Expose only active view lookup, view nodes/connections, connection bendpoints,
and a bulk layout method. This is small and fast, but it would produce an API
that feels tailored to one layout engine rather than useful to broader diagram
automation extensions.

### Option 2: General Diagram Automation API

Expose active view, selection, view traversal, visual hierarchy, absolute
bounds, connection route helpers, and a bulk layout method. This is the
recommended option because it unlocks ELK while also supporting common diagram
automation features.

### Option 3: ELK Extension End-to-End

Add only the APIs needed by a concrete packaged ELK extension and implement the
extension immediately. This proves the full workflow but couples API design to
the first extension implementation and risks exposing awkward escape hatches.

## Public API Shape

### `app.views`

```ts
app.views.active(): JView | null;
app.views.open(id: string): JView | null;
app.views.get(id: string): JView | null;
app.views.all(): JView[];
```

Semantics:

- `active()` returns the current UI active view, or `null` when no view is
  active.
- `open(id)` opens or focuses a view in the dock and returns its `JView`
  wrapper, or `null` when the ID is not a view.
- `get(id)` returns a `JView` wrapper without changing UI state.
- `all()` returns all model views in stable model order.

### `app.selection`

```ts
app.selection.ids(): string[];
app.selection.items(): JObject[];
app.selection.visuals(): JVisual[];
app.selection.clear(): void;
```

Semantics:

- `ids()` returns selected IDs from the app selection store.
- `items()` resolves selected IDs through existing wrapper resolution and drops
  IDs that no longer exist.
- `visuals()` returns only selected diagram visuals.
- `clear()` clears the current app selection through the store, not by mutating
  raw state.

### `JView`

```ts
view.nodes(options?: { recursive?: boolean }): JVisual[];
view.connections(): JConnection[];
view.bounds(options?: { recursive?: boolean }): JBounds | null;
view.layout(layout: {
  nodes?: Record<string, Partial<JBounds>>;
  connections?: Record<string, {
    route?: JPoint[];
    bendpoints?: JBendpoint[];
  }>;
  fitContent?: boolean;
}): void;
```

Semantics:

- `nodes({ recursive: false })` returns only top-level child visuals.
- `nodes({ recursive: true })` returns top-level and nested visuals.
- `connections()` returns connections owned by the view.
- `bounds()` returns the union of node absolute bounds, or `null` for an empty
  view.
- `layout(...)` applies a batch of node bounds and connection route changes in
  one transaction named `Layout View`.

### `JVisual`

```ts
visual.parent(): JView | JVisual;
visual.children(): JVisual[];
visual.absoluteBounds(): JBounds;
visual.connections(options?: { incoming?: boolean; outgoing?: boolean }): JConnection[];
```

Semantics:

- `bounds` remains parent-relative, matching existing behavior and persisted
  model state.
- `absoluteBounds()` resolves parent nesting into view-space coordinates.
- `parent()` returns the containing `JView` for top-level visuals or the parent
  `JVisual` for nested visuals.
- `children()` returns immediate nested visuals.
- `connections()` returns incoming/outgoing connections attached to the visual.

### `JConnection`

```ts
connection.bendpoints: JBendpoint[];
connection.absoluteRoute(): JPoint[];
connection.setAbsoluteRoute(points: JPoint[]): void;
connection.source: JVisual;
connection.target: JVisual;
connection.concept?: JConcept;
```

Types:

```ts
interface JBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface JPoint {
  x: number;
  y: number;
}

interface JBendpoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
```

Semantics:

- `bendpoints` exposes the raw Archi/GEF-style offset shape for fidelity.
- `absoluteRoute()` returns absolute view-space intermediate route points.
- `setAbsoluteRoute(points)` accepts absolute view-space intermediate route
  points and converts them to stored Archi/GEF bendpoints.
- Empty absolute route clears manual routing.
- Source and target anchor points are not included in `absoluteRoute()`.

## Coordinate And Route Semantics

Stored node bounds stay parent-relative. This preserves current model semantics
and group/nesting behavior.

Bulk layout APIs accept absolute view coordinates. Internally, the API converts
absolute coordinates back to parent-relative bounds before writing the model.
This lets layout engines operate in a single coordinate space while preserving
the existing model representation.

Raw bendpoints stay in the current Archi/GEF format:

- `startX`, `startY`: offset from the source anchor.
- `endX`, `endY`: offset from the target anchor.

Absolute route helpers are the layout-friendly layer. They should convert
between absolute intermediate route points and raw bendpoint offsets using the
same connection geometry assumptions already used by canvas rendering and XML
round trips.

## Transactions And Validation

`view.layout(...)` should run in one model transaction. It should create one
undo entry, mark the model dirty, and refresh the UI like a normal canvas edit.

Validation rules:

- Reject node IDs that are not visuals in the target view.
- Reject connection IDs that are not connections in the target view.
- Reject non-finite coordinates or dimensions.
- Preserve omitted width/height from current node bounds.
- Enforce the existing minimum useful node dimensions.
- Reject malformed bendpoint objects.
- Reject malformed absolute route points.
- Empty `route: []` clears connection bendpoints.
- If both `route` and `bendpoints` are supplied for one connection, reject the
  update as ambiguous.

The API should prefer clear errors over silent partial layout. Layout engines
should not appear to succeed after applying only part of a graph.

## Implementation Notes

Likely files:

- `src/extensions/app-api.ts`: add `app.views` and `app.selection`.
- `src/scripting/jarchi/wrappers.ts`: add view traversal, visual hierarchy,
  absolute bounds, connection bendpoint and route helpers, and bulk layout.
- `src/scripting/jarchi-dts.ts`: add declarations.
- `src/model/ops/style.ts`: reuse existing `setConnectionBendpoints`.
- `src/model/ops/movement.ts` or a new focused operation: add a bulk diagram
  layout operation that updates many node bounds and connection bendpoints in
  one transaction.

The implementation should avoid a large `app-api.ts` expansion by keeping model
and geometry logic in scripting/model helpers, with `app-api.ts` only adapting
store state to wrappers.

## Testing Strategy

### jArchi Wrapper Tests

- `view.nodes()` returns top-level nodes.
- `view.nodes({ recursive: true })` includes nested nodes.
- `view.connections()` returns view connections.
- `visual.parent()`, `visual.children()`, and `visual.absoluteBounds()` work
  for nested groups.
- `connection.bendpoints` get/set preserves raw Archi bendpoints.

### Layout Helper Tests

- `view.layout(...)` applies multiple node bounds in one call.
- Absolute bounds are converted to parent-relative bounds for nested visuals.
- Invalid node IDs and connection IDs are rejected.
- Empty absolute route clears bendpoints.
- Absolute route points round-trip through `setAbsoluteRoute()` and
  `absoluteRoute()`.

### Extension API Tests

- `app.views.active()`, `app.views.get(id)`, and `app.views.all()` return
  wrapped views.
- `app.selection.items()` and `app.selection.visuals()` return wrapped selected
  objects.
- A package extension can call `app.views.active().layout(...)` from a command.

## Open Design Choices For Implementation

- Whether `app.views.all()` should sort by folder order or object insertion
  order. The first implementation should use the current model's stable order
  and document it.
- Whether `fitContent` in `view.layout(...)` should be implemented in the first
  slice. It is useful, but not required for ELK; it can be omitted from the
  first implementation if it complicates the operation.
- Whether minimum node dimensions should use current app settings or fixed model
  safety limits. The first implementation should reuse existing app settings if
  available at the operation boundary.

## Self-Review

- Placeholder scan: no placeholder sections or deferred undefined behavior.
- Internal consistency: public wrappers expose stable objects and DTOs, while
  mutations route through existing model operations.
- Scope check: this is one coherent API slice and does not include ELK itself.
- Ambiguity check: coordinate systems distinguish parent-relative stored bounds
  from absolute layout inputs and route points.
