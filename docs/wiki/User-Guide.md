# User Guide

## App Shell

The app uses an IDE-style dock layout. Views open as center tabs, while tool
panels can be moved, split, closed, floated, or restored.

Core panels:

- **Models** - model tree, folders, views, elements, and relationships.
- **Palette** - ArchiMate element and relationship tools.
- **Properties** - selected item details, properties, and appearance.
- **Settings** - browser-local editing preferences.
- **Extensions** - local source extensions and imported packages.
- **Scripting** - jArchi-style script library and editor.

Use the toolbar **Views** menu to reopen panels or reset the layout.

## Toolbar

The toolbar contains:

- **New** - create a new unsaved model.
- **Open...** - open a `.archimate` file.
- **Save** - save through a file handle or download fallback.
- **Save As...** - choose a new save target.
- **Undo** and **Redo** - model transactions.
- **Extensions** - extension menu items and commands not already shown in an
  extension menu.
- **Views** - show or reopen dock panels.
- **?** - keyboard shortcut reference.

The file status area shows the current model name, file name, and dirty marker.

## Model Tree

The **Models** tree contains folders, elements, relationships, and views.

Common actions:

- Open a view from the context menu or by activation.
- Rename with F2 or inline editing.
- Delete selected model items from the model.
- Drag model concepts onto a view.
- Use extension-provided context menu actions when installed.

Deleting from the model removes the selected concept and cascades affected view
objects and relationships through the normal model operations.

## Canvas Editing

The SVG view editor supports:

- selection and marquee selection
- drag movement
- resize handles
- nesting inside groups or other containers
- grid snapping
- copy and paste
- direct edit rename
- note, group, and view-reference objects
- relationship creation
- magic connector relationship selection
- manual bendpoints
- zoom and pan

Manual bendpoints are created by dragging a connection. Double-click a bendpoint
to remove it.

## Settings

Settings are app-global for the current browser/profile. They are stored outside
the model and never written to `.archimate` files.

Settings currently cover:

- canvas snapping and grid size
- default text alignment and text position for new objects
- default dimensions for elements, junctions, notes, groups, and view references
- drop and paste offsets
- resize minimums and drag thresholds
- viewport zoom limits and fit padding

Changing a setting affects future editing behavior. Existing model objects keep
their stored bounds and style.

## Properties

The **Properties** panel follows the current tree or view selection.

It can edit:

- name and documentation
- key-value properties
- fill, line, and font colors
- opacity
- text alignment and text position

Properties are model data when they belong to model items or diagram objects, so
changes create normal undo entries and mark the model dirty.

## Files And Autosave

`.archimate` files are the durable model exchange format. Autosave protects work
inside the current browser/profile but is not a substitute for saving a model
file.

The save flow tries native browser file handles first. If browser or
organization policy blocks that path, the app saves by download fallback.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` / `Ctrl+O` | Save / open model |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste diagram objects |
| `Ctrl+A` | Select all on the active view |
| `Delete` | Delete from view or model tree |
| `F2` or double-click | Rename |
| Arrow keys | Nudge selection by 1px |
| Shift+arrow | Nudge selection by grid step |
| `Ctrl+wheel`, `Ctrl+=`, `Ctrl+-` | Zoom canvas |
| `Ctrl+0` | Zoom to 100 percent |
| `Home` | Fit diagram to window |
| Middle-drag or Space+drag | Pan canvas |
| Wheel / Shift+wheel | Scroll canvas |
| Alt while dragging | Disable grid snap |
| `Escape` | Cancel tool or clear selection |
| `Ctrl+Enter` in editor | Run script |
| Double-click bendpoint | Remove bendpoint |

## Scripts And Extensions

Use **Scripting** for one-off or saved jArchi-style model automation. Use
**Extensions** for browser/profile-local features that contribute commands,
menus, toolbar buttons, dock panels, and event handlers.

Related pages:

- [[Scripting API|Scripting-API]]
- [[Extension API|Extension-API]]
- [[Extension Packages|Extension-Packages]]
