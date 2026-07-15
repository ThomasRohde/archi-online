# Desktop Archi Feature Parity

This document records the improvements required to bring Archi Online closer to
feature parity with Desktop Archi. It is deliberately broader than a prioritized
roadmap: every partial or missing capability identified in the feature comparison
is represented here, including lower-priority items and optional plug-in parity.

## Baseline and scope

- **Archi Online baseline:** Phase 4 report release, version 1.5.1.
- **Desktop reference:** Archi 5.9.0, released April 14, 2026.
- **ArchiMate reference:** ArchiMate 3.2.
- **Audit date:** July 14, 2026.
- **Primary Desktop sources:** the
  [Archi 5.9 User Guide](https://www.archimatetool.com/downloads/archi/Archi%20User%20Guide.pdf),
  [version history](https://www.archimatetool.com/version-history/), and
  [official plug-in catalog](https://www.archimatetool.com/plugins/).
- **Primary Online sources:** current code, tests, and documentation in this
  repository. In particular, see [Archi Compatibility](docs/wiki/Archi-Compatibility.md),
  the [User Guide](docs/wiki/User-Guide.md), and the
  [architectural principles](ARCHITECTURE.md).

This is a greenfield project with no users or backwards-compatibility obligation.
The plan therefore targets the clean Archi 5.9 end state directly. It does not
schedule compatibility-containment work ahead of features or treat unmodeled data
retention as feature support. Every pinned Archi 5.9 feature must be represented
in the normalized model and implemented end-to-end.

## Phase 1 implementation status

Phase 1 structural parity is implemented in version 1.3.0 against installed
Desktop Archi `5.9.0.202604140726`. The completed scope is `FILE-01`, the Phase 1
portion of `FILE-02`, `TEST-01`, `MODEL-01` through `MODEL-05`, and all of
`VIEW-08`. It includes normalized state, undoable operations, UI, rendering,
scripting, native XML/ZIP I/O, interchange, and tests. Desktop CLI load/save is
verified against reciprocal fixtures by `npm run verify:phase1:desktop`.

The implementation deliberately does not add legacy autosave migration, opaque
future-version preservation, or preservation-only substitutes for unsupported
features. Remaining entries in this document are implementation gaps for later
phases; Phase 1 entries are retained as the completed parity contract.

## Phase 2 implementation status

Phase 2 daily modeling parity is implemented in version 1.4.0 against the same
pinned Desktop Archi build. The completed scope is `VIEW-01` through `VIEW-05`,
`TREE-01`, `TREE-02`, and `PROP-01`. Independent Online-authored and
hand-authored Desktop-native fixtures, a frozen Desktop load/save golden, exact
source-semantic contracts, headed Chrome/Edge smoke evidence, and
`verify:phase2` / `verify:phase2:desktop` provide the certification evidence.

This is a Phase 2 feature-area claim, not a declaration of full project parity;
all unmarked entries remain implementation gaps for later phases.

## Phase 3 implementation status

Phase 3 analysis and reuse parity is implemented in version 1.5.0. The completed
scope is `ANALYSIS-01`, `ANALYSIS-02`, `ANALYSIS-05`, `REUSE-01`, and `REUSE-02`:
Visualiser, generated views, validator completion, model import/merge, and general
model templates. `verify:phase3` pins deterministic traversal, validation,
merge, template, native-round-trip, and fresh-ID semantics;
`verify:phase3:desktop` additionally load/saves the nested native payload through
the exact pinned Desktop Archi build.

This is a Phase 3 feature-area claim. Stakeholder delivery and the remaining
unmarked core/optional items continue in later phases.

The parity target has three distinct scopes:

1. **Core parity** covers features shipped with Desktop Archi 5.9, including
   Visualiser, Validator, model import, HTML and Jasper reports, templates,
   Sketch, Canvas, and the Archi Command Line Interface.
2. **Established optional parity** covers official optional plug-ins such as
   jArchi, legacy coArchi, Excel export, and Lightbox.
3. **Experimental optional parity** covers coArchi2. It is actively developed
   but officially described as work in progress, so it must not define the core
   parity completion gate.

### Product-scope decisions

The comparison register remains deliberately complete, but the current product
roadmap does not include `OUTPUT-02`, `OUTPUT-03`, `OUTPUT-05`, `OUTPUT-06`,
`AUTO-01`, or `COLLAB-*`. These are explicit product-scope decisions rather than
implemented parity. Where an omitted item is part of Desktop core, Archi Online
will document the deviation instead of claiming strict Desktop parity.

## Priority and effort

| Priority | Meaning |
| --- | --- |
| **P0 — foundation** | Schema, asset transport, and tests required to implement Archi 5.9 features cleanly. |
| **P1 — core** | High-value Desktop core parity used in normal modeling workflows. |
| **P2 — workflow** | Important for large models, reuse, stakeholder delivery, or team adoption. |
| **P3 — optional** | Long-tail core behavior or established optional plug-in parity. |

| Effort | Meaning |
| --- | --- |
| **S** | Localized UI or domain behavior with limited schema impact. |
| **M** | A cross-layer feature with focused model, UI, and test changes. |
| **L** | A substantial subsystem or workflow touching several compatibility surfaces. |
| **XL** | A foundational capability affecting schema, persistence, rendering, interchange, and UX. |

Effort is relative and intentionally not expressed as calendar time.

## Executive assessment

Archi Online already has strong parity in the ArchiMate 3.2 foundation:

- all standard element and relationship types;
- Archi-derived relationship and viewpoint rules;
- multi-model workspaces with per-model undo and save state;
- a capable SVG view editor;
- properties, Analysis, Navigator, Outline, and Validator panels;
- native plain-XML `.archimate`, Open Exchange, and Archi CSV workflows;
- PNG/SVG output, presentation mode, and read-only sharing;
- a useful jArchi-style scripting subset and browser extension system.

The largest remaining gaps are not the basic metamodel. They are:

1. deeper relationship, nesting, and diagram-authoring semantics;
2. large-model search, analysis, model reuse, and reporting;
3. optional repository collaboration and automation workflows;
4. Desktop-specific non-standard view types.

## Feature comparison

| Feature area | Current Archi Online status | Main Desktop parity gaps | Improvement IDs |
| --- | --- | --- | --- |
| ArchiMate 3.2 metamodel and rules | **Strong** | The visible relationship matrix remains. Specializations, interchange, and connection-to-connection diagram endpoints are complete. | `MODEL-06` |
| Workspace and model tree | **Strong/partial** | Cut, drill-down, hidden folders, richer sorting and unused markers, and some Desktop tree preferences. Phase 2 completed advanced search and find/replace. | `TREE-03`–`TREE-06`, `UX-03`, `UX-04` |
| Everyday view editing | **Strong** | Phase 2 completed ARM, Magic Connector reuse/creation, connection endpoints and routers, transformations, note connections, and legends. Diagram productivity now includes full ordering, Cut/Paste Special, keep-children deletion, same-type selection, grid/guides, and Format Painter. | — |
| Properties and appearance | **Strong/partial** | Richer property reuse/bulk editing and hyperlinks remain. Phase 1 completed the appearance schema; Phase 2 completed global property management; Format Painter is implemented. | `PROP-02`, `PROP-03` |
| Navigation, analysis, and quality | **Mostly strong** | Visualiser, Hints, generated views, Navigator drag-to-view, parent-folder paths, and the latest validator integrity/configuration behavior. | `ANALYSIS-01`–`ANALYSIS-06` |
| Native `.archimate` fidelity | **Strong/partial** | Sketch and Canvas remain. ZIP assets, specializations, images, appearance, recursive connection endpoints/routes, note connections, and legends are implemented. | `FILE-02`, `NONSTD-01`–`NONSTD-03` |
| Open Exchange and CSV | **Strong** | Phase 1 completed metadata, language, organization, XSD validation/copy, specializations, atomic import, and Archi 5.9 CSV edge behavior. | — |
| Output and reporting | **Partial** | Static HTML reports are implemented. Printing, PDF/JPG/BMP output, report masking/query, Jasper templates, Excel export, and gallery output remain. | `OUTPUT-02`–`OUTPUT-06` |
| Model reuse and lifecycle | **Partial** | Full model import/merge, reusable model templates, recent-file workflows, backup files, and richer open/save preferences. | `REUSE-01`, `REUSE-02`, `UX-04` |
| Scripting and extensibility | **Substantial but browser-scoped** | Full jArchi desktop APIs, Node/CommonJS utilities, external script loading, headless ACLI, remote package lifecycle, and Desktop plug-in outcomes. | `AUTO-01`–`AUTO-04` |
| Sketch and Canvas | **Missing** | Canvas authoring/templates and Sketch authoring for the pinned Archi 5.9 target. | `NONSTD-01`–`NONSTD-03` |
| Collaboration and versioning | **Sharing only** | Repository lifecycle, commit/history, branches/tags, diff, changed-view comparison, merge, and conflict resolution. | `COLLAB-01`–`COLLAB-05` |
| Preferences, help, and accessibility | **Partial** | Themes, high contrast, comprehensive defaults, customizable shortcuts, contextual help, cheat sheets, and a verified browser/platform matrix. | `UX-01`–`UX-05` |

## Complete improvement register

### 1. Native file implementation foundation

All known Archi 5.9 features are implemented directly in normalized state. Native
XML/ZIP parsing and serialization are part of each feature's definition of done;
opaque preservation does not count as feature support.

#### FILE-01 — ZIP-based `.archimate` transport

- **Status:** Completed in 1.3.0
- **Priority:** P0
- **Effort:** L
- **Co-deliver with:** `MODEL-02`
- **Current gap:** Desktop Archi stores image-bearing models as ZIP archives
  containing the XML model and image assets. Online currently reads model files
  using `file.text()` and always writes plain XML.
- **Improvement:** Detect XML versus ZIP transport, load the contained model and
  assets into normalized state, and write a valid Desktop-compatible archive
  when images are present.
- **Acceptance:** Image-bearing Desktop models open, render, save, and reopen in
  Desktop Archi without losing images or model data.

#### FILE-02 — Complete Archi 5.9 native schema coverage

- **Status:** Phase 1 feature coverage completed in 1.3.0; later feature slices remain
- **Priority:** P0/P1
- **Effort:** XL across the feature program
- **Dependencies:** the applicable `MODEL-*`, `VIEW-*`, `PROP-*`, and `NONSTD-*`
  implementation tasks
- **Current gap:** `ModelState` and native I/O cover the current Online feature
  subset rather than every known Archi 5.9 object, feature, attribute, and asset.
- **Improvement:** Extend normalized state, operations, scripting wrappers,
  parsing, and serialization as each feature is implemented. Known Archi 5.9
  content must be typed and editable; do not store it as opaque XML.
- **Acceptance:** Every object and feature defined by the pinned Archi 5.9 native
  format has a normalized representation and an implemented user workflow.

#### TEST-01 — Feature-rich parity fixtures and source-semantic tests

- **Status:** Phase 1 fixture and Desktop CLI semantic gate completed in 1.3.0
- **Priority:** P0
- **Effort:** M
- **Current gap:** Existing round-trip tests prove equality after the first parse;
  they cannot detect content discarded during that parse.
- **Improvement:** Add Archi 5.9 golden fixtures containing specializations,
  images, label expressions, legends, line styles, gradients, Manhattan routes,
  nested/connection endpoints, Sketch, and Canvas. Compare source semantics and
  implemented behavior, not only normalized parse results.
- **Acceptance:** CI fails when any pinned Archi 5.9 feature is
  dropped, changed, or reordered in a semantically significant way.

### 2. Metamodel customization and interchange

#### MODEL-01 — Specializations and Specializations Manager

- **Status:** Completed in 1.3.0
- **Priority:** P1
- **Effort:** XL
- **Current gap:** CSV specialization columns are ignored or written empty, and
  the normalized model has no profile/specialization definitions or assignments.
- **Improvement:** Add specialization definitions, base-type restrictions,
  assignments to elements and relationships, a manager UI, tree/palette entries,
  filtering, validation, native XML, CSV, and Open Exchange support.
- **Acceptance:** A specialization created in either tool survives round trips,
  appears with the correct name and base type, and can be created and managed in
  Online.

#### MODEL-02 — Model image and icon asset system

- **Status:** Completed in 1.3.0
- **Priority:** P1
- **Effort:** XL
- **Co-deliver with:** `FILE-01`; strongly related to `MODEL-01`
- **Current gap:** Diagram objects and specialization definitions cannot own
  Desktop-compatible images or icons.
- **Improvement:** Add a model-scoped image registry, import/chooser/gallery,
  deduplication, placement/fill options, specialization icons, object images,
  rendering, export, clipboard, sharing, autosave, and archive persistence.
- **Acceptance:** Images display consistently in Online, Desktop, exported views,
  shared viewers, and restored workspaces.

#### MODEL-03 — Label expressions

- **Status:** Completed in 1.3.0
- **Priority:** P1
- **Effort:** L
- **Dependencies:** property access, specialization support for full parity
- **Current gap:** Online always renders fixed names/labels and does not preserve
  Desktop label-expression features.
- **Improvement:** Parse, evaluate, edit, validate, and serialize Desktop label
  expressions for elements, relationships, groups, connections, view references,
  and applicable model-tree/report labels. Include conditional and property-based
  expressions and safe error rendering.
- **Acceptance:** Expressions render the same visible label in both tools and an
  invalid expression cannot break view loading.

#### MODEL-04 — Complete Open Exchange options

- **Status:** Completed in 1.3.0
- **Priority:** P2
- **Effort:** M/L
- **Dependencies:** `MODEL-01`
- **Current gap:** Core concepts, views, properties, and styles are supported, but
  Desktop options such as specialization names, language codes, Dublin Core
  metadata, schema validation/copy, and complete import diagnostics are absent.
- **Improvement:** Implement the remaining standard metadata and export/import
  options with an explicit compatibility dialog.
- **Acceptance:** Equivalent Desktop and Online export settings produce
  semantically equivalent Open Exchange documents.

#### MODEL-05 — Current Desktop CSV edge behavior

- **Status:** Completed in 1.3.0
- **Priority:** P2
- **Effort:** M
- **Dependencies:** `MODEL-01`
- **Current gap:** Specialization columns are deliberately omitted. Other current
  Desktop behavior such as comments, duplicate-relation rejection, and exact
  update diagnostics should be pinned and tested.
- **Improvement:** Complete specialization round trips, align parsing and failure
  rules with Archi 5.9, and show an import result report.
- **Acceptance:** The same valid/invalid CSV fixture produces the same model or
  atomic failure in both tools.

#### MODEL-06 — Visible relationship matrix and rule guidance

- **Priority:** P3
- **Effort:** S/M
- **Current gap:** The Archi relationship matrix drives the application but is not
  exposed as a browsable user tool.
- **Improvement:** Add a searchable legal-relationships matrix with source,
  target, allowed relation types, descriptions, and links to the palette or Hints.
- **Acceptance:** Users can answer relationship-validity questions without
  starting a connection gesture.

### 3. Model tree, search, and property productivity

#### TREE-01 — Advanced model-tree search

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** M
- **Current gap:** Search matches displayed names/relationship labels and a type
  filter only.
- **Improvement:** Search documentation, property keys and values, views, folders,
  and specializations. Add case-sensitive and regular-expression modes, property
  key selection, empty-folder behavior, persisted settings, and refresh/reset.
- **Acceptance:** Archi 5.9 search scenarios return equivalent result sets.

#### TREE-02 — Find and replace

- **Status:** Completed in 1.4.0
- **Priority:** P1/P2
- **Effort:** M
- **Dependencies:** `TREE-01`
- **Current gap:** There is no model-wide or active-view find/replace workflow.
- **Improvement:** Preview matches and replacements across names, documentation,
  and optionally property values; support model/view scope, case/regex options,
  selective application, and a single undo transaction.
- **Acceptance:** No replacement occurs without a preview, and the entire change
  can be undone in one step.

#### TREE-03 — Drill-down and folder visibility

- **Priority:** P2
- **Effort:** M
- **Current gap:** Large trees cannot be temporarily rooted at a folder, and
  top-level folder visibility is not configurable like Desktop Archi.
- **Improvement:** Add drill-in/home/back navigation, hide/show top-level folders,
  show-all, and persistent per-model or workspace visibility state.
- **Acceptance:** Large models can be navigated without losing selection or
  changing the model itself.

#### TREE-04 — Sorting, scale, and unused-concept cues

- **Priority:** P2
- **Effort:** S/M
- **Current gap:** Online uses ordinary locale sorting and lacks Desktop's optional
  alphanumeric order, incremental child display, and unused-concept typography.
- **Improvement:** Add configurable alphanumeric sorting, initial child limits,
  load-more rows, and an unused-in-views visual marker.
- **Acceptance:** Folders containing thousands of items remain responsive and
  sort consistently with the selected Desktop-compatible preference.

#### TREE-05 — Complete cut/paste and selection synchronization

- **Priority:** P2
- **Effort:** M
- **Current gap:** Copy/paste and drag/drop are strong, but Desktop-style cut
  workflows and configurable tree/view selection linking are incomplete.
- **Improvement:** Add safe cut/move semantics across folders and models, explicit
  selection synchronization, and commands to select a diagram concept in the
  tree and vice versa.
- **Acceptance:** Move versus copy is unambiguous, read-only targets are protected,
  and cross-model moves cannot leave dangling references.

#### TREE-06 — Recent search and tree preference persistence

- **Priority:** P3
- **Effort:** S
- **Current gap:** Not all Desktop tree search, folder visibility, and sorting
  preferences persist as a coherent profile.
- **Improvement:** Store and reset these preferences through the existing
  IndexedDB-backed settings system.
- **Acceptance:** Closing/reopening the app restores the selected tree behavior
  without storing it in the model file.

#### PROP-01 — Global Properties Manager

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** M
- **Current gap:** Properties are edited per target, but users cannot inspect
  global key usage or safely rename/delete a key throughout a model.
- **Improvement:** Show every property key, usage count, types/locations, values,
  and commands for global rename/delete with preview and one-step undo.
- **Acceptance:** Global operations update all applicable model/view/annotation
  properties without losing order or values.

#### PROP-02 — Property reuse, ordering, and bulk editing

- **Priority:** P2
- **Effort:** M
- **Current gap:** Desktop provides richer property-key reuse, copying, ordering,
  Add Unique behavior, and multi-selection property workflows.
- **Improvement:** Add key/value suggestions, reorder controls, copy/paste between
  objects, add-to-selection behavior, mixed-value states, and selective bulk edit.
- **Acceptance:** Bulk property changes clearly distinguish shared, mixed, and
  missing values and remain a single undo step.

#### PROP-03 — Hyperlinks and richer documentation fields

- **Priority:** P3
- **Effort:** S/M
- **Current gap:** Desktop recognizes links in purpose/documentation fields and
  offers richer viewing behavior.
- **Improvement:** Detect safe HTTP/HTTPS links, provide explicit open/copy actions,
  and preserve plain-text storage and read-only behavior.
- **Acceptance:** Links are useful without executing embedded markup or weakening
  the browser security model.

### 4. Diagram semantics and editing

#### VIEW-01 — Automatic Relationship Management

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** XL
- **Current gap:** Visual reparenting changes containment geometry but does not
  create, hide, reveal, or manage semantic nesting relationships.
- **Improvement:** Implement Desktop-compatible ARM preferences and workflows:
  offer valid normal/reverse relationships during nesting, create selected
  relationships, hide configured relationship types while nested, and reveal
  them when un-nested.
- **Acceptance:** Nesting/unnesting produces the same semantic relationship and
  visible-connection outcomes as the selected Desktop ARM settings.

#### VIEW-02 — Full Magic Connector behavior

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** L
- **Current gap:** The current Magic Connector offers forward relationships
  between existing element nodes and creates a new relationship.
- **Improvement:** Add reverse relationship choices, reuse of existing semantic
  relationships, creation of a new target element on empty canvas, sticky tool
  behavior, direct naming, and clearer validity guidance.
- **Acceptance:** Desktop Magic Connector scenarios can be completed without
  switching tools or manually reconciling duplicate relationships.

#### VIEW-03 — Complete connection endpoints and routing

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** L/XL
- **Current gap:** Diagram connections terminate on nodes only; Desktop also
  supports connection endpoints. `connectionRouterType` is preserved but not
  implemented as an editing/rendering mode.
- **Improvement:** Support connection-to-connection endpoints, reconnection,
  manual versus Manhattan routers, router conversion, layout-safe bendpoints,
  and warnings when reconnection affects other views.
- **Acceptance:** Desktop files using these structures render correctly, remain
  editable, and round-trip without endpoint or route loss.

#### VIEW-04 — Concept and relationship transformation commands

- **Status:** Completed in 1.4.0
- **Priority:** P1
- **Effort:** M/L
- **Current gap:** Users cannot change selected elements/relationships to another
  valid ArchiMate type or invert relationship direction.
- **Improvement:** Add Set Concept Type and Invert Connection Direction with
  whole-model validity analysis, handling of invalid connected relationships,
  multi-selection, previews, warnings, and one-step undo.
- **Acceptance:** All affected view occurrences update consistently, and an
  invalid transformation is either blocked or explicitly reconciled.

#### VIEW-05 — Note connections and legends

- **Status:** Completed in 1.4.0
- **Priority:** P1/P2
- **Effort:** M/L
- **Dependencies:** `MODEL-01` for specialization-aware legends
- **Current gap:** Plain note connections can be parsed/rendered but are not a
  complete authoring workflow. Desktop 5.8 legends are not modeled.
- **Improvement:** Add a note-connection tool and editable connection appearance.
  Add auto-updating legends with element/relation scope, specialization scope,
  sorting, color schemes, rows/columns, labels, and width adjustment.
- **Acceptance:** Notes and legends authored in either tool remain functional in
  the other; older-tool fallback behavior is preserved.

#### VIEW-06 — Remaining manipulation commands

- **Status:** Implemented (unreleased)
- **Priority:** P2
- **Effort:** M
- **Current gap:** Online has front/back ordering and strong alignment, but lacks
  several Desktop commands.
- **Improvement:** Add Cut, Delete from View while keeping/reparenting children,
  Select Objects of Same Type, Bring Forward, Send Backward, Paste Special
  preference variants, and any remaining guide/grid commands.
- **Acceptance:** Commands work for multi-selection, nested objects, read-only
  sessions, and cross-model clipboard state with one undo step per action.

#### VIEW-07 — Format Painter

- **Status:** Implemented (unreleased)
- **Priority:** P2
- **Effort:** M
- **Dependencies:** complete style schema from `VIEW-08`
- **Current gap:** Reusing a complete visual style requires editing fields or
  scripting.
- **Improvement:** Add one-shot and sticky Format Painter modes for nodes and
  connections, copying only applicable style fields across views.
- **Acceptance:** Copying style never changes semantic content, bounds, or
  unsupported target fields.

#### VIEW-08 — Complete visual appearance schema and controls

- **Status:** Completed in 1.3.0
- **Priority:** P1
- **Effort:** L
- **Dependencies:** `MODEL-02`, `MODEL-03` for complete parity
- **Current gap:** Gradient and line-style controls are disabled. Nodes lack the
  full Desktop line-width/icon/image/label surface, and font selection is a small
  preset list.
- **Improvement:** Add gradients; solid/dashed/dotted/none line styles; node and
  connection line widths; icon color/show/hide; image position/fill; complete
  font selection and defaults; label-expression editing; and exact native XML
  preservation.
- **Acceptance:** The Appearance panel exposes every supported stored field, and
  views render equivalently in Online, Desktop, image export, and presentation.

### 5. Navigation, analysis, and validation

#### ANALYSIS-01 — Graphical Visualiser

- **Status:** Completed in 1.5.0
- **Priority:** P1
- **Effort:** M/L
- **Dependencies:** existing analysis helpers and ELK layout
- **Implementation:** The Visualiser panel provides focus, drill-in/back/home, depth,
  incoming/outgoing/both direction, viewpoint/element/relationship filters,
  relayout, selection synchronization, stale-layout suppression, and
  SVG/PNG/clipboard export without adding ephemeral graphs to model state.
- **Acceptance:** Selecting a concept anywhere updates the Visualiser, and filter
  combinations remain responsive on large graphs.

#### ANALYSIS-02 — Generate View from selected concepts

- **Status:** Completed in 1.5.0
- **Priority:** P1
- **Effort:** M
- **Dependencies:** analysis traversal and layout
- **Implementation:** Generate View For builds and lays out a candidate around
  selected elements before mutation, with depth and
  viewpoint, include related concepts and optional all internal relationships,
  then applies the complete view and higher-order connection topology in one
  transaction.
- **Acceptance:** Generation is deterministic, one undoable operation, and never
  creates duplicate semantic concepts unnecessarily.

#### ANALYSIS-03 — Navigator completion

- **Priority:** P2
- **Effort:** S/M
- **Current gap:** Core traversal, pinning, history-root behavior, and selection
  are present; Desktop also supports using Navigator results directly in views.
- **Improvement:** Add drag/drop or explicit Add to Active View, optional filters,
  and clearer parent-folder/location context.
- **Acceptance:** Adding a Navigator result reuses the selected semantic concept
  and follows normal auto-connect and viewpoint rules.

#### ANALYSIS-04 — Hints and contextual guidance

- **Priority:** P2/P3
- **Effort:** M
- **Current gap:** There is no dedicated contextual explanation for selected
  concepts, relationships, viewpoints, or palette tools.
- **Improvement:** Add a Hints panel backed by local, versioned content with safe
  links, palette hover integration, and extension contribution points.
- **Acceptance:** Hints work offline, cannot execute untrusted content, and stay
  synchronized with the pinned ArchiMate version.

#### ANALYSIS-05 — Validator completeness and configuration

- **Status:** Completed in 1.5.0
- **Priority:** P1/P2
- **Effort:** M
- **Implementation:** The eight Archi 5.9 Hammer rules retain their fixed
  severities and browser-local enablement. A separately labelled integrity pass
  checks IDs, references, folders, view ownership, and connection topology;
  every finding carries a typed model-tree path and optional exact view target.
- **Acceptance:** A shared fixture produces equivalent findings and navigation in
  both tools, with differences documented when browser constraints apply.

#### ANALYSIS-06 — Analysis table paths and labels

- **Priority:** P2
- **Effort:** S
- **Dependencies:** `MODEL-03` for expression-aware labels
- **Current gap:** Desktop 5.9 shows parent folder paths in Used in Views and
  Model Relations tables.
- **Improvement:** Add unambiguous folder/view paths, expression-aware labels when
  enabled, sorting, and copy/open actions.
- **Acceptance:** Duplicate names can always be distinguished and navigated.

### 6. Model reuse and templates

#### REUSE-01 — Import and merge another Archi model

- **Status:** Completed in 1.5.0
- **Priority:** P1/P2
- **Effort:** L
- **Dependencies:** profiles/assets and complete native schema coverage
- **Implementation:** Import another `.archimate` model into the active model with
  ID/type matching, create/update options, model information and folder options,
  property replacement semantics, change preview, atomic application, and a
  detailed navigable result report. Preview plans become stale when the target
  changes and target-only content is retained.
- **Acceptance:** Re-importing an updated reference model is deterministic and
  cannot silently delete target-only content.

#### REUSE-02 — General model templates

- **Status:** Completed in 1.5.0
- **Priority:** P2
- **Effort:** M/L
- **Dependencies:** archive and image support for full Desktop compatibility
- **Implementation:** The IndexedDB gallery supports `.architemplate`
  import/export, metadata, descriptions,
  categories, optional view thumbnails, a gallery, and creating a fresh-ID model
  from a template. Archives use Desktop's `manifest.xml`, `model.archimate`, and
  `Thumbnails/*.png` contract with an optional `archi-online.json` sidecar.
- **Acceptance:** Templates are portable between Online installations and, where
  format-compatible, Desktop Archi.

### 7. Output, reporting, and stakeholder delivery

#### OUTPUT-01 — Static HTML report

- **Status:** Completed in 1.5.1
- **Priority:** P2
- **Effort:** L
- **Implementation:** Export a deterministic offline ZIP with a model tree,
  literal search, object summaries, stable deep links, Phase 3 Analysis data,
  and one shared-renderer SVG per view. The framework-free report opens through
  `file://` or static hosting and allowlists model-file content so browser
  settings, extensions, scripts, autosave, file handles, sharing credentials,
  and tokens are excluded.
- **Acceptance:** The exported report opens from disk or static hosting without a
  server and contains no private token or browser-profile data.

#### OUTPUT-02 — HTML report masking and query tools

- **Status:** Not planned — product-scope decision
- **Priority:** P2/P3
- **Effort:** M/L
- **Dependencies:** `OUTPUT-01`
- **Current gap:** Desktop reports support `_hide_from_export_`, navigation-tree
  masking, direct URLs, and SQL-style model queries.
- **Improvement:** Implement compatible masking and deep-link rules and provide a
  safe structured query surface. If SQL is used, run it against a read-only,
  generated report database.
- **Acceptance:** Hidden navigation entries remain intentionally addressable or
  excluded according to an explicit export policy.

#### OUTPUT-03 — Jasper-style formatted reports

- **Status:** Not planned — product-scope decision
- **Priority:** P3
- **Effort:** XL
- **Dependencies:** complete model and image fidelity
- **Current gap:** Online has no JRXML engine, bundled customizable report, locale
  selection, or PDF/office report output.
- **Improvement:** Strict Archi 5.9 core parity requires JRXML-compatible report
  templates and outputs. If the product deliberately chooses outcome parity
  instead, provide a web-native report-template system producing PDF and common
  document formats and record Jasper as an explicit compatibility deviation.
- **Acceptance:** Exact JRXML compatibility is verified, or the parity scope and
  documentation clearly state that web-native formatted reporting is a chosen
  substitute rather than full Desktop parity.

#### OUTPUT-04 — Printing and additional image formats

- **Priority:** P2/P3
- **Effort:** M
- **Current gap:** Online exports PNG/SVG and clipboard PNG. Desktop also prints
  and exports BMP, JPG, PDF, with additional scale/font/viewBox options.
- **Improvement:** Add print layout/preview, PDF, JPG, and justified remaining
  raster formats; richer scale/background/bounds/font options; and test output
  across browsers.
- **Acceptance:** Export dimensions, clipping, fonts, transparency, and print
  pagination are predictable and documented.

#### OUTPUT-05 — View gallery / Lightbox outcome

- **Status:** Not planned — product-scope decision
- **Priority:** P3 — optional plug-in parity
- **Effort:** M
- **Dependencies:** view image cache
- **Current gap:** Presentation mode is sequential; there is no browsable gallery
  of model/folder view thumbnails.
- **Improvement:** Add a thumbnail gallery with recursive folder control, labels,
  hover preview, quality/size settings, caching, and open-in-editor actions.
- **Acceptance:** Large models can browse hundreds of view thumbnails without
  blocking the editor or exhausting memory.

#### OUTPUT-06 — Native Excel export

- **Status:** Not planned — product-scope decision
- **Priority:** P3 — optional plug-in parity
- **Effort:** M
- **Dependencies:** `MODEL-01`
- **Current gap:** CSV is available, but there is no `.xlsx` workbook matching the
  official Excel plug-in's separate elements, relationships, properties, and
  specializations sheets.
- **Improvement:** Add client-side `.xlsx` export and, if a CLI is built, expose
  the same export there.
- **Acceptance:** Excel opens the workbook without repair warnings and all text,
  IDs, relations, properties, and specializations are preserved.

### 8. Automation, scripting, and extensions

#### AUTO-01 — Headless command-line interface

- **Status:** Not planned — product-scope decision
- **Priority:** P2/P3
- **Effort:** L
- **Current gap:** Desktop ACLI can load/create/save models and automate CSV,
  Exchange, and report workflows. Online's pure TypeScript model core is not
  packaged as a supported CLI.
- **Improvement:** Extract a Node-compatible headless entry point for validation,
  conversion, scripting, rendering where supported, and report generation.
- **Acceptance:** CLI operations share the same tested model/I/O implementation as
  the browser and produce deterministic non-interactive exit codes and output.

#### AUTO-02 — Fuller jArchi compatibility

- **Priority:** P3 — optional plug-in parity
- **Effort:** L/XL
- **Current gap:** Common selectors, wrappers, creation, traversal, properties,
  layout, and scripts work; filesystem, Java/UI toolkit, external `load()`, Node
  modules, model merge, report/render, and batch APIs are incomplete or absent.
- **Improvement:** Maintain a versioned compatibility matrix, implement portable
  APIs, provide capability detection for browser-only limitations, and expose
  headless-only filesystem/module APIs through `AUTO-01` rather than weakening
  browser security.
- **Acceptance:** Published compatibility tests state exactly which jArchi 1.11
  scripts run unchanged, require adapters, or are intentionally unsupported.

#### AUTO-03 — Extension distribution and lifecycle

- **Priority:** P3
- **Effort:** M/L
- **Current gap:** `.archi-ext` packages are imported manually, trusted as page
  code, stored locally, and not discovered, updated, signed, or synchronized.
- **Improvement:** Add optional registries, version/update checks, permissions and
  capability declarations, integrity/signature metadata, exportable lock state,
  and clearer trust prompts. Do not promise sandboxing without real isolation.
- **Acceptance:** Users can identify publisher, version, requested capabilities,
  update source, and integrity before enabling an extension.

#### AUTO-04 — Complete automatic layout

- **Priority:** P2/P3
- **Effort:** M
- **Current gap:** ELK layout is an importable example extension and rejects
  recursive nested layout.
- **Improvement:** Decide whether layout becomes a built-in feature or remains a
  first-party extension; add nested/container-aware layout, label-aware spacing,
  deterministic routing, preview, and cancel/undo.
- **Acceptance:** Layout preserves semantic containment and produces stable output
  for the same model/options.

### 9. Collaboration and versioning

These items are optional plug-in parity, not core Archi parity. Gist sharing is
useful publishing but does not supply repository collaboration. Repository
collaboration is not planned under the current product scope.

#### COLLAB-01 — Repository lifecycle and local commits

- **Priority:** P2/P3 — optional plug-in parity
- **Effort:** XL
- **Dependencies:** complete native fidelity and a security/authentication design
- **Improvement:** Create/import/remove repositories, clone/refresh, commit locally,
  publish/pull, discard changes, and show repository/model status.
- **Acceptance:** Offline commits are safe, publishing is explicit, credentials
  are protected, and ordinary local models remain usable without accounts.

#### COLLAB-02 — History, branches, tags, and snapshots

- **Priority:** P3
- **Effort:** L/XL
- **Dependencies:** `COLLAB-01`
- **Improvement:** Show author/date/message history, branches and tags, compare
  commits, and extract/open a read-only model snapshot from a commit.
- **Acceptance:** Historical inspection cannot mutate the current working model.

#### COLLAB-03 — Model-aware diff and changed-view comparison

- **Priority:** P3
- **Effort:** XL
- **Dependencies:** stable model identities, `COLLAB-01`
- **Improvement:** Compare semantic objects, properties, folders, views, geometry,
  styles, profiles, and assets; provide side-by-side visual previews of changed
  views and filterable change summaries.
- **Acceptance:** Reordering noise is minimized and every reported change links to
  the affected model object or view occurrence.

#### COLLAB-04 — Merge and conflict resolution

- **Priority:** P3
- **Effort:** XL
- **Dependencies:** `COLLAB-03`
- **Improvement:** Detect same-object conflicts, present base/local/remote values,
  resolve semantic and visual conflicts, validate the merged model, and retain a
  recoverable pre-merge snapshot.
- **Acceptance:** Conflicts cannot be silently accepted, and a failed/cancelled
  merge leaves the local model recoverable.

#### COLLAB-05 — Enterprise repository connectivity

- **Priority:** P3
- **Effort:** L/XL
- **Dependencies:** `COLLAB-01`
- **Improvement:** Add documented Git hosting support, HTTP/SSH authentication,
  proxy/private-PKI handling where browsers permit it, secure credential storage,
  and audit-friendly error messages.
- **Acceptance:** Unsupported network/authentication scenarios fail explicitly and
  never expose credentials in model files, logs, URLs, or shared links.

Live presence, comments, and simultaneous co-editing would be useful product
extensions, but they are beyond coArchi's asynchronous parity target and require
a separate server-backed product design.

### 10. Sketch and Canvas views

#### NONSTD-01 — Canvas Modelling Toolkit authoring

- **Priority:** P2/P3 — Desktop core
- **Effort:** XL
- **Dependencies:** images, archives, hints, templates, complete view persistence
- **Improvement:** Support Canvas blocks, stickies, images, arbitrary connections,
  locking, hints, links to views, palettes, properties, and reusable templates.
- **Acceptance:** Business Model Canvas and equivalent Desktop templates can be
  opened, edited, saved, and shared with preserved appearance and behavior.

#### NONSTD-02 — Canvas templates

- **Priority:** P2/P3 — Desktop core
- **Effort:** L
- **Dependencies:** `NONSTD-01`, image and archive support
- **Improvement:** Import/export `.archicanvas`, gallery/categories, thumbnails,
  locked template objects, and create-new-canvas workflows.
- **Acceptance:** Desktop and Online can exchange Canvas templates with equivalent
  structure, appearance, locking, hints, and assets.

#### NONSTD-03 — Sketch View authoring

- **Priority:** P3 — Desktop core
- **Effort:** XL
- **Current upstream signal:** The Archi 5.9 User Guide says Sketch is likely to
  be deprecated in favor of combining Sketch, Canvas, and ArchiMate views.
- **Improvement:** Implement the pinned Archi 5.9 Sketch model directly: sticky,
  actor, connector, background, palette, properties, editing, rendering, native
  XML, scripting, export, and sharing behavior.
- **Acceptance:** Archi 5.9 Sketch views can be opened, authored, saved, reopened,
  and exchanged with Desktop Archi. If a later pinned Archi target removes or
  unifies Sketch first, update this task to match that target rather than adding
  a compatibility shim.

### 11. Workspace, preferences, help, and accessibility

#### UX-01 — Themes and accessibility modes

- **Priority:** P2/P3
- **Effort:** M
- **Current gap:** Desktop exposes themes and high-contrast/platform behavior;
  Online has a single designed theme.
- **Improvement:** Add light/dark/system themes, high-contrast support, focus and
  reduced-motion audits, and accessible color/selection alternatives.
- **Acceptance:** Core editing is keyboard-usable and readable under supported
  operating-system contrast and zoom settings.

#### UX-02 — Complete preference surface

- **Priority:** P2/P3
- **Effort:** L
- **Current gap:** Online has useful canvas/default-size/viewport settings but not
  Desktop's full color schemes, font defaults, router/connection preferences,
  ARM options, diagram margins, palette behavior, animation, and legend defaults.
- **Improvement:** Add only preferences backed by implemented behavior, grouped by
  feature, resettable, validated, and stored in IndexedDB rather than model files
  unless Desktop explicitly persists the value in the model.
- **Acceptance:** Defaults affect future objects predictably and never rewrite
  existing objects without an explicit command.

#### UX-03 — Configurable shortcuts and guided help

- **Priority:** P3
- **Effort:** M
- **Current gap:** Online documents fixed shortcuts but lacks Desktop-style key
  customization, contextual help, and cheat sheets.
- **Improvement:** Add conflict-aware shortcut configuration, searchable command
  reference, contextual help/Hints links, and optional guided workflows for first
  model, map view, import, and sharing.
- **Acceptance:** Shortcut conflicts are prevented and help remains available
  offline.

#### UX-04 — File lifecycle preferences

- **Priority:** P2/P3
- **Effort:** S/M
- **Current gap:** Whole-workspace recovery is stronger than Desktop autosave, but
  there is no Desktop-style recent-file list, optional `.bak` creation, or
  preference to reopen model views.
- **Improvement:** Add recent handles/entries where browser APIs permit it,
  optional backup-before-write for native handles, reopen-view preferences, and
  clear fallback behavior when permissions expire.
- **Acceptance:** Browser limitations are explicit and recovery/autosave remains
  distinct from durable backup.

#### UX-05 — Browser and platform compatibility matrix

- **Priority:** P1/P2
- **Effort:** M and ongoing
- **Current gap:** Unit tests cannot prove parity for file handles, clipboard,
  PWA launch/share targets, pop-outs, printing, downloads, fonts, or accessibility.
- **Improvement:** Maintain automated and manual browser/platform coverage for
  Chromium, Firefox, Safari where applicable, installed PWA behavior, operating
  system file integration, and degraded fallbacks.
- **Acceptance:** Every browser-sensitive feature documents its supported path,
  fallback, and verified environments.

## Recommended delivery sequence

Delivery uses end-to-end feature slices. Each feature includes normalized state,
operations, UI, rendering, scripting/extension exposure, native I/O, applicable
interchange, and tests. `FILE-02` and `TEST-01` are program-wide completion
criteria applied within those feature slices, not a phase that precedes feature
implementation.

### Phase 1 — Structural feature implementation

1. `MODEL-01` specializations and manager.
2. `FILE-01` plus `MODEL-02` ZIP transport and images/assets.
3. `MODEL-03` plus all of `VIEW-08` label and appearance implementation.
4. `MODEL-04` and `MODEL-05` interchange completion.
5. Expand `TEST-01` fixtures with every completed feature and apply `FILE-02` to
   its native representation.

### Phase 2 — Daily modeling parity

1. `VIEW-01` ARM.
2. `VIEW-02` Magic Connector completion.
3. `VIEW-03` endpoints and routers.
4. `VIEW-04` transformation commands.
5. `VIEW-05` notes and legends.
6. `TREE-01`, `TREE-02`, and `PROP-01` productivity features.

### Phase 3 — Analysis and reuse

Implemented in 1.5.0. `npm run verify:phase3` checks the committed
Online compatibility fixture; `npm run verify:phase3:desktop` is the opt-in
pinned Desktop 5.9 payload round-trip.

1. `ANALYSIS-01` Visualiser.
2. `ANALYSIS-02` generated views.
3. `ANALYSIS-05` validator completion.
4. `REUSE-01` model import/merge.
5. `REUSE-02` templates.

### Phase 4 — Stakeholder delivery

1. `OUTPUT-01` static HTML report — completed in 1.5.1.
2. `OUTPUT-04` print/PDF/additional output.

### Phase 5 — Long-tail core and optional ecosystem parity

1. Fuller jArchi (`AUTO-02`).
2. Canvas authoring/templates (`NONSTD-01`, `NONSTD-02`) — Desktop core, but a
   later delivery priority.
3. Sketch authoring (`NONSTD-03`) for the pinned Archi 5.9 target.

## Definition of parity completion

Core parity should not be declared from a feature checklist alone. A release can
claim parity for a feature area only when:

1. the behavior is implemented in the UI and relevant scripting/extension APIs;
2. every Archi 5.9 object and field in that area has a typed normalized
   representation rather than opaque pass-through storage;
3. native `.archimate` XML/ZIP round trips preserve all data in that area;
4. Open Exchange and CSV behavior matches the formats' applicable scope;
5. undo/redo, multi-model isolation, read-only mode, autosave, and sharing are
   covered;
6. Desktop-generated golden fixtures and Online-generated files open correctly
   in both tools;
7. browser-sensitive paths have been verified in the supported platform matrix;
8. documentation describes the implemented behavior and any intentional product
   deviations;
9. all content in the pinned Archi 5.9 target is implemented. Future Archi
   versions enter scope only when the reference baseline is deliberately updated.

## Coverage crosswalk

This crosswalk ensures that no feature-comparison gap is omitted from the
improvement register.

| Comparison gap | Covered by |
| --- | --- |
| Specializations/profiles and specialization interchange | `MODEL-01`, `MODEL-04`, `MODEL-05` |
| Custom images/icons and ZIP models | `FILE-01`, `MODEL-02` |
| Complete Archi 5.9 normalized/native schema and parity fixtures | `FILE-02`, `TEST-01` |
| Label expressions | `MODEL-03`, `VIEW-08` |
| Connection-to-connection endpoints and routers | `VIEW-03` |
| ARM and nested relationship behavior | `VIEW-01` |
| Magic Connector reverse/reuse/create-target behavior | `VIEW-02` |
| Type conversion and invert direction | `VIEW-04` |
| Note connections and legends | `VIEW-05` |
| Cut, keep children, same-type selection, full z-order | `VIEW-06`, `TREE-05` |
| Gradients, line styles, icon/image/font appearance | `VIEW-08`, `MODEL-02` |
| Format Painter | `VIEW-07` |
| Advanced search, regex/case/property filters | `TREE-01` |
| Find/replace | `TREE-02` |
| Drill-down, hidden folders, sorting, unused markers | `TREE-03`, `TREE-04` |
| Global property management and bulk property workflows | `PROP-01`, `PROP-02` |
| Visualiser | `ANALYSIS-01` |
| Generate View For | `ANALYSIS-02` |
| Navigator drag-to-view and location context | `ANALYSIS-03`, `ANALYSIS-06` |
| Hints | `ANALYSIS-04` |
| Missing validator/model-integrity behavior | `ANALYSIS-05` |
| Model import/merge | `REUSE-01` |
| General model templates | `REUSE-02` |
| HTML report, masking, search, zoom, query, deep links | `OUTPUT-01`, `OUTPUT-02` |
| Jasper/formatted report output | `OUTPUT-03` |
| Print, PDF, JPG, BMP, and richer export options | `OUTPUT-04` |
| Lightbox/gallery and Excel plug-in outcomes | `OUTPUT-05`, `OUTPUT-06` |
| Headless ACLI | `AUTO-01` |
| Full desktop jArchi APIs | `AUTO-02` |
| Extension discovery/update/trust lifecycle | `AUTO-03` |
| Nested/complete automatic layout | `AUTO-04` |
| coArchi-style repository lifecycle, history, diff, and merge | `COLLAB-01`–`COLLAB-05` |
| Canvas authoring/templates | `NONSTD-01`, `NONSTD-02` |
| Sketch authoring | `NONSTD-03` |
| Themes, preferences, shortcuts, help, file lifecycle | `UX-01`–`UX-04` |
| Real-browser and platform verification | `UX-05` |

## Online differentiators to preserve

Parity work must not regress features where Archi Online already differs
positively from Desktop core:

- installable/offline PWA behavior;
- automatic whole-workspace IndexedDB recovery;
- inline and GitHub Gist read-only sharing with active-view deep links;
- presentation walkthrough mode;
- built-in C4 conventions and templates;
- browser-local extension packages and UI contribution APIs;
- split/floating/pop-out dock layouts;
- multi-model cross-copy workflows;
- static hosting with no mandatory backend or account.

These differentiators are constraints on the parity design, not reasons to
reimplement Desktop's Eclipse architecture or binary plug-in model.
