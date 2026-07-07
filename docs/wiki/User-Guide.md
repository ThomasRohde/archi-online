# User Guide

A tour of the whole application: the workspace, every panel, the canvas, the
settings, and the keyboard shortcuts.

## The workspace

Archi Online uses an IDE-style docking layout (dockview). Views open as tabs
in the center editor area; tool panels dock around them.

![The IDE-style workspace: model tree, palette, canvas, settings, and properties](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/workspace.png)

You can:

- drag tabs to split the editor area and put views side-by-side,
- move, close, or float any panel,
- maximize a group and restore it,
- reopen closed panels from the toolbar **Views ▾** menu,
- reset everything with **Views ▾ → Reset Layout**.

The layout persists across sessions in the current browser profile.

Core panels:

- **Models** — the model tree: folders, elements, relationships, and views.
- **Palette** — element and relationship tools for the active view.
- **Properties** — details and appearance of the current selection.
- **Settings** — browser-local editing preferences.
- **Scripting** — the jArchi-style script library, editor, and console.
- **Extensions** — manage local extensions and `.archi-ext` packages.

Extensions can contribute additional dockable panels; they appear in the
**Views ▾** menu like the built-in ones.

## Toolbar

| Control | What it does |
| --- | --- |
| **New** | Create a new unsaved model (asks before discarding unsaved changes). |
| **Open…** | Open a `.archimate` model or import an ArchiMate Open Exchange `.xml` file (`Ctrl+O`). |
| **Save** / **Save As…** | Save native `.archimate` XML through a file handle or download fallback (`Ctrl+S`). |
| **Import/Export ▾** | View image export (PNG/SVG/clipboard), ArchiMate Open Exchange import/export, and CSV import/export. See [[Import & Export|Import-and-Export]]. |
| **Present** | Full-screen, chrome-free walkthrough of the model's views (arrow keys to step, `Esc` to exit). |
| **Undo** / **Redo** | Step through model transactions; the tooltip names the operation. |
| *status area* | Model name, file name (or *unsaved*), and a `•` dirty marker. |
| *extension buttons* | Toolbar buttons contributed by extensions. |
| **Extensions ▾** | Extension menu items, plus registered extension commands that don't already appear in an extension menu. |
| **Views ▾** | Reopen panels (open ones are check-marked) and reset the layout. |
| **?** | Keyboard shortcut reference. |

## Models tree

The **Models** panel shows the model: folders, elements, relationships, and
views.

- **Search / filter** — the box at the top of the panel filters the tree by
  name as you type; the dropdown narrows to a category (elements,
  relationships, views, folders) or a specific concept type. Matches are
  shown with their ancestor folders. `Ctrl+F` focuses the box (from inside
  the tree); `Esc` clears it.
- **Open a view** — double-click it, or right-click → **Open View**.
- **Create content** — right-click a folder: **New Element** offers the
  element types belonging to that folder's layer, **New ArchiMate View**
  appears under the Views folder, and **New Folder** creates a subfolder.
- **Rename** — `F2` or the context menu; the model root can be renamed too.
- **Delete** — removes the selected items from the model. Deleting a concept
  also removes its visual objects from all views and cascades any
  relationships that depended on it, as one undo step. Multi-select works
  (`Delete 3 items`).
- **Drag onto a view** — drop elements or relationships from the tree onto an
  open view to add them to the diagram. Dropping a *view* onto another view
  creates a view reference.

Extensions can add items to the tree's context menu.

## Palette

From top to bottom:

- **Select / move** — the default tool (`Escape` returns to it).
- **Magic connector** — draw a connection first, then pick from the
  relationship types that ArchiMate allows between the two endpoints.
- **Relationship tools** — one per ArchiMate relationship type.
- **Note** and **Group** — plain annotation objects.
- **Element types** — grouped by layer: Strategy, Business, Application,
  Technology, Physical, Motivation, Implementation & Migration, and Other
  (including Junction).

