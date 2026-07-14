# Static HTML Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the active ArchiMate model as a deterministic offline ZIP report with model navigation, literal search, stable deep links, object summaries, standalone view SVGs, zoom controls, and Phase 3 analysis links.

**Architecture:** A pure model projection produces an allowlisted `StaticReportData` contract. A deterministic archive builder combines that projection with fixed report-shell assets and SVGs rendered through the existing `renderViewSvg()` path. A focused React dialog coordinates rendering and saving; the exported report itself is framework-free classic JavaScript so it works under `file://` without fetch or modules.

**Tech Stack:** TypeScript 5.7, React 18, Vitest/jsdom, `fflate`, existing SVG export and File System Access/download adapters.

## Global Constraints

- Add no dependency and no backend/runtime network requirement.
- The extracted report must work from `file://` and ordinary static HTTP hosting.
- Use only allowlisted model-file data; never serialize `ModelState`, Zustand stores, browser settings, extensions, scripts, file handles, share associations, or credentials wholesale.
- Use DOM `textContent` for all model-controlled report content; do not use `innerHTML`, `eval`, `Function`, dynamic script creation, or executable model markup.
- Use classic sibling scripts (`report-data.js` then `report.js`); do not use `fetch` or ES modules.
- Reuse `renderViewSvg()` for every diagram and keep model images embedded in the SVG.
- ZIP entries use lexical ordering, compression level 6, and `1980-01-01T00:00:00Z` timestamps.
- Native model IDs never become archive paths; view files are `views/view-NNNN.svg`.
- Deep links are `#view/<encodeURIComponent(id)>` and `#object/<encodeURIComponent(id)>`.
- Search is case-insensitive literal substring matching over name, documentation, type/specialization, and property keys/values.
- View zoom is clamped to 20%–400%; controls are zoom out, percentage/actual size, zoom in, and Fit.
- `OUTPUT-02` masking/query and `OUTPUT-04` print/PDF/additional formats remain out of scope.

---

### Task 1: Versioned report projection

**Files:**
- Create: `src/model/report/types.ts`
- Create: `src/model/report/project.ts`
- Test: `tests/static-report-project.test.ts`

**Interfaces:**
- Consumes: `ModelState`, `Property`, `modelRelations()`, `viewsUsing()`, `elementLabel()`, `relationshipLabel()`, and `viewpointName()`.
- Produces: `StaticReportData`, `StaticReportObject`, `STATIC_REPORT_SCHEMA_VERSION`, and `projectStaticReport(model: ModelState, productVersion: string): StaticReportData`.

- [ ] **Step 1: Write the failing projection contract tests**

Create a compact model with duplicate object names, a specialization, ordered properties, nested folders, one relationship, and two views. Assert the wished-for API:

```ts
const report = projectStaticReport(model, '1.5.0');
expect(report.schemaVersion).toBe(1);
expect(report.productVersion).toBe('1.5.0');
expect(report.model.rootFolderIds).toEqual(model.rootFolderIds);
expect(report.elements.find(({ id }) => id === actor.id)).toMatchObject({
  kind: 'element',
  typeLabel: 'Business Actor',
  specialization: 'Customer',
  properties: [{ key: 'Owner', value: 'Architecture' }],
});
expect(report.relationships[0]).toMatchObject({
  kind: 'relationship',
  sourceId: actor.id,
  targetId: service.id,
});
expect(report.analysis[actor.id]).toEqual({
  relationshipIds: [relationship.id],
  viewIds: [firstView.id, secondView.id],
});
expect(report.initialViewId).toBe(firstView.id);
expect(JSON.stringify(report)).not.toContain('nodes');
expect(JSON.stringify(report)).not.toContain('assets');
```

Also assert model/folder/view summaries, viewpoint display names, deterministic name/ID ordering for catalogs, exact folder/item order, an empty-model `initialViewId` of `undefined`, and no mutation of the source model.

- [ ] **Step 2: Run the projection tests and verify RED**

Run: `npx vitest run tests/static-report-project.test.ts`

Expected: FAIL because `src/model/report/project.ts` and its exports do not exist.

- [ ] **Step 3: Implement the report data types**

Define the exact public shape in `types.ts`:

