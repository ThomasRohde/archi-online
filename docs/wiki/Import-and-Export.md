# Import & Export

Archi Online reads and writes the same interchange formats as desktop Archi,
and can render any view to an image. Everything is client-side — no files
leave the browser except the ones you deliberately save.

## View images

Open the **Import/Export ▾** menu on the toolbar (or use it while a view is
active):

- **View as image…** opens a dialog to export the current view as **PNG**
  (at 1×, 2×, or 4× scale) or **SVG**, with a white or transparent
  background. The image is rendered from the same figures as the canvas, so
  it is pixel-faithful; labels are written as real SVG text, so the SVG is
  self-contained and the PNG is not tainted.
- **Copy view as image** copies a PNG of the current view straight to the
  system clipboard, ready to paste into slides or chat. Where a browser does
  not support image clipboard writes, use **View as image…** instead.

## Presentation mode

The toolbar **Present** button opens a full-screen, chrome-free walkthrough
of the model's views:

- **←/→**, **PgUp/PgDn**, or **Space** step between views (in model-tree
  order); **Home/End** jump to the first/last.
- Pan and zoom work as in the read-only viewer.
- A small heads-up display shows the view name and position, then fades.
- **Esc** (or leaving browser full-screen) exits back to the editor with the
  layout untouched.

## ArchiMate Open Exchange format

The [Open Exchange format](https://www.opengroup.org/xsd/archimate/) is the
vendor-neutral ArchiMate 3 interchange XML.

- **Open** — the normal **Open…** dialog accepts `.xml` Open Exchange files
  as well as `.archimate` files; the format is detected automatically. An
  Open Exchange file is imported as a **new, unsaved** model (as in desktop
  Archi), so a later `Ctrl+S` saves it as `.archimate` rather than
  overwriting the source.
- **Export** — **Import/Export ▾ → Model to Open Exchange (.xml)…** opens the
  Archi 5.9 export options. Folder organization and local XSD validation are on
  by default; language defaults to `en`; all 15 Dublin Core fields are editable;
  and schema copying is optional. Invalid output is not written. When schema
  copying is selected, one directory choice receives the XML and five official
  XSDs where supported, with individual downloads as the fallback.

The mapping is ported from Archi's own exporter/importer, including
viewpoints, junctions, property definitions, optional folder organization,
absolute diagram coordinates, styles, bendpoints, access/influence/association
attributes, ISO-639 language, Dublin Core metadata, and Archi 5.9
specialization definitions and assignments. Import returns structured warnings
and errors and never applies a partial model.

## CSV

Archi's CSV format is three files — `elements.csv`, `relations.csv`, and
`properties.csv` — that round-trip with desktop Archi.

- **Export** — **Import/Export ▾ → Model to CSV…** offers the delimiter
  (comma/semicolon/tab), a filename prefix, a UTF-8 BOM toggle, newline
  stripping, and Excel-safety quoting. Where the browser supports it, all
  three files are written to a folder you pick; otherwise each is
  downloaded. Concept attributes such as access type, influence strength,
  association direction, and junction type are written as special
  properties, exactly as Archi does.
- **Import** — **Import/Export ▾ → Import CSV into model…** lets you select
  one to three CSV files (matched by the `elements`/`relations`/`properties`
  suffix in their names). Comma, semicolon, and tab delimiters are detected
  automatically. Objects are matched to the current model by ID: existing
  ones are updated in place and new ones are created, with relationships
  validated against the ArchiMate rules. Specializations are created or
  assigned from the Archi columns. The report distinguishes created, updated,
  unchanged, profile, property, warning, and error counts. The whole import is
  a single undo step, and any illegal ID, record length, endpoint update,
  duplicate relationship, or other error aborts it without changing the model.

## What does not leave the browser

Image, Open Exchange, and CSV export all run locally; the files are produced
in the page and handed to the browser's save/download. See the
[[User Guide|User-Guide]] for link- and gist-based model sharing.
