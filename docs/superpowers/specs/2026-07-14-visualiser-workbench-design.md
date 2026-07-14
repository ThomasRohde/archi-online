# Visualiser Workbench Design

**Date:** 2026-07-14
**Status:** Approved
**Scope:** Upgrade the existing read-only Visualiser into a polished, label-aware graph workbench without replacing ELK, the SVG renderer, or the existing analysis model.

## Summary

The Visualiser will gain a dedicated interactive viewport, native context menus, keyboard navigation, label-aware ELK routing, distributed connection endpoints, and a deliberate visual language for relationship names. The selected visual direction is **Route placards**: compact white label plates with a quiet border, set into clearly separated orthogonal routes.

The implementation must keep the live SVG and all export formats on one geometry path. Zoom and pan affect only the live viewport; node sizes, routes, label wrapping, label positions, and export bounds come from one shared presentation model.

## Goals

- Make large Visualiser graphs comfortable to navigate with mouse, trackpad, keyboard, and context menus.
- Prevent relationship names from colliding with nodes, other labels, and nearby routes in dense graphs.
- Improve routing around high-degree concepts by giving incident edges distinct attachment points.
- Make node and relationship typography legible and visually disciplined at the normal fitted scale.
- Preserve exact geometry parity between the live graph, SVG export, PNG export, and Copy PNG.
- Keep relationship names off by default and preserve all existing Visualiser filtering, history, pinning, selection, and focus behavior.
- Add no graph-framework or rendering dependency.

## Non-goals

- The Visualiser remains read-only; it does not become a second model editor.
- Users cannot manually drag nodes or bend routes.
- The work does not replace the existing View Editor viewport or change its gesture contract.
- The work does not add a minimap, overview panel, layout-style selector, or persisted Visualiser viewport.
- Relationship names are not synthesized. Only non-blank stored names are displayed.

## Architecture

The feature is divided into three focused units.

### 1. Graph presentation model

A pure Visualiser presentation module owns:

- Node label text, wrapping, font metrics, and node size.
- Relationship label text, wrapping, plate dimensions, and label identifiers.
- ELK request construction, including optional edge labels and per-edge ports.
- Render-ready edge paths and label bounds, including safe fallback label positions.
- Graph content bounds used by fit-to-view and export.

The presentation module is UI-independent and deterministic. Tests can validate its measurements and output without mounting React.

### 2. Label-aware ELK bridge

The generic ELK graph types are extended to support:

```ts
interface ElkGraphLabel {
  id: string;
  text: string;
  width: number;
  height: number;
}

interface ElkGraphPort {
  id: string;
  side: 'north' | 'east' | 'south' | 'west';
}
```

Nodes may expose ports, edges may connect to node or port identifiers, and edges may contain labels. Layout results include label bounds in the edge coordinate system:

```ts
interface ElkGraphLabelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

The bridge continues to return normalized root-relative coordinates. ELK documents labels as sized graph shapes and edge-label coordinates as relative to the edge coordinate system; the bridge normalizes those coordinates with the same offset as routed edge sections.

### 3. Interactive viewport

A pure viewport-math module and a small React hook own:

- Zoom clamping and pointer-anchored zoom.
- Center-based viewBox calculation.
- Fit-to-bounds calculation.
- Screen-delta to graph-delta panning.
- Pointer capture and cancellation.
- Canvas measurement through `ResizeObserver`.

The viewport state is `{ centerX, centerY, zoom }`. It changes only the live SVG viewBox and never changes graph geometry or export output.

`VisualiserPanel` remains responsible for analysis preferences, focus history, selection, relayout requests, and export commands. A focused canvas component renders the graph and handles viewport interaction.

## Interaction design

### Zoom and pan

- Plain wheel zooms around the pointer position.
- Zoom is clamped to `0.2` through `4.0`.
- Wheel zoom uses a smooth exponential factor derived from `deltaY`; one conventional wheel notch is approximately a 10% change.
- Zoom buttons use a factor of `1.2`.
- Dragging empty canvas with the primary button pans.
- Middle-button drag pans from anywhere.
- Holding `Space` and primary-button dragging pans from anywhere.
- The cursor is `grab` over pannable canvas and `grabbing` during an active pan.
- Lost pointer capture, pointer cancellation, and `Escape` end the current pan without changing model state.

### Fit and centering

- Fit-to-view uses 32 screen pixels of padding and never zooms above `1.5`.
- The first successful layout is fitted automatically.
- A changed focus graph, changed filters, relationship-label toggle, or explicit relayout fits the new layout automatically.
- A container resize preserves the current graph center and zoom; it does not reset a manually adjusted viewport.
- “Center focused concept” preserves zoom and moves only the viewport center.
- “Center this concept” does the same for the context-menu node.
- Actual size sets zoom to `1.0` and preserves the current center.

### Floating viewport HUD

The bottom-left HUD contains:

- Zoom out (`−`)
- Current percentage, rounded to the nearest whole percent
- Zoom in (`+`)
- Fit

The percentage control has the tooltip “Actual size” and activates zoom `1.0`. Controls are standard buttons with accessible names and visible focus rings.

### Keyboard

When the canvas has focus and the event target is not an editable control:

- `+` or `=` zooms in.
- `-` zooms out.
- `0` fits the graph.
- `1` selects actual size.
- `Escape` cancels an active pan.
- `Shift+F10` opens the same context menu as a right-click at the canvas center or selected node.

### Context menus

The existing application `showContextMenu()` infrastructure is reused.

Empty-canvas menu:

1. Fit to view
2. Center focused concept
3. Separator
4. Actual size
5. Zoom in
6. Zoom out
7. Separator
8. Relayout graph

Node menu:

1. Focus here
2. Select in model
3. Center this concept
4. Separator
5. The viewport commands from the empty-canvas menu

Right-clicking a node does not change focus automatically. “Select in model” performs the same tree selection as a normal node click. “Focus here” performs the same navigation as a node double-click.

## Visual language

### Signature: Route placards

Relationship names are treated as route annotations rather than free-floating text. Each name sits inside an opaque white plate positioned by ELK. The plate interrupts visual noise without becoming a badge or a second node type.

Tokens:

| Role | Value |
| --- | --- |
| Canvas | `#fbfdff` |
| Dot grid | `#d8e1eb` |
| Route | `#617284` |
| Node text | `#202b36` |
| Relationship text | `#43566a` |
| Placard fill | `rgba(255, 255, 255, 0.97)` |
| Placard border | `#d8e0e8` |
| Focus accent | `#1f6feb` |
| HUD/menu border | `#cad5e0` |