```ts
export const STATIC_REPORT_SCHEMA_VERSION = 1;

export interface StaticReportProperty { key: string; value: string }
export interface StaticReportBase {
  id: string;
  name: string;
  documentation: string;
  properties: StaticReportProperty[];
}
export interface StaticReportModel extends StaticReportBase {
  kind: 'model';
  rootFolderIds: string[];
  counts: { folders: number; elements: number; relationships: number; views: number };
}
export interface StaticReportFolder extends StaticReportBase {
  kind: 'folder';
  parentId: string | null;
  folderIds: string[];
  itemIds: string[];
}
export interface StaticReportElement extends StaticReportBase {
  kind: 'element';
  typeLabel: string;
  specialization?: string;
  folderId: string;
}
export interface StaticReportRelationship extends StaticReportBase {
  kind: 'relationship';
  typeLabel: string;
  specialization?: string;
  folderId: string;
  sourceId: string;
  targetId: string;
}
export interface StaticReportView extends StaticReportBase {
  kind: 'view';
  folderId: string;
  viewpoint: string;
  svgPath: string;
}
export interface StaticReportAnalysis {
  relationshipIds: string[];
  viewIds: string[];
}
export type StaticReportObject = StaticReportModel | StaticReportFolder
  | StaticReportElement | StaticReportRelationship | StaticReportView;
export interface StaticReportData {
  schemaVersion: typeof STATIC_REPORT_SCHEMA_VERSION;
  productVersion: string;
  model: StaticReportModel;
  folders: StaticReportFolder[];
  elements: StaticReportElement[];
  relationships: StaticReportRelationship[];
  views: StaticReportView[];
  analysis: Record<string, StaticReportAnalysis>;
  initialViewId?: string;
}
```

- [ ] **Step 4: Implement the pure projection**

Clone every property and ID array. Generate `views/view-${String(index + 1).padStart(4, '0')}.svg` from views in deterministic tree-first order. Use a visited set during folder traversal, append orphaned views by name/ID, resolve the first assigned profile name as specialization, and build analysis records for every element and relationship from the shared Phase 3 helpers.

- [ ] **Step 5: Run the projection tests and verify GREEN**

Run: `npx vitest run tests/static-report-project.test.ts`

Expected: PASS with no warnings.

---

### Task 2: Deterministic archive and safe report-data serialization

**Files:**
- Create: `src/model/report/shell.html`
- Create: `src/model/report/shell.css`
- Create: `src/model/report/shell.js`
- Create: `src/model/report/assets.ts`
- Create: `src/model/report/archive.ts`
- Test: `tests/static-report-archive.test.ts`

**Interfaces:**
- Consumes: `StaticReportData`, `REPORT_HTML`, `REPORT_CSS`, `REPORT_JS`, `fflate.strToU8()`, and `fflate.zipSync()`.
- Produces: `serializeStaticReportData(data: StaticReportData): string`, `createStaticReportArchive(data: StaticReportData, svgByViewId: ReadonlyMap<string, string>): Uint8Array`, and fixed report assets imported through Vite's existing `?raw` support.

- [ ] **Step 1: Write failing archive tests**

Assert exact entries, fixed filenames, byte determinism, safe serialization, and validation:

```ts
const svgs = new Map(report.views.map((view) => [view.id, `<svg id="${view.id}"/>`]));
const first = createStaticReportArchive(report, svgs);
const second = createStaticReportArchive(report, svgs);
expect(first).toEqual(second);
const entries = unzipSync(first);
expect(Object.keys(entries).sort()).toEqual([
  'index.html', 'report-data.js', 'report.css', 'report.js',
  ...report.views.map((view) => view.svgPath),
].sort());
expect(strFromU8(entries['report-data.js'])).toContain('window.__ARCHI_STATIC_REPORT__ = ');
expect(() => createStaticReportArchive(report, new Map())).toThrow(/missing SVG/i);
expect(() => createStaticReportArchive(report, new Map([...svgs, ['extra', '<svg/>']]))).toThrow(/unexpected SVG/i);
```

Use adversarial model strings containing `</script>`, quotes, emoji, U+2028/U+2029, `innerHTML`, `localStorage`, and a sentinel token. Parse the assignment payload back as JSON without executing it, assert the model text survives exactly, and assert browser-only sentinel values supplied outside the model do not appear in any archive entry.

- [ ] **Step 2: Run archive tests and verify RED**

Run: `npx vitest run tests/static-report-archive.test.ts`

Expected: FAIL because the archive and asset modules do not exist.

- [ ] **Step 3: Implement safe serialization and deterministic ZIP assembly**

Use JSON serialization in a sibling JavaScript file, not an inline script:

```ts
export function serializeStaticReportData(data: StaticReportData): string {
  return `window.__ARCHI_STATIC_REPORT__ = ${JSON.stringify(data, null, 2)};\n`;
}

const ZIP_MTIME = new Date(Date.UTC(1980, 0, 1));
const entries: Zippable = {};
for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  entries[path] = [strToU8(content), { level: 6, mtime: ZIP_MTIME }];
}
return zipSync(entries, { level: 6 });
```

Validate the SVG map's keys against `data.views` before assembly.

- [ ] **Step 4: Add the minimal fixed HTML shell**

`REPORT_HTML` must contain the CSP, accessible landmarks, sibling asset references in this exact order, and boot/error hosts:

```html
<link rel="stylesheet" href="report.css">
<script src="report-data.js" defer></script>
<script src="report.js" defer></script>
<body>
  <div id="report-app" aria-live="polite"></div>
  <noscript>This report requires JavaScript for navigation.</noscript>
</body>
```

Import the three shell files with `?raw` in `assets.ts` and export them as `REPORT_HTML`, `REPORT_CSS`, and `REPORT_JS`. Set the CSS and JavaScript files initially to minimal valid content so archive tests pass; Task 3 completes the report experience test-first.

- [ ] **Step 5: Run archive and projection tests and verify GREEN**

Run: `npx vitest run tests/static-report-project.test.ts tests/static-report-archive.test.ts`

Expected: PASS with byte-for-byte equal archives.

---

### Task 3: Framework-free report shell

**Files:**
- Modify: `src/model/report/shell.css`
- Modify: `src/model/report/shell.js`
- Test: `tests/static-report-shell.test.ts`

**Interfaces:**
- Consumes: `window.__ARCHI_STATIC_REPORT__: StaticReportData`, browser DOM/hash/resize events, and generated local SVG paths.
- Produces: the complete raw-imported `REPORT_CSS` and self-booting `REPORT_JS` artifact strings.

- [ ] **Step 1: Write failing shell boot and routing tests**

Create a helper that installs the exported HTML body in jsdom, assigns a projected fixture to `window.__ARCHI_STATIC_REPORT__`, evaluates `REPORT_JS`, and dispatches `DOMContentLoaded`. Assert:

