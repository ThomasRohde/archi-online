# ELK Layout Extension

Applies the bundled `app.layout.elk(...)` host API to the active view. By
default it lays out selected root objects when two or more visuals are selected,
otherwise it falls back to the whole active view.

The panel stores its layout preferences in this extension's private browser
storage:

- Scope: selection-first, selection-only, or whole view
- Direction: right, down, left, or up
- Edge routing: orthogonal, splines, or preserve existing bends
- Node and layer spacing

The extension contributes an Extensions menu item, active-view context menu item,
selection context menu item, and a dockable panel.
