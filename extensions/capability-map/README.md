# Capability Map Extension

Capability Map is an official Archi Online extension with the stable package ID
`archi-online.capability-map`.

It builds capability-map views as packed nested rectangles from Composition and
Aggregation hierarchies. The extension can:

- generate a map from selected model-tree roots;
- repack selected containers or a whole capability-map view;
- synchronize a generated view with the current model hierarchy;
- color capabilities from a numeric property and add a heat-map legend.

The default frontier layout is text-aware and stability-sensitive. It keeps a
bounded choice of wide, square, and tall subtree forms until the surrounding
parent or complete forest can choose among them, so a frame target does not
force every nested capability into the same shape. Sibling semantic order is
preserved during repack and sync.

Generate creates a fresh composition. Sync preserves compatible root anchors,
neighbourhoods, bands, and broad regions while adding, removing, or reparenting
capabilities. The explicit **Repack capability map** command is intentionally
different: it is free to move roots to produce a new complete-forest
composition. Repacking a selection isolates each owning container's
parent-relative coordinate space.

The settings panel controls layout mode, sibling ordering, depth, sizing,
padding, frontier versus legacy grid packing, fixed versus text-aware leaves,
treemap weights, heat-map properties, and level fills. Preferences are
stored in this extension's private browser storage.
Existing stored values remain valid. **Balanced rows (legacy)** remains
available as the predictable fallback; fixed-column scripting requests retain
their exact meaning, and weighted treemap mode is unchanged.

The extension contributes an Extensions menu item, model-tree/view/selection
context-menu items, and a dockable panel.
