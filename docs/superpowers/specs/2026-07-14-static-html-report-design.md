# Static HTML Report Design

**Date:** 2026-07-14
**Status:** Approved in conversation on 2026-07-14
**Scope:** Implement `OUTPUT-01` as the first Phase 4 stakeholder-delivery slice: export the active model as an offline, navigable static HTML report package.

## Summary

Archi Online will export a deterministic ZIP archive containing a static report that opens either directly from an extracted local directory or from ordinary static hosting. The report provides a model tree, search, object summaries, rendered views, deep links, view zoom controls, and Phase 3 analysis data without requiring Archi Online, a server, or a network connection.

The report is a pre-rendered static application, not a second React build. Export creates a deliberately small report projection, standalone view SVG files, and fixed report HTML/CSS/JavaScript assets. Classic JavaScript reads a sibling `report-data.js` assignment, avoiding `fetch`, ES module, and cross-origin restrictions under `file://`.

## Goals

- Turn the modeling, fidelity, analysis, and reuse work from Phases 1 through 3 into a portable stakeholder deliverable.
- Open successfully from an extracted local directory and from static HTTP hosting.
- Provide useful navigation without exposing or depending on the editor runtime.
- Reuse the existing static SVG renderer so report diagrams match editor image export.
- Establish the report projection and deep-link contract needed by `OUTPUT-02` masking and query work.
- Keep generation entirely in the browser and add no dependency.

## Non-goals

- Report masking, `_hide_from_export_`, or query tools from `OUTPUT-02`.
- Print layout, PDF, JPG, BMP, or other `OUTPUT-04` formats.
- Editing, comments, collaboration, live model synchronization, or opening the report back into the editor.
- A copy of the docked React editor or its extension runtime.
- A configurable theme, report-template system, or Jasper/JRXML compatibility.
- Executing model documentation, properties, scripts, extensions, or embedded markup as code.

## Considered approaches

### 1. Pre-rendered static report package — selected

Export a ZIP with fixed HTML/CSS/classic JavaScript assets, a generated `report-data.js`, and one standalone SVG per view.

This approach works under `file://`, keeps the artifact inspectable, reuses the existing renderer, gives large diagrams separate cacheable files, and creates a clean data boundary for later masking/query features. It requires a small report-specific UI implementation, but that implementation is intentionally framework-free and read-only.

### 2. Rebuild the existing React viewer into the report

Bundle the current `ViewerShell` and editor renderer into every report.

This maximizes component reuse but couples exported reports to the full application build, settings stores, and editor assumptions. It also makes deterministic export, long-term portability, and `file://` boot behavior harder to guarantee. The shipped artifact would be much larger than the report needs.

### 3. Emit one monolithic HTML file

Inline all report data, JavaScript, CSS, images, and SVG documents into a single file.

This is convenient to send, but large models create unwieldy HTML files, duplicate/escaping rules become security-sensitive, and individual views cannot be loaded independently. A ZIP package is a better match for Desktop Archi's report outcome and leaves room for later report assets without changing the contract.

## Archive contract

The downloaded file is named from the model name with unsafe Windows filename characters replaced, followed by `-html-report.zip`.

The archive contains:

```text
index.html
report.css
report.js
report-data.js
views/
  view-0001.svg
  view-0002.svg
  ...
```

Archive entries use forward-slash paths, lexical ordering, UTF-8 text, compression level 6, and a fixed ZIP timestamp so identical inputs produce identical bytes. View filenames are assigned from views sorted by stable model-tree order and ID; native model IDs never become filesystem paths.

Standalone view SVGs already embed model image bytes as data URLs through the shared renderer. The report therefore needs no separate image directory for the first slice.

`index.html` loads only sibling `report.css`, `report-data.js`, and `report.js`. It contains no CDN links, web fonts, analytics, service worker, network request, inline model data, or editor bootstrap code.

## Report projection

The exporter produces a versioned, JSON-compatible `StaticReportData` value and writes it as:

```js
window.__ARCHI_STATIC_REPORT__ = { /* serialized projection */ };
```

The projection contains only model-file information needed by the report:

- report schema version and generated product version;
- model ID, name, purpose/documentation, and ordered properties;
- ordered folders and their parent/child/item structure;
- elements with ID, name, type, specialization label, documentation, and ordered properties;
- relationships with ID, name, type, specialization label, documentation, ordered properties, source ID, and target ID;
- views with ID, name, viewpoint, documentation, ordered properties, tree folder, and assigned SVG path;
- per-concept analysis containing related relationship IDs and IDs of views that use the concept.

