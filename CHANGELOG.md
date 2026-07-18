# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.2] - 2026-07-18

### Added

- Note border controls for Dog Ear, Rectangle, and borderless figures

### Fixed

- Presented Note text as multiline Content without repeating it in the
  Properties header
- Applied explicit Note line colours immediately by switching off derived line
  colour, while restoring derived colour when the explicit colour is reset
- Displayed the `archi_online_architecture` example script as the human-readable
  `Archi Online architecture` in the script dropdown

## [1.9.1] - 2026-07-17

### Fixed

- Kept element and relationship selections synchronized between the Model
  Browser and every open view, including repeated visual occurrences, while
  preserving exact canvas command targets and keyboard focus

## [1.9.0] - 2026-07-17

### Added

- Modern outline C4 figures for people, browser windows, folders, buckets,
  terminals, databases, and system boundaries
- C4 palette shortcuts and container Shape controls that preserve external and
  custom tags while switching visual variants

### Changed

- Replaced filled C4 notation with white figures, role-coloured outlines and
  text, solid boundaries, and dashed grey relationships with filled arrows
- Updated C4 templates, example model, modeling guidance, default person sizing,
  legend text, and application screenshots for the modern notation

### Fixed

- Kept database and bucket labels clear of shape details and tapered walls,
  hid descriptions when shape-specific label space is too small, and clamped
  person geometry for extreme imported bounds
- Matched the folder palette glyph to the canvas shape and made palette shape
  resolution robust to combined or mixed-case C4 tags

## [1.8.2] - 2026-07-17

### Added

- A crawlable, responsive ArchiMate modeler product page with static
  practitioner-focused content, visible FAQs, structured data, and accessible
  calls to action
- Canonical, Open Graph, and Twitter metadata for the editor and product page,
  plus an XML sitemap, crawl policy, optimized product screenshot, and branded
  social image
- SEO contract tests and post-build distribution verification for metadata,
  structured content, discovery files, internal links, and referenced assets

### Changed

- Made `archi-online.klok-rohde.dk` the canonical domain across application
  metadata, documentation, publishing guidance, and viewer examples while
  retaining the here.now slug as a fallback
- Configured Vite to build the editor and static product page as separate HTML
  entries without changing editor routing or PWA behavior

## [1.8.1] - 2026-07-17

### Changed

- Removed the completed Desktop Archi parity roadmap

### Fixed

- Opened shared-model copies directly on the viewer-selected diagram without
  restoring an unrelated autosaved workspace

## [1.8.0] - 2026-07-16

### Added

- Zoom-independent resize, bendpoint, and connection-endpoint handles with
  larger endpoint hit targets
- Distinct anchor, valid reconnect, invalid reconnect, and cancellation
  feedback in the canvas and status bar
- A persistent setting to hide or restore the toolbar context-help strip

### Changed

- Scoped canvas status to the active model session and view so zoom and cursor
  coordinates remain correct in multi-model workspaces
- Limited route prewarming to the current view, memoized route resolution,
  pruned stale route entries, and narrowed per-node settings subscriptions
- Deferred model-tree search catalog construction until search or its options
  are active

### Fixed

- Restored clean state when undo returns to the saved revision, while preserving
  dirty state for edits made during an in-progress save
- Preferred anchor movement for near-miss endpoint drops instead of silently
  reconnecting to an enclosing element

## [1.7.0] - 2026-07-16

### Added

- An opt-in Desktop-style orthogonal connection-anchor strategy across editable
  and read-only views, image exports, and jArchi routed points
- Manual connection endpoint positioning by dragging an endpoint back onto its
  current element, stored as native Archi bendpoints with undo, redo, and XML
  round-trip support

## [1.6.0] - 2026-07-15

### Added

- Per-view viewport persistence, deterministic first-view opening for imports,
  and one-time fitting for diagrams larger than the visible canvas
- A fixed-row virtualized model tree with accessible tree semantics, roving
  keyboard focus, indexed reveal, deferred search, and bounded rendering for
  large models
- Reusable accessible modal behavior, a typed shortcut registry, and complete
  system, light, and dark application themes while preserving white diagrams
- Worker-backed autosave serialization with idle fallback and runtime caching
  for lazily loaded Monaco assets

### Changed

- Isolated live canvas rendering with memoized node and connection projections,
  stable route data, cached label expressions, and benchmark coverage for large
  diagrams
- Split Exchange XML, TIFF conversion, and editor code from the initial bundle
  through boundary-level dynamic imports
- Improved the fresh dock layout, palette disabled state, focus indicators,
  contrast tokens, and animation-frame-throttled canvas status coordinates

## [1.5.1] - 2026-07-14

### Changed

- Reworked the model-template gallery into a responsive master-detail workspace
  with clearer search, filtering, selection, metadata, and reuse actions
- Added guided empty and no-results states for building and searching the local
  browser template library

### Fixed

- Removed the generic modal width cap that clipped template controls, details,
  and footer actions at common viewport sizes

## [1.5.0] - 2026-07-14

### Added

- Deterministic Visualiser graphs with traversal controls, selection sync,
  history, ELK relayout, and SVG/PNG export
- Transactional Generate View workflows for semantic selections, viewpoints,
  internal relationships, and higher-order connection topology
- Configurable Hammer validation rules plus separately reported model-integrity
  findings with precise tree and view navigation
- Atomic `.archimate` import-and-merge previews with conflict handling, asset
  deduplication, folder options, and navigable reports
- Desktop-compatible `.architemplate` import, export, and IndexedDB gallery
  workflows with fresh-ID remapping, thumbnails, categories, and safety checks
- Reciprocal Phase 3 fixtures and CI verification for analysis, validation,
  merge, and template compatibility

### Changed

- Validator configuration now briefly explains Hammer rules as modelling checks
  instead of referring users to a specific Desktop version

## [1.4.0] - 2026-07-13

### Added

- Desktop-compatible Automatic Relationship Management for palette creation,
  model-tree drops, and canvas nesting, including normal/reverse candidates,
  hidden nested occurrences, reveal-on-unnest, and browser-local preferences
- Full Magic Connector workflows for forward/reverse relationships, semantic
  reuse, new target creation, direct naming, and sticky palette tools
- Recursive connection endpoints, safe reconnection, manual and Manhattan
  routers with dormant bendpoint preservation, and routed-point scripting APIs
- Transactional Set Concept Type and Invert Connection Direction commands
  across the tree, canvas, scripting, and extensions
- Native property-bearing note connections and configurable, auto-updating
  Desktop 5.9 legends
- Advanced model-tree search, reviewed model/view find-and-replace, and the
  model-wide Properties Manager with previewed exact-key rename/delete
- Reciprocal Online-authored and independently hand-authored Desktop-native
  Phase 2 fixtures, malformed endpoint/cycle probes, cross-platform semantic
  verification, and an exact-version Desktop CLI gate

### Changed

- Expanded the jArchi-compatible wrappers with connection reconnection,
  rendered routes, per-view router selection, and property-ledger operations
- Added Phase 2 fixture verification to the local and hosted CI gates

## [1.3.2] - 2026-07-12

### Changed

- Replaced the complete built-in top-toolbar icon set with consistent Lucide
  icons, including icon-only Profiles and Images controls with unchanged
  tooltips, accessibility, and behavior

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