```ts
expect(document.querySelector('[data-report-shell]')).not.toBeNull();
expect(document.querySelector('[data-active-view]')?.getAttribute('src')).toBe('views/view-0001.svg');
expect(document.querySelector('[data-report-title]')?.textContent).toBe(report.model.name);
window.location.hash = `#object/${encodeURIComponent(actor.id)}`;
window.dispatchEvent(new HashChangeEvent('hashchange'));
expect(document.querySelector('[data-detail-name]')?.textContent).toBe(actor.name);
```

Also assert the no-view model fallback, unsupported schema error, missing data error, and unknown hash fallback/status.

- [ ] **Step 2: Run the focused shell tests and verify RED**

Run: `npx vitest run tests/static-report-shell.test.ts`

Expected: FAIL because the minimal report script does not build the approved shell or resolve routes.

- [ ] **Step 3: Implement accessible shell construction and hash routing**

Use an IIFE with small helpers `element(tag, className?, text?)`, `button(label, action)`, `objectById(id)`, `routeFromHash()`, `navigate(kind, id)`, and `renderRoute()`. Every model string must reach the DOM only through `textContent`. Build the navigation, content, details, and status regions once; route changes replace their children without replacing the shell.

- [ ] **Step 4: Run shell tests and verify GREEN**

Run: `npx vitest run tests/static-report-shell.test.ts`

Expected: the boot/routing/error group passes.

- [ ] **Step 5: Write failing tree, search, and analysis tests**

Assert nested folders preserve model order; empty search restores the tree; literal search groups Views, Elements, Relationships, Folders; search matches documentation/type/specialization/properties; duplicate names use ID tie-breaking; relationship source/target buttons and analysis buttons set the expected hashes; and an adversarial `<img onerror=...>` name is visible text with no created `<img>`.

- [ ] **Step 6: Implement tree, literal search, summaries, and analysis links**

Build lookup maps once, recurse only through known folder IDs with a visited set, and render empty groups only when useful. Render model counts, folder children/items, view viewpoint/properties, element/relationship type and specialization, relationship endpoint links, model relations, and used-in-view links from the projection.

- [ ] **Step 7: Run shell tests and verify GREEN**

Run: `npx vitest run tests/static-report-shell.test.ts`

Expected: navigation/search/summary/security groups pass.

- [ ] **Step 8: Write failing zoom and responsive-contract tests**

Assert the HUD contains buttons named `Zoom out`, `Actual size`, `Zoom in`, and `Fit`; repeated clicks clamp displayed zoom to `20%` and `400%`; Actual size selects `100%`; a view change returns to Fit; and CSS contains the approved three-region grid, narrow-screen media query, visible focus rules, quiet Archi-inspired palette, and reduced-motion rule.

- [ ] **Step 9: Implement zoom/Fit behavior and final report styling**

Maintain `{ mode: 'fit' | 'manual'; zoom: number }`, use CSS transforms only in manual mode, set `object-fit: contain` in Fit mode, clamp to `0.2..4`, and recompute Fit presentation on view change/resize without mutating report data. Style a restrained slate/blue interface using system fonts, clear hierarchy, strong focus rings, and no animation dependency.

- [ ] **Step 10: Run all shell/archive tests and verify GREEN**

Run: `npx vitest run tests/static-report-shell.test.ts tests/static-report-archive.test.ts`

Expected: PASS with no console errors or warnings.

---

### Task 4: Export coordinator, dialog, and toolbar entry

**Files:**
- Create: `src/ui/StaticReportExportDialog.tsx`
- Modify: `src/ui/Toolbar.tsx`
- Modify: `src/styles.css`
- Test: `tests/static-report-ui.test.ts`

**Interfaces:**
- Consumes: `projectStaticReport()`, `renderViewSvg()`, `createStaticReportArchive()`, `saveBlobToDisk()`, `sanitizeFileName()`, `showAlertDialog()`, `APP_VERSION` from `src/version.ts`, and the active `ModelState`.
- Produces: `staticReportFileName(modelName: string): string`, `renderStaticReportViews(model: ModelState, views: readonly StaticReportView[], render?: typeof renderViewSvg): ReadonlyMap<string, string>`, `exportStaticReport(model: ModelState, fileName: string, dependencies?: StaticReportExportDependencies): Promise<boolean>`, and `StaticReportExportDialog`.

```ts
export interface StaticReportExportDependencies {
  renderView?: typeof renderViewSvg;
  save?: typeof saveBlobToDisk;
}
export interface StaticReportExportDialogProps {
  onClose: () => void;
  exportReport?: typeof exportStaticReport;
}
```

- [ ] **Step 1: Write failing coordinator tests**

Inject real lightweight functions instead of module mocks:

```ts
const rendered: string[] = [];
const saved: Array<{ name: string; type: string }> = [];
expect(staticReportFileName('A/B:*? Model')).toBe('A_B____ Model-html-report.zip');
const result = await exportStaticReport(model, 'stakeholder-report.zip', {
  renderView: (_model, viewId) => { rendered.push(viewId); return { svg: `<svg id="${viewId}"/>`, width: 1, height: 1 }; },
  save: async (blob, name) => { saved.push({ name, type: blob.type }); return true; },
});
expect(result).toBe(true);
expect(rendered).toEqual(projectStaticReport(model, APP_VERSION).views.map(({ id }) => id));
expect(saved).toEqual([{ name: 'stakeholder-report.zip', type: 'application/zip' }]);
```

Assert cancellation returns `false`, save is called once, an unknown/missing view render aborts before save, and the thrown error names the failed view.

- [ ] **Step 2: Run coordinator tests and verify RED**

Run: `npx vitest run tests/static-report-ui.test.ts`

Expected: FAIL because the dialog/coordinator module does not exist.

- [ ] **Step 3: Implement coordinator functions**

Project first to obtain the exact view order, pass the projected views to `renderStaticReportViews()`, render each view synchronously with a white background, wrap failures as `Could not render view "<name>": <message>`, create an `application/zip` Blob from a sliced `ArrayBuffer`, and pass ZIP save metadata to `saveBlobToDisk()`.

- [ ] **Step 4: Run coordinator tests and verify GREEN**

Run: `npx vitest run tests/static-report-ui.test.ts`

Expected: coordinator tests pass.

- [ ] **Step 5: Write failing dialog/toolbar tests**

Mount `Toolbar` with no model and with an active model. Open the Import/Export menu through its toolbar button and assert `Static HTML Report (.zip)…` appears only enabled with a model. Activate it and assert a modal named `Export static HTML report` shows the exact view count, privacy copy, editable `.zip` filename, Cancel, and Export buttons. Mount the dialog directly with an injected deferred `exportReport`, click Export twice while it is pending, and assert only one export starts.

- [ ] **Step 6: Implement the dialog and toolbar wiring**

Add `showStaticReport` state, the export-menu item after CSV export and before import actions, and conditional dialog rendering. Follow `ExportImageDialog`'s portal/modal/error pattern. Keep the modal open on errors, close only after a successful save, disable inputs/buttons while busy, and normalize user input to a non-empty `.zip` filename.

- [ ] **Step 7: Add focused editor styling**

Reuse `.modal`, `.export-row`, and `.export-actions`; add only report-specific summary/privacy/filename styles with existing application tokens. Do not style the exported report in `src/styles.css`.

- [ ] **Step 8: Run UI and related toolbar tests and verify GREEN**

Run: `npx vitest run tests/static-report-ui.test.ts tests/toolbar-icons.test.ts tests/view-image.test.ts`

Expected: PASS with no React `act()` warnings.

---

### Task 5: Parity contract and user documentation

**Files:**
- Modify: `PARITY.md`
- Modify: `docs/wiki/Archi-Compatibility.md`
- Modify: `docs/wiki/Import-and-Export.md`
- Modify: `docs/wiki/User-Guide.md`
- Test: existing `npm run docs:check`

**Interfaces:**
- Consumes: the implemented archive contract and verified UI labels.
- Produces: accurate Phase 3 release status and `OUTPUT-01` usage/privacy documentation.

- [ ] **Step 1: Update parity status**

Change the baseline from the Phase 2 release candidate to version 1.5.0, add a Phase 3 status section naming the five completed IDs, change each Phase 3 item from `Implemented (unreleased)` to `Completed in 1.5.0`, change the Phase 3 roadmap sentence to released, and mark `OUTPUT-01` as `Implemented (unreleased)` with its actual package/feature description.

- [ ] **Step 2: Document the report workflow**

Document `Import/Export → Static HTML Report (.zip)…`, extraction before opening, `index.html`, local/static-host operation, navigation/search/deep-link/zoom/analysis behavior, embedded view images, and the explicit rule that model content is included while browser settings, extensions, scripts, autosave, file handles, share associations, and credentials are excluded.

- [ ] **Step 3: Run documentation verification**

Run: `npm run docs:check`

Expected: all wiki links, headings, and generated navigation checks pass.

---

### Task 6: Full verification and offline browser acceptance

**Files:**
- Modify only if verification exposes a report defect: the report source/test files above.
- Do not commit `dist/`, `.playwright-cli/`, extracted reports, screenshots, or temporary browser artifacts.

**Interfaces:**
- Consumes: all implemented feature slices.
- Produces: fresh automated and browser evidence for every acceptance criterion.

- [ ] **Step 1: Run focused report tests**

Run: `npx vitest run tests/static-report-project.test.ts tests/static-report-archive.test.ts tests/static-report-shell.test.ts tests/static-report-ui.test.ts`

Expected: all focused tests pass with no warnings.

- [ ] **Step 2: Run the full repository gate**

Run: `npm run ci:check`

Expected: version sync, docs, lint, typecheck, full Vitest, Phase 1–3 parity checks, security audit, license distribution, and production build all exit 0.

- [ ] **Step 3: Export and inspect real fixtures in a headed browser**

Start the development server, open the Phase 3 fixture and Archisurance, export each report, extract to a temporary directory outside the repository, and open `index.html` through `file://`. Verify the initial view, nested tree, search, direct view/object hashes, relationship endpoints, used-in-view links, Zoom/Fit/Actual size, and no network requests.

- [ ] **Step 4: Verify static-host and image-bearing behavior**

Serve the same extracted report directory with a local static server and repeat the primary route/search smoke. Export the image-bearing Phase 1 fixture and confirm its model image renders with networking disabled.

- [ ] **Step 5: Audit archive privacy and repository state**

Inspect archive entry names and text for browser-local storage keys, representative sentinel secrets, external URLs/resources, and unexpected files. Run `git status --short` and `git diff --check`; confirm no generated artifacts or unrelated changes are present.

- [ ] **Step 6: Record actual verification evidence in the handoff**

Report exact test/build/browser commands, pass counts, browser routes exercised, and any environmental limitation. Do not claim completion unless the fresh outputs satisfy every acceptance criterion.
