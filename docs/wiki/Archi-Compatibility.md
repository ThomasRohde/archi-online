# Archi Compatibility

Archi Online treats fidelity to desktop
[Archi](https://www.archimatetool.com/) as its specification. This page
explains what that means in practice when you move models between the two
tools.

## Same file format

Both tools read and write the same native `.archimate` document. Asset-free
models are plain XML; image-bearing models are Desktop-compatible ZIP archives
with `model.xml` and referenced `images/*` entries. A model saved in Archi
Online opens in Desktop Archi and vice versa — element ids, folders, view
layouts, specializations, images, label expressions, complete Phase 1
appearance, Dublin Core metadata, key-value properties, recursive connection
endpoints, router modes and dormant bendpoints, note connections, and native
legend configuration are preserved.

Round-trip fidelity is verified against Archi's official *Archisurance* model
plus reciprocal Phase 1 and Phase 2 fixtures. The Phase 2 pair consists of an
Online-authored source contract and a separately hand-authored Desktop-native
source, semantic contract, and frozen Desktop 5.9 load/save golden.
`npm run verify:phase2` checks both contracts on every platform.
`npm run verify:phase2:desktop` requires exact Desktop Archi
`5.9.0.202604140726`, rebuilds the frozen Desktop golden from its hand-authored
source in a temporary path, requires exact Desktop output bytes and independent
source semantics, round-trips both fixtures, and proves committed evidence did
not change.

Phase 3 adds a frozen Online analysis/reuse fixture. `npm run verify:phase3`
checks deterministic graph traversal, typed validator results, import/merge
preview, native model round-trip, the exact template entry contract, and fresh
IDs when a template creates a model. `npm run verify:phase3:desktop` additionally
requires the pinned Desktop 5.9 build and load/saves the standard nested
`model.archimate` payload through Desktop in a temporary directory.

Two details worth knowing:

- **Bendpoints** are stored in Archi's relative offset format
  (`startX`/`startY`/`endX`/`endY`), exactly as desktop Archi writes them, so
  manually routed connections survive the round trip.
- **Connection endpoints** retain node-to-connection, connection-to-node, and
  recursive connection chains. Endpoint cycles and missing targets are rejected
  atomically instead of being repaired silently.
- **Routers** use Desktop's native manual (`0`) and Manhattan (`2`) values.
  Switching to Manhattan does not delete stored manual bendpoints.
- **Images** retain their original PNG, JPEG, GIF, TIFF, BMP, or ICO bytes.
  Browser-incompatible sources use a derived PNG only for rendering. Assets are
  deduplicated and are included in autosave, sharing, viewer, and export flows.
- **Browser-local data** (settings, scripts, extensions, autosave, layout) is
  never written into `.archimate` files — files stay clean for exchange.

## Same interchange formats

Archi Online also implements desktop Archi's interchange workflows:

- **ArchiMate Open Exchange `.xml`** — **Open…** imports vendor-neutral
  ArchiMate 3 exchange files as new, unsaved models, and **Import/Export ▾ →
  Model to Open Exchange (.xml)…** writes the current model back to the
  exchange format.
- **Archi CSV** — **Import/Export ▾ → Model to CSV…** writes
  `elements.csv`, `relations.csv`, and `properties.csv`; **Import CSV into
  model…** updates or creates objects by ID in a single undoable operation.

The Open Exchange importer/exporter preserves concepts, relationships, folders,
views, viewpoints, diagram coordinates, styles, property definitions,
language-tagged values, all 15 Dublin Core fields, folder organization, and
specialization properties. Export can validate locally against the five
bundled Archi 5.9 schemas and optionally copy them beside the XML. CSV
import/export follows Archi's three-file schema, including specialization
creation and assignment, special relationship properties, duplicate rejection,
and atomic failure. See [[Import & Export|Import-and-Export]] for the workflows.

Archi Online also reads and writes Desktop-shaped `.architemplate` ZIP files:
`manifest.xml`, nested `model.archimate`, and optional numbered
`Thumbnails/*.png` entries. The optional `archi-online.json` catalog ID and
categories are ignored by Desktop. Template export and model creation each
remap every model/object ID while preserving profiles, assets, views, styling,
and recursive connection topology.

## Same static HTML report outcome

**Import/Export ▾ → Static HTML Report (.zip)…** produces a self-contained
offline report package with model-tree navigation, literal search, stable
view/object deep links, object documentation and properties, Model Relations,
Used in Views, and shared-renderer SVG diagrams with zoom controls. Extracted
`index.html` opens through `file://` or static hosting without Archi Online, a
server runtime, or network requests.

This implements Desktop's portable navigable-report outcome with a web-native
static package. Report masking and query tools remain tracked separately as
`OUTPUT-02`. The report includes the selected model content but excludes
browser-profile data such as settings, extensions, scripts, autosave, file
handles, sharing credentials, tokens, dock layout, and undo history.

## Same metamodel and rules

- The full **ArchiMate 3.2** metamodel: every element type across Strategy,
  Business, Application, Technology, Physical, Motivation, and
  Implementation & Migration layers, plus Junction, and all relationship
  types.
- The **allowed-relationship matrix** is generated directly from Archi's own
  `relationships.xml` data file, so relationship validity — including what
  the magic connector offers — matches desktop Archi exactly. The connector
  supports forward/reverse choices, semantic relationship reuse, atomic target
  creation on canvas or in Groups, desktop menu polarity, and sticky palette
  tools.
- **Automatic Relationship Management** uses Desktop-compatible normal,
  reverse, and hidden-while-nested relationship masks. The preferences are
  browser-local; the relationships, containment, and occurrences they create
  are ordinary native model data.
- **Set Concept Type**, relationship inversion, advanced tree search,
  previewed find/replace, and global property-key operations use one reviewed,
  undoable transaction and stay isolated to the captured model session.
- **Default sizes and fill colors** for new elements follow Archi's defaults.
- Native Archi 5.8/5.9 **legends** round-trip as Note figures with the exact
  `legend` feature encoding. Their contents are derived live from recursively
  nested element and relationship occurrences, including primary
  specializations, and render identically in the editor, read-only viewer,
  outline, and image export. Older Archi versions safely see a blank Note
  named `Legend`; the existing C4 textual legend remains a separate feature.
- The **viewpoint definitions** (which element types each ArchiMate viewpoint
  allows) are ported from Archi's `viewpoints.xml`; the palette greys out
  disallowed element types on views that declare a viewpoint, matching
  desktop Archi's default behavior.
- The **model Validator** pins the eight desktop Archi 5.9 Hammer checkers (illegal
  relationships, unused elements and relationships, duplicate names, viewpoint
  violations, empty views, nested-element and junction checks), keeping Archi's
  fixed severities. Its configurable rule toggles are browser-local. Additional
  ID/reference/folder/view/topology checks are explicitly labelled **Model
  integrity**, not presented as Desktop Hammer rules. See [[User Guide|User-Guide]].
- The **Navigator**, graphical **Visualiser**, **Generate View For**, the
  Properties panel's **Analysis** tab, and tree
  **Duplicate** (`Ctrl+D`) follow their desktop Archi counterparts'
  semantics. See [[User Guide|User-Guide]].

## Same figures

Element figures are ported from Archi's Java source rather than redrawn:

- Each element supports the same two figure variants as Archi — the default
  box/rounded box with a corner icon (octagon for motivation elements) and
  the classic notation shape. Switch per object via **Figure** in the
  Properties panel.
- Corner icons are 1:1 transcriptions of Archi's icon-drawing code.
- Diagram appearance includes Desktop gradients, solid/dashed/dotted/hidden
  outlines, normal/medium/heavy widths, fill/line/font opacity and color, icon
  visibility and color, derived line color, ten image positions, and editable
  font family, point size, bold, and italic.
- Label expressions follow the Archi 5.9 grammar, prefixes, recursive ten-pass
  evaluation, and visible diagnostics without preventing a view from loading.

## Known limitations

- A deeply nested create-target menu can overlap an earlier menu column near
  the right edge of a narrow browser viewport. Keyboard arrows and `Enter`
  remain fully supported, and placing the target farther left avoids the
  overlap. This does not affect the created model data.

- **Sketch and Canvas views** (desktop Archi extras outside the ArchiMate
  standard) are not supported. They are skipped when a file is opened —
  and therefore **dropped if you re-save that file from Archi Online**. Keep
  a copy, or keep models containing Sketch/Canvas views in desktop Archi.
- Anything else desktop Archi writes that Archi Online does not model is
  likewise not preserved across a re-save. The safe workflow for mixed-tool
  teams is to check the file into version control (the XML diffs cleanly)
  so nothing is lost silently.

## Scripting compatibility

The scripting API follows [jArchi](https://github.com/archimatetool/archi-scripting-plugin)
conventions — selectors, collections, wrappers, and creation APIs — so many
jArchi scripts run unchanged. Desktop-platform APIs (file system, Java
interop, external script loading) are not available in the browser. See
[[Scripting API|Scripting-API]] for the exact surface.

Scripts are stored and exchanged as `.ajs` files, the same extension jArchi
uses.

Related pages:

- [[Getting Started|Getting-Started]] — opening and saving files.
- [[Development]] — how fidelity is maintained (generated rules, round-trip
  tests).
