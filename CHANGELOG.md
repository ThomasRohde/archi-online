# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-07-12

### Fixed

- Image-bearing diagram nodes now reuse their generated data URLs while
  dragging, avoiding repeated multi-megabyte image encoding on every pointer
  update

## [1.3.0] - 2026-07-12

### Added

- Desktop Archi 5.9 specializations across model state, properties, palette,
  model tree, native files, CSV/Open Exchange, and the jArchi-compatible API
- Native XML/ZIP document I/O with deduplicated archive images, browser-safe
  TIFF rendering, image galleries, all Desktop image positions, and byte-based
  autosave, sharing, viewer, launch, and Gist flows
- Archi 5.9 label expressions, gradients, outline styles and widths, icon
  controls, derived line colors, opacity controls, and complete font styling
- Dublin Core metadata, language and organization options, bundled XSD
  validation/copy, structured atomic interchange reports, and current Archi
  CSV edge behavior
- Reciprocal Phase 1 fixtures and an installed Desktop Archi CLI semantic and
  archive-asset verification gate

### Changed

- Browser build output now targets modern JavaScript required by the pinned
  browser-side XML schema validator
- Autosave uses the greenfield version 2 document-byte format; version 1 is not
  read or migrated

## [1.2.1] - 2026-07-11

### Changed

- Separated the React Zustand bindings from the model and scripting layers,
  keeping the core multi-model stores framework-agnostic
- Routed imperative extension, persistence, and scripting integrations through
  the vanilla active-model and workspace stores
- Kept machine-local agent permissions and root-level smoke captures out of
  release commits

## [1.2.0] - 2026-07-10

### Added

- Desktop Archi-style multi-model workspace with independent undo, save, dirty,
  selection, and open-view state per model
- Cross-model copy/paste for diagram objects, elements, and whole views,
  including tree-to-view and view-to-tree context-menu workflows
- Desktop Archi-style view duplication and paste semantics, with explicit
  **Paste as Reference** for shared-concept visuals
- Full multi-model IndexedDB workspace restore and model lifecycle extension events

## [1.1.0] - 2026-07-10

### Added

- View tab context menu with Close, Close Others, and Close All
- Model tree Collapse All / Expand All buttons in the filter header
- Validator findings now navigate to the problem: concept findings reveal and
  select the item in the model tree (raising or reopening the Models panel);
  view findings open the view, select the object, and center the canvas on it
- Validator rows show a location hint (the containing view or folder)
- Bendpoints snap to the grid while dragging, matching node move/resize
  behavior (`Alt` bypasses; honors the snap-to-grid setting)

### Fixed

- Properties panel tab strip no longer stretches with excess vertical white
  space at narrow panel widths
- Clicking an existing bendpoint without dragging no longer nudges it

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

[1.1.0]: https://github.com/ThomasRohde/archi-online/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ThomasRohde/archi-online/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/ThomasRohde/archi-online/releases/tag/v0.2.0