Typography uses the application’s existing `Segoe UI, system-ui, sans-serif` stack:

- Normal node label: 12px, weight 600, line-height 14.4px.
- Compact relationship-concept node: 10.5px, weight 600, line-height 12.6px.
- Relationship placard: 10px, weight 600, line-height 12.5px.
- HUD and menu utility text: 11px, weight 600 where emphasis is required.

Node text remains centered. The current ArchiMate fills, subdued node outline, drop shadow, and blue focus outline remain recognizable but are tightened to the new type scale.

Relationship placards use 7px horizontal padding, 4px vertical padding, a 4px corner radius, a 0.8px border, and no drop shadow. The absence of shadow is deliberate: placards belong to route geometry, not the elevation hierarchy.

## Text measurement and wrapping

Node and relationship labels use the same deterministic weighted text measurement helper. It remains stable in tests and export environments that do not expose canvas text metrics.

Node labels wrap within the node’s inner width. Node height expands when required.

Relationship labels:

- Wrap at word boundaries to a maximum text width of 160px.
- Split a single overlong token into deterministic chunks.
- Use one or more `<tspan>` lines centered inside the placard.
- Include padding in the label width and height sent to ELK.
- Use identifier `${edge.id}:label`.

Blank relationship names produce no ELK label and no placard.

## ELK routing profiles

The compact profile remains in use while relationship names are hidden:

| Option | Value |
| --- | ---: |
| Node spacing | 40 |
| Layer spacing | 80 |
| Edge routing | Orthogonal |

The label-aware profile is used while relationship names are shown:

| Option | Value |
| --- | ---: |
| Node spacing | 56 |
| Layer spacing | 112 |
| `elk.spacing.edgeEdge` | 18 |
| `elk.spacing.edgeNode` | 20 |
| `elk.layered.spacing.edgeEdgeBetweenLayers` | 16 |
| `elk.layered.spacing.edgeNodeBetweenLayers` | 20 |
| `elk.spacing.edgeLabel` | 6 |
| `elk.spacing.labelNode` | 12 |
| `elk.edgeLabels.inline` | false |
| `elk.layered.edgeLabels.sideSelection` | `SMART_DOWN` |
| `elk.layered.edgeLabels.centerLabelPlacementStrategy` | `SPACE_EFFICIENT_LAYER` |
| `elk.layered.mergeEdges` | false |

ELK’s layered algorithm supports orthogonal routing, edge-label placement, label-side selection, and label-aware spacing. The chosen profile makes the additional room conditional, so the default label-off graph stays compact.

### Distributed edge endpoints

Each incident edge endpoint receives a dedicated one-pixel ELK port. For a rightward graph:

- Outgoing source ports use the east side.
- Incoming target ports use the west side.
- Feedback endpoints use the side implied by their actual source/target role.

Nodes use fixed-side port constraints and ELK’s justified port alignment so multiple routes spread along the border rather than terminating at one center point. Port identifiers are deterministic from edge ID and endpoint role. The port shapes themselves are not rendered.

## Rendering and export parity

The presentation model produces render-ready labels:

