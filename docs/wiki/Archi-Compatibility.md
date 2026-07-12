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
appearance, Dublin Core metadata, and key-value properties are preserved.

Round-trip fidelity is verified against Archi's official *Archisurance* model
and reciprocal Phase 1 fixtures. `npm run verify:phase1:desktop` asks the
installed Archi 5.9 command-line application to load and save the Online
fixture, then compares normalized source semantics and archive asset hashes.

Two details worth knowing:

- **Bendpoints** are stored in Archi's relative offset format
  (`startX`/`startY`/`endX`/`endY`), exactly as desktop Archi writes them, so
  manually routed connections survive the round trip.
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
- **Default sizes and fill colors** for new elements follow Archi's defaults.
- The **viewpoint definitions** (which element types each ArchiMate viewpoint
  allows) are ported from Archi's `viewpoints.xml`; the palette greys out
  disallowed element types on views that declare a viewpoint, matching
  desktop Archi's default behavior.
- The **model Validator** ports desktop Archi's validator checkers (illegal
  relationships, unused elements and relationships, duplicate names, viewpoint
  violations, empty views, nested-element and junction checks), keeping Archi's
  severities and messages. See [[User Guide|User-Guide]].
- The **Navigator**, the Properties panel's **Analysis** tab, and tree
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
