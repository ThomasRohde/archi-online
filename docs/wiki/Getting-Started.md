# Getting Started

This page takes you from a fresh checkout to a saved `.archimate` model.

## What you need

- **Node.js 22+** and npm to run the app locally.
- A modern browser. Chromium-family browsers (Chrome, Edge) are recommended:
  they support the File System Access API, which lets **Save** write straight
  back to the file you opened. Other browsers work too — saving falls back to
  a normal file download.

## Run the app

```bash
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

To build and serve the production static site instead:

```bash
npm run build     # typecheck + build into dist/
npm run preview   # serve the built site locally
```

The build output in `dist/` is a fully static site — you can host it on any
static file server.

## Your first model

1. Click **New** in the toolbar. A new model appears in the **Models** tree
   with the standard ArchiMate top-level folders (Strategy, Business,
   Application, Technology & Physical, Motivation, Implementation & Migration,
   Other, Relations, Views).
2. Right-click the **Views** folder and choose **New ArchiMate View**, or use
   the welcome screen's shortcut. Double-click a view in the tree to open it
   as an editor tab.
3. Drag elements from the **Palette** onto the canvas. The palette groups
   element types by ArchiMate layer, with notes, groups, and relationship
   tools at the top.
4. Draw a relationship: pick a relationship tool, then drag from one element
   to another. The canvas gives live feedback — targets that the ArchiMate
   metamodel forbids are rejected. If you're not sure which relationship to
   use, pick the **magic connector**: draw the connection first and choose
   from the list of valid relationship types afterwards.
5. Select any object and edit its name, documentation, key-value properties,
   and appearance in the **Properties** panel.
6. Press `Ctrl+S` (or click **Save**) and choose where to store the
   `.archimate` file.

That file opens directly in desktop Archi — see
[[Archi Compatibility|Archi-Compatibility]].

## Opening and saving files

- **Open…** (`Ctrl+O`) loads an existing `.archimate` file, including models
  created with desktop Archi.
- **Save** (`Ctrl+S`) writes back to the file you opened when the browser
  supports the File System Access API. Otherwise — or when browser policy
  blocks file handles — the app saves via a regular download.
- **Save As…** always lets you pick a new target.

The status area on the toolbar shows the model name, the file name (or
*unsaved*), and a `•` marker when there are unsaved changes. Closing the tab
with unsaved changes triggers a browser confirmation prompt.

## Where your work lives

Two different kinds of storage are involved:

| Data | Where it lives |
| --- | --- |
| The model itself | `.archimate` files you open and save |
| Autosave snapshot of the open model | Browser IndexedDB |
| Window/panel layout | Browser IndexedDB |
| App settings | Browser IndexedDB |
| Script library | Browser IndexedDB |
| Extensions and imported `.archi-ext` packages | Browser IndexedDB |
| Private extension storage | Browser IndexedDB |

The app autosaves the open model shortly after every change and restores it
the next time you open the app in the same browser profile. Autosave is a
crash safety net, not a substitute for saving: browser data can be cleared by
the browser or the user, and it never leaves the machine. Export anything you
care about as a `.archimate` file.

Browser-local data (settings, scripts, extensions, layout) is never written
into `.archimate` files.

## Next steps

- [[User Guide|User-Guide]] — every panel, tool, setting, and shortcut.
- [[Scripting API|Scripting-API]] — automate the model from the **Scripting**
  panel.
- [[Extension Packages|Extension-Packages]] — try the bundled example
  extensions, including ELK automatic layout.