```ts
interface VisualiserEdgeLabel {
  text: string;
  lines: readonly string[];
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
}
```

The label-aware ELK position is authoritative. If a routed edge lacks returned label bounds, the presentation model places the measured placard at the routed half-length and offsets it away from the nearest segment by the normal label spacing. A missing ELK label position therefore degrades gracefully without dropping text.

The live graph and standalone SVG document call the same node, edge, and label geometry helpers. SVG, PNG, and Copy PNG include Route placards but never include the live dot grid, HUD, focus menu, or context menus.

Export bounds include routed edge label rectangles, not only nodes. A placard cannot be clipped when it extends beyond node bounds.

## State and error handling

- Existing layout-request tokens continue to discard stale asynchronous ELK results.
- A relayout failure for the unchanged graph keeps the last successful layout visible and displays a concise warning in the status area.
- A layout failure for a different graph does not display stale nodes from the old graph; it shows the existing empty-state error message.
- Viewport commands are disabled when no valid layout exists.
- A zero-size canvas defers fitting until a non-zero `ResizeObserver` measurement arrives.
- A graph with no nodes uses the existing empty-state behavior and a neutral viewport.
- Viewport operations do not mutate the model, dirty state, undo stack, or persisted analysis preferences.

## Accessibility

- The canvas wrapper is focusable and has an accessible name describing the Visualiser graph.
- HUD controls use buttons and expose complete accessible names.
- Keyboard shortcuts work only while the canvas is focused.
- Context menus reuse the application’s keyboard-accessible menu implementation.
- Focus rings remain visible against the canvas and HUD.
- Panning is not required to reach any command; every gesture has a button or menu equivalent.
- Reduced-motion users receive no animated fit or zoom transitions. Viewport changes are immediate for all users in this version.

## Testing strategy

### Pure unit tests

- Pointer-anchored zoom keeps the graph coordinate under the pointer stable.
- Zoom clamps at 20% and 400%.
- Fit calculation honors padding and the 150% maximum.
- Screen-space pan deltas convert correctly at multiple zoom levels.
- Node and relationship wrapping produce deterministic line arrays and dimensions.
- Label-on requests contain edge labels, per-edge ports, and the label-aware ELK profile.
- Label-off requests contain no edge labels and retain compact spacing.
- Returned ELK label coordinates are normalized and consumed.
- Missing returned label bounds use the routed midpoint fallback.
- Graph/export bounds include relationship placards.

### Component tests

- Wheel zoom updates the viewBox around the event position.
- Primary blank-canvas drag, middle drag, and Space-drag pan.
- Pointer cancellation and lost capture end panning cleanly.
- HUD buttons, percentage/actual-size control, and Fit execute the expected viewport operations.
- `+`, `-`, `0`, `1`, and `Escape` work only while the canvas is focused.
- Empty-canvas and node context menus expose the approved commands.
- Existing click-to-select and double-click-to-focus behavior remains intact.
- A new layout auto-fits; a resize preserves manual viewport state.
- The live SVG and standalone SVG render identical Route placard line content and bounds.

### Integration and visual verification

- Run the full Visualiser test file through a red-green cycle for each behavior group.
- Run the complete test suite, lint, typecheck, and production build.
- Load the Archisurance example, focus “Document Processing SSC,” enable relationship names, and verify:
  - no label overlaps the focused node;
  - parallel relationships have distinct lanes and endpoints;
  - long node labels remain wrapped;
  - wheel zoom remains pointer-centered;
  - Fit restores the complete graph;
  - SVG and PNG exports retain the clean label-aware geometry.

## Acceptance criteria

The feature is complete when:

1. The live Visualiser supports the approved wheel, pan, HUD, keyboard, fit, actual-size, center, and context-menu interactions.
2. Relationship names remain off by default.
3. Enabling relationship names causes labels to participate in ELK layout and activates the label-aware spacing profile.
4. Incident edges use distinct invisible ports and no longer collapse onto one node-border point in dense graphs.
5. Route placards use the approved typography, padding, border, and colors.
6. Node and relationship labels wrap without overflowing their allocated shapes.
7. Live SVG, SVG export, PNG export, and Copy PNG use the same nodes, routes, and label bounds.
8. The dense Archisurance case is visually legible at fit-to-view and remains navigable through all approved inputs.
9. All focused and repository-wide checks pass with no regression to existing Visualiser behavior.

## References

- [ELK graph data structure and labels](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure.html)
- [ELK coordinate system](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html)
- [ELK Layered algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [ELK edge label placement](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeLabels-placement.html)
- [ELK edge label side selection](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-edgeLabels-sideSelection.html)
- [ELK center label placement strategy](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-edgeLabels-centerLabelPlacementStrategy.html)
- [ELK layered spacing options](https://eclipse.dev/elk/reference/groups/org-eclipse-elk-layered-spacing.html)
