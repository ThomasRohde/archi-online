# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-10

First stable release.

### Added

- Outline (minimap) panel with viewport indicator and click/drag navigation
- `ARCHITECTURE.md` — the project's architectural principles, promoted to the
  repository root
- `CHANGELOG.md` (this file)

### Changed

- Documentation site feature cards use icons instead of emojis

### Removed

- Internal planning artifacts (design docs, implementation plans, brainstorms)
  are no longer tracked in the repository

## [0.3.0] - 2026-07-07

### Added

- Model Validator panel, porting desktop Archi's validation checks
- Documentation site published to GitHub Pages
  (<https://thomasrohde.github.io/archi-online/>) and a **Docs** button in the
  app toolbar

## [0.2.0] - 2026-07-07

First public release: a browser-only ArchiMate 3.2 modeler with no backend.

### Added

- ArchiMate 3.2 metamodel with the official allowed-relationship matrix
  (generated from Archi's `relationships.xml`)
- Custom SVG view editor: figures with Archi-faithful icons, drag/resize/
  nesting, grid snap, marquee selection, copy/paste, bendpoints, magic
  connector, zoom/pan, direct edit
- IDE-style docking layout (dockview) with layout persistence
- Model tree with folders, drag-drop, search, and context menus
- Properties panel (name/documentation, key-value properties, appearance)
- Lossless `.archimate` file round-trip, File System Access save/open,
  IndexedDB autosave
- jArchi-compatible scripting with Monaco editor and API IntelliSense
- Script extension system with importable/exportable extension packages,
  including an ELK auto-layout extension
- Diagram automation scripting API
- Import/export: ArchiMate Open Exchange format, Archi-format CSV, PNG/SVG
  image export with clipboard copy
- Model sharing via gist links and a read-only viewer mode
- Full PWA support: offline precache, install, file handling, share target
- Presentation mode, C4 visual mode, viewpoint enforcement with picker
- Analysis tab and Navigator panel, alignment/match-size tools, duplicate
- App chrome redesign (icon toolbar, status bar) and versioning regime for
  app and shipped extensions

[1.0.0]: https://github.com/ThomasRohde/archi-online/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/ThomasRohde/archi-online/releases/tag/v0.2.0
