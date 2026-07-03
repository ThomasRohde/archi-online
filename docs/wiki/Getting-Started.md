# Getting Started

## Requirements

- Node.js and npm for local development.
- A modern Chromium-family browser is recommended because the app uses browser
  file APIs where available.

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open the URL shown by Vite, usually:

```text
http://localhost:5173
```

Build the production static site:

```bash
npm run build
```

The build output is written to `dist/`.

## Create A Model

1. Click **New** in the toolbar.
2. Add elements from the **Palette** into a view.
3. Create relationships using relationship tools or the magic connector.
4. Save the model with **Save** or **Save As...**.

New models start with the standard ArchiMate top-level folders. Views open as
dockable tabs in the center editor area.

## Open And Save `.archimate` Files

Use **Open...** to load an existing `.archimate` file. Archi Online reads and
writes native ArchiMate exchange XML compatible with desktop Archi.

Saving uses the File System Access API when the browser and organization policy
allow it. If the browser blocks native save handles, the app falls back to a
download-style save flow.

## Browser-Local Data

Archi Online keeps several kinds of data in the current browser profile:

- autosave model state
- dock layout
- app settings
- script library entries
- local source extensions
- imported `.archi-ext` packages
- private extension storage

This data is local to the browser/profile. It is not stored in `.archimate`
files and is not synced by the app.

## Recommended First Tour

1. Create a model.
2. Open a view from the **Models** tree.
3. Drag two elements from **Palette** into the canvas.
4. Connect them with a relationship.
5. Select an object and edit name, documentation, properties, and appearance in
   **Properties**.
6. Open **Settings** and adjust grid size or default object dimensions.
7. Open **Scripting**, run a small script, and undo the script as one step.
8. Open **Extensions** and inspect or import example extension packages.

Related pages:

- [[User Guide|User-Guide]]
- [[Scripting API|Scripting-API]]
- [[Extension Packages|Extension-Packages]]