Drag an element type onto the canvas to create a new element, or click a
relationship tool and drag between two diagram objects. While drawing a
relationship, invalid targets are rejected based on the official ArchiMate
allowed-relationship matrix.

![The magic connector offering only the relationships ArchiMate allows between two elements](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/palette-validity.png)

## Canvas editing

![The Archisurance Layered View on the SVG canvas](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/canvas.png)

The view editor is a custom SVG canvas. It supports:

- **Selection** — click, `Ctrl`-click to add or toggle, marquee-drag over
  empty space (hold `Ctrl` to add to the current selection), `Ctrl+A` for all.
- **Move and resize** — drag objects or their resize handles. Grid snapping
  applies by default; hold `Alt` to bypass it for one drag. Arrow keys nudge
  the selection by 1 px, `Shift`+arrows by one grid step.
- **Nesting** — drop an element inside a group or another element to nest it;
  child bounds stay relative to the parent.
- **Copy / paste** — `Ctrl+C` / `Ctrl+V` for diagram objects.
- **Direct edit** — `F2` or double-click to rename in place.
- **Notes, groups, view references** — notes and groups come from the
  palette; view references are created by dragging a view from the tree.
- **Bendpoints** — drag anywhere on a connection to add a manual bendpoint;
  double-click a bendpoint to remove it.
- **Zoom** — `Ctrl+wheel`, `Ctrl+=` / `Ctrl+-`, `Ctrl+0` for 100%, `Home` to
  fit the diagram to the window. Zoom is per view.
- **Pan / scroll** — middle-drag or `Space`+drag to pan; wheel and
  `Shift`+wheel to scroll.

Deleting on the canvas removes objects *from the view* only; the underlying
concepts stay in the model. Delete from the Models tree to remove a concept
from the model itself.

## Properties panel

![The Properties panel Appearance tab: fill and line colour, opacity, text alignment, and figure](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/properties.png)

The **Properties** panel follows the current selection in the tree or on the
canvas. Depending on what is selected it edits:

- **Name** and **Documentation**.
- **Properties** — the ArchiMate key-value property list.
- **Appearance** (diagram objects) — fill color, line color, font color,
  opacity, text alignment, and text position.
- **Figure** (elements with two notations) — switch between the default
  box-with-icon figure and the classic ArchiMate shape.
- **Relationship specifics** — access type (access relationships), influence
  strength (influence relationships, e.g. `++`), and directed (association
  relationships).
- **Junction type** — AND / OR.
- **Viewpoint** (views) — the view's declared viewpoint.

All of these are model data: edits create normal undo steps and mark the
model dirty. Selecting multiple objects shows the selection count; appearance
edits apply to the whole selection where they make sense.

## Validator

The **Validator** checks the whole model against a set of rules ported from
desktop Archi's model validator. It is an opt-in panel — open it from
**Views ▾ → Validator** (it docks with the Scripting panel).

![The Validator panel listing issues grouped by severity after checking the Archisurance model](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/validator.png)

Click **Validate** to run the checks over the current model — validation is on
demand, not live, so re-click after making changes. Results are summarised as
*N errors, N warnings, N advice* and listed in three groups:

- **Errors** (⛔) — illegal relationships (a relationship type the ArchiMate
  matrix does not allow between its two ends) and junctions whose relationships
  are not all the same type.
- **Warnings** (⚠️) — elements or relationships not used in any view, possible
  duplicates (same name and type), and concepts on a view whose viewpoint does
  not allow them.
- **Advice** (ℹ️) — empty views, and elements visually nested inside another
  element without a nesting-type relationship between them.

Click any issue to jump to it: view issues open the view and select the
diagram object, while element and relationship issues select the concept in
the Models tree so the Properties panel follows. The panel is read-only and
works in the shared read-only viewer.

## Settings