Diagram nodes, connections, raw asset bytes, editor selection, undo history, and application settings are not duplicated into the projection. Diagram content is represented by the standalone SVG. The projection never contains file handles, autosave records, recent files, scripts, extensions, extension storage, dock layout, share/GitHub associations, authentication data, tokens, or browser-profile settings.

All arrays have deterministic ordering. Tree arrays follow model folder/item ordering where that ordering is semantically visible. Searchable catalogs use name, then ID, as the tie-breaker where the model has no explicit order.

## Export architecture

The implementation is split into focused units.

### 1. Pure report projection

A module under `src/model/report/` converts `ModelState` to `StaticReportData`. It owns folder traversal, object summaries, stable ordering, and Phase 3 analysis references. It depends on model types and existing analysis/metamodel helpers, never on React or browser APIs.

### 2. Static report assets

Fixed report-shell assets live under `src/model/report/` as TypeScript string exports. The shell uses DOM APIs and `textContent` to render all model-controlled text. It does not use `innerHTML` for model content, `eval`, `Function`, or dynamic script creation.

The shell owns hash routing, tree navigation, search, object summaries, diagram display, and zoom state. It reads only `window.__ARCHI_STATIC_REPORT__` and local SVG paths.

### 3. Archive builder

A pure archive module accepts `StaticReportData` and a map of pre-rendered SVG strings, validates that every report view has exactly one SVG, serializes the fixed assets and projection, and creates the deterministic ZIP with the existing `fflate` dependency.

Projection and archive construction remain independently testable. The builder does not inspect application stores or render React.

### 4. Browser export coordinator

A UI-facing coordinator captures the active model, calls `renderViewSvg()` once for each view, builds the projection/archive, and saves it with `saveBlobToDisk()`. Rendering occurs before ZIP assembly so a failed view cannot produce a silently incomplete report.

A lightweight export dialog explains the artifact, shows the number of views, accepts an editable report filename, disables duplicate submission while generating, and reports a concise error through the existing application dialog/alert infrastructure. There are no inclusion or masking options in `OUTPUT-01`.

### 5. Toolbar and documentation integration

The Import/Export toolbar menu adds `Static HTML Report (.zip)…`. `PARITY.md` records Phase 3 as released in 1.5.0 and marks `OUTPUT-01` implemented but unreleased when the feature lands. The compatibility and user-guide documentation describe report contents, offline extraction, and the privacy boundary.

## Report experience

The report uses a responsive three-region layout:

- a left navigation region containing the model name, search field, and collapsible model tree;
- a central content region showing the selected view or object overview;
- a right details region showing type, specialization, documentation, properties, relations, and used-in-view links.

On narrow screens the navigation and details regions stack above and below the content instead of requiring a desktop-sized viewport.

### Initial route

The report opens the first view in model-tree order. If the model has no views, it opens the model summary. Reloading a valid hash route preserves that target.

### Deep links

Routes use percent-encoded native IDs:

```text
#view/<encoded-view-id>
#object/<encoded-object-id>
```

Supported object targets are the model, folders, elements, relationships, and views. Unknown or removed targets fall back to the initial route and show a non-blocking “Target not found” status.

### Search

Search is case-insensitive literal substring matching over names, documentation, type/specialization labels, and property keys/values. Results are grouped as Views, Elements, Relationships, and Folders; each group and the complete result set use deterministic name/ID ordering. Empty input restores the tree. No regular expressions or query language are part of `OUTPUT-01`.

### View presentation and zoom

Views display through a local `<img>` referencing the generated SVG. Controls provide Zoom out, current percentage/Actual size, Zoom in, and Fit. Zoom is local report state and does not alter the SVG file. Fit recalculates on view change and container resize; zoom is clamped from 20% through 400%.

### Object summaries and analysis

Element and relationship summaries show documentation and ordered properties. Relationship summaries link to their source and target. The analysis section links to each related relationship and each view using the concept. View summaries show viewpoint, documentation, properties, and the diagram.

Folder summaries list their immediate folders and objects. The model summary shows purpose/documentation, properties, and counts by object category.

## Security and privacy

