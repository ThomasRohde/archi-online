# Bundled Extensions

This directory contains source packages for local browser/profile extensions.
Each package folder is importable through the app after it is built into a
`.archi-ext` archive.

Build all archives:

```bash
node extensions/build-archives.mjs
```

The generated archives are written to `extensions/dist/`:

- `archi-online.capability-map-<version>.archi-ext`
- `archi-online.elk-layout-<version>.archi-ext`
- `examples.model-audit-dashboard-<version>.archi-ext`
- `examples.selection-workbench-<version>.archi-ext`
- `examples.package-showcase-<version>.archi-ext`
- `examples.event-log-console-<version>.archi-ext`

Use the app's Extensions panel to import the generated archive files.

## Packages

- `capability-map` (official): packed capability-map generation, repacking,
  synchronization, heat maps, context-menu commands, and a settings panel.
- `elk-layout` (official): app-hosted ELK layout API usage, menu commands, a
  settings panel, packaged JSON defaults, and private storage.
- `model-audit-dashboard`: commands, toolbar, menu, panel, packaged audit rules,
  and private storage.
- `selection-workbench`: selection and context-menu commands, event handling,
  storage-backed selection history, and a panel.
- `package-showcase`: manifest, package metadata, bundled README, JSON data, and
  SVG asset access.
- `event-log-console`: app/model/view/context-menu event listeners, a panel, and
  clear/open commands.

The four packages with `examples.*` IDs are developer examples. The two
`archi-online.*` packages are official end-user extensions.

## Documentation downloads

Stage the official packages at their stable GitHub Pages paths while building
the docs:

```bash
npm run docs:build
```

This writes `elk-layout.archi-ext`, `capability-map.archi-ext`, `catalog.json`,
and `checksums.txt` under the generated documentation site.
