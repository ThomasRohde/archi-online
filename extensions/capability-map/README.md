# Capability Map Extension

Capability Map is an official Archi Online extension with the stable package ID
`archi-online.capability-map`.

It builds capability-map views as packed nested rectangles from Composition and
Aggregation hierarchies. The extension can:

- generate a map from selected model-tree roots;
- repack selected containers or a whole capability-map view;
- synchronize a generated view with the current model hierarchy;
- color capabilities from a numeric property and add a heat-map legend.

The settings panel controls layout mode, sibling ordering, depth, sizing,
padding, frontier versus legacy grid packing, fixed versus text-aware leaves,
treemap weights, heat-map properties, and level fills. Preferences are
stored in this extension's private browser storage.

The extension contributes an Extensions menu item, model-tree/view/selection
context-menu items, and a dockable panel.