**Settings** are app-wide preferences for the current browser profile. They
are stored in IndexedDB, never in `.archimate` files, and changing them
affects *future* edits only — existing objects keep their stored bounds and
style. Each row has a reset button, and **Reset all** restores the defaults.

| Section | Settings (defaults) |
| --- | --- |
| Canvas snapping | Snap to grid (on); grid size (12 px) — also the `Shift`+arrow nudge step. |
| New object defaults | Text align (center) and text position (center) for new objects; default sizes for elements (120×55), junctions (15), notes (185×80), groups (400×140), and view references (200×140). |
| Canvas interaction | Drop offset (16 px), paste offset (16 px), minimum node size (20 px), move drag threshold (4 px), bendpoint drag threshold (5 px). |
| Viewport | Zoom limits (0.1–4), wheel zoom factor (1.1), button zoom factor (1.2), fit-to-window maximum zoom (1.5) and padding (24 px). |

Values are validated and clamped to sensible ranges when loaded or edited.

## Files and autosave

`.archimate` files are the durable, portable format — the same XML desktop
Archi uses. **Open…** also accepts ArchiMate Open Exchange `.xml` files; they
are imported as new, unsaved models, so the next save writes a native
`.archimate` file rather than overwriting the interchange source.

Saving prefers a native browser file handle (write-in-place) and falls back
to a download when the browser or organization policy blocks file handles.
See [[Getting Started|Getting-Started]] for the storage overview and
[[Archi Compatibility|Archi-Compatibility]] for exchange details.

Autosave writes the open model to IndexedDB shortly after every change and
restores it on the next launch, including the dirty flag and file name. It
protects against crashes and accidental tab closes within the same browser
profile — it is not a backup.

## Installed app and offline use

Production builds are installable as a PWA in supporting browsers. The
service worker precaches the editor shell, build assets, examples, icons, and
manifest, so the installed app can launch offline after it has loaded once.
Model files, autosave, settings, scripts, extensions, and layout still stay
local to the current browser profile or file system.

When the browser and operating system support them, the installed app exposes
app shortcuts for **New model** and **Open model file**, a `.archimate` file
handler, and a share target for `.archimate` or XML model files. Launched or
shared files still pass through the same unsaved-change prompt before they
replace the open model.

## Keyboard shortcuts

Open this table anytime with the **?** toolbar button.

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` / `Ctrl+O` | Save / open model |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste diagram objects |
| `Ctrl+A` | Select all on the active view |
| `Delete` | Delete from view (canvas) or from model (tree) |
| `F2` or double-click | Rename |
| Arrow keys | Nudge selection by 1 px |
| `Shift`+arrows | Nudge selection by one grid step |
| `Ctrl+wheel`, `Ctrl+=`, `Ctrl+-` | Zoom canvas (per view) |
| `Ctrl+0` | Zoom to 100% |
| `Home` | Fit diagram to window |
| Middle-drag or `Space`+drag | Pan canvas |
| Wheel / `Shift`+wheel | Scroll canvas |
| `Alt` while dragging | Disable grid snap |
| `Escape` | Cancel tool / clear selection |
| `Ctrl+Enter` (script editor) | Run script |
| Double-click bendpoint | Remove bendpoint |
| `Ctrl+F` (model tree) | Focus the model-tree filter |
| `←` / `→`, `PgUp` / `PgDn`, `Space` (presentation) | Previous / next view |
| `Home` / `End` (presentation) | First / last view |

On macOS, `Cmd` works in place of `Ctrl` for save/open/undo/redo.

## Scripts and extensions

- The **Scripting** panel runs jArchi-style JavaScript against the open
  model — one script run is one undo step. See [[Scripting API|Scripting-API]].
- The **Extensions** panel manages browser-local extensions that add
  commands, menus, toolbar buttons, panels, and event handlers. See
  [[Extension API|Extension-API]] and [[Extension Packages|Extension-Packages]].
