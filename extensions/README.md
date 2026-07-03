# Example Extensions

This directory contains source packages for local browser/profile extensions.
Each package folder is importable through the app after it is built into a
`.archi-ext` archive.

Build all example archives:

```bash
node extensions/build-archives.mjs
```

The generated archives are written to `extensions/dist/`:

- `local.model-audit-dashboard-0.1.0.archi-ext`
- `local.selection-workbench-0.1.0.archi-ext`
- `local.package-showcase-0.1.0.archi-ext`
- `local.event-log-console-0.1.0.archi-ext`

Use the app's Extensions panel to import the generated archive files.

## Packages

- `model-audit-dashboard`: commands, toolbar, menu, panel, packaged audit rules,
  and private storage.
- `selection-workbench`: selection and context-menu commands, event handling,
  storage-backed selection history, and a panel.
- `package-showcase`: manifest, package metadata, bundled README, JSON data, and
  SVG asset access.
- `event-log-console`: app/model/view/context-menu event listeners, a panel, and
  clear/open commands.
