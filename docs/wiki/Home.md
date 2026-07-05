# Archi Online

Archi Online is a web-based [ArchiMate®](https://www.opengroup.org/archimate-forum)
modeler — a browser clone of the desktop [Archi](https://www.archimatetool.com/)
tool. It reads and writes native `.archimate` files, imports and exports
ArchiMate Open Exchange and Archi CSV formats, and adds a jArchi-compatible
JavaScript scripting API plus a local extension system on top of the core
modeling workflow.

Everything runs in your browser. There is no backend, no account, and no
server-side storage: models live in `.archimate` files you choose, and the app
autosaves your working state to the browser's IndexedDB so you can pick up
where you left off.

## Highlights

- **Full ArchiMate 3.2 metamodel** — every element and relationship type, with
  Archi's official allowed-relationship matrix enforced live while you draw.
- **IDE-style workspace** — views open as draggable tabs; split editors
  side-by-side, float or maximize groups, and the layout persists across
  sessions.
- **Rich diagram editor** — custom SVG canvas with drag/resize/nesting, grid
  snapping, marquee selection, copy/paste, a *magic connector*, manual
  bendpoints, notes, groups, and view references.
- **Lossless `.archimate` round-trip** — verified against Archi's Archisurance
  example model.
- **Interchange and presentation** — Open Exchange `.xml` and Archi CSV
  import/export, view export to PNG/SVG/clipboard, and full-screen
  presentation mode for walking through views.
- **Fast navigation** — model-tree filtering by name, category, or specific
  concept type, with matches shown in their folder context.
- **jArchi-style scripting** — `$()` selectors, model and view automation, a
  Monaco editor with API IntelliSense, and a script library with `.ajs`
  import/export. Each script run is a single undo step.
- **Extensions** — browser-local plugins that add commands, menus, toolbar
  buttons, dockable panels, and event handlers, including a bundled ELK
  automatic-layout extension. Extensions ship as portable `.archi-ext`
  packages.
- **Installable web app** — production builds are PWA-capable, precache the
  app shell for offline launch after first load, and expose app shortcuts,
  `.archimate` file handling, and a share target in browsers that support
  those web-platform features.

## Where to go next

| If you want to… | Read |
| --- | --- |
| Run the app and build your first model | [[Getting Started\|Getting-Started]] |
| Learn the workspace, canvas, and settings | [[User Guide\|User-Guide]] |
| Import, export, or present models | [[Import & Export\|Import-and-Export]] |
| Exchange models with desktop Archi | [[Archi Compatibility\|Archi-Compatibility]] |
| Automate your model with JavaScript | [[Scripting API\|Scripting-API]] |
| Build an extension | [[Extension API\|Extension-API]] and [[Extension Packages\|Extension-Packages]] |
| Contribute to the project | [[Development]] |

## Privacy and scope

Archi Online is designed for local, trusted use. All data stays in your
browser profile:

- Models are explicit `.archimate` files that you open and save yourself.
- Autosave state, settings, the script library, extensions, and the window
  layout live in the browser's IndexedDB for the current profile only.
- Nothing browser-local is ever written into `.archimate` files, and the app
  never uploads your model anywhere.

Scripts and extensions are user-controlled local code — there is no remote
marketplace and no sandbox. Only run code you trust.