- Model-controlled text is inserted with `textContent`; stored markup is displayed as text.
- The report executes only the fixed local report script.
- The report makes no network requests and includes no remote URLs as resource dependencies.
- HTTP/HTTPS text in documentation remains plain text in this slice; link activation belongs to `PROP-03` or a later explicitly secured report enhancement.
- The generated projection is allowlisted rather than created by serializing stores or `ModelState` wholesale.
- A content security policy limits scripts, styles, and images to the extracted report package and embedded image data.
- Export tests scan archive contents for representative browser-only keys and secrets and confirm they are absent.

The report necessarily contains the model content selected for export. The export dialog states this clearly; privacy guarantees concern browser-profile and application-only data, not the model itself.

## Error handling

- Export is disabled when no active model exists.
- An SVG render failure identifies the failing view by name and aborts the entire export.
- Projection/archive validation rejects a missing or duplicate view SVG.
- ZIP or disk-save failures keep the dialog open and use the existing error presentation.
- User cancellation from the save picker closes no stateful editor resource and does not report success.
- An empty model still produces a valid report with its model summary.
- Missing report data or an unsupported report schema version produces a readable error in `index.html`, not a blank page.
- Missing SVG files show a diagram-specific error while leaving navigation and summaries usable.

## Testing strategy

### Pure projection tests

- Produces the exact model/folder/concept/view hierarchy from a representative model.
- Preserves visible folder/item and property ordering.
- Generates relationship and used-in-view analysis links with deterministic ordering.
- Includes model-file documentation/properties while excluding diagram internals and browser-only state by construction.
- Handles duplicate names, empty documentation/properties, no views, recursive connection topology, profiles, and image-bearing models.

### Archive tests

- Contains exactly the required fixed assets and one assigned SVG per view.
- Repeated generation from identical input is byte-for-byte equal.
- Unsafe model IDs never become archive paths and unsafe model-name characters are sanitized from the suggested filename.
- `report-data.js` round-trips Unicode and adversarial strings such as `</script>`, quotes, and line separators without creating executable markup.
- Rejects missing, extra, or duplicate SVG assignments.
- Contains none of a sentinel token, extension-storage key, autosave key, or local settings key supplied only in the test environment.

### Report-shell DOM tests

- Boots from `window.__ARCHI_STATIC_REPORT__` without fetch.
- Opens the first view or model-summary fallback.
- Resolves valid view/object hashes and recovers from unknown targets.
- Tree and search navigation update the hash and visible summary.
- Search matches every approved field and uses deterministic grouping/order.
- Relationship endpoints and analysis links navigate correctly.
- Zoom controls clamp, select actual size, and fit the selected SVG.
- All model-controlled strings render as text rather than markup.
- Unsupported or missing data displays a readable error.

### UI integration tests

- The export menu item is disabled without a model and opens the report dialog with one.
- The dialog shows the view count, sanitizes the suggested filename, prevents duplicate export, handles cancellation, and surfaces a named-view render failure.
- The coordinator calls the shared SVG renderer for every view and the arbitrary-blob save adapter once with ZIP MIME metadata.

### End-to-end acceptance

- Run lint, typecheck, the full Vitest suite, Phase 1–3 parity verification, security audit, and production build through `npm run ci:check`.
- Export the Phase 3 fixture and Archisurance from headed Chrome or Edge.
- Extract each ZIP, open `index.html` through `file://`, and verify tree navigation, search, deep links, diagram zoom/Fit, object details, and analysis links without network access.
- Serve the same directory from a static HTTP server and repeat the primary navigation smoke.
- Verify an image-bearing Phase 1 view renders its embedded image offline.

## Acceptance criteria

The feature is complete when:

1. The active model exports as the documented deterministic ZIP package.
2. Extracted `index.html` works through `file://` and ordinary static hosting with no network request.
3. The model tree, literal search, stable deep links, object summaries, view display, zoom/Fit, and Phase 3 analysis links work as specified.
4. Every view is produced through the existing standalone SVG renderer, including embedded model images and current diagram semantics.
5. Model-controlled content cannot inject markup or script into the report shell.
6. The archive contains no browser-profile state, settings, extensions, scripts, file handles, share credentials, or tokens.
7. Missing/corrupt report inputs fail readably and export-time render failures cannot produce partial reports.
8. Focused tests and the complete repository quality gate pass.
9. `PARITY.md` and user documentation accurately describe Phase 3 release status and the new unreleased `OUTPUT-01` capability.

## Follow-on boundary

`OUTPUT-02` will extend the report projection with an explicit export policy, masking metadata, and a safe query index. It must not change the `file://` boot contract or permit model content to execute. `OUTPUT-04` can later reuse the generated standalone views and report print stylesheet without becoming part of this implementation.
