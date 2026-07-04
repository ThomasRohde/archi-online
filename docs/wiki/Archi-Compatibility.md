# Archi Compatibility

Archi Online treats fidelity to desktop
[Archi](https://www.archimatetool.com/) as its specification. This page
explains what that means in practice when you move models between the two
tools.

## Same file format

Both tools read and write the same native `.archimate` XML. A model saved in
Archi Online opens in desktop Archi and vice versa — element ids, folder
structure, view layouts, colors, and key-value properties are preserved.

Round-trip fidelity is verified in the test suite against Archi's official
*Archisurance* example model: parsing and re-serializing it reproduces the
original file.

Two details worth knowing:

- **Bendpoints** are stored in Archi's relative offset format
  (`startX`/`startY`/`endX`/`endY`), exactly as desktop Archi writes them, so
  manually routed connections survive the round trip.
- **Browser-local data** (settings, scripts, extensions, autosave, layout) is
  never written into `.archimate` files — files stay clean for exchange.

## Same metamodel and rules

- The full **ArchiMate 3.2** metamodel: every element type across Strategy,
  Business, Application, Technology, Physical, Motivation, and
  Implementation & Migration layers, plus Junction, and all relationship
  types.
- The **allowed-relationship matrix** is generated directly from Archi's own
  `relationships.xml` data file, so relationship validity — including what
  the magic connector offers — matches desktop Archi exactly.
- **Default sizes and fill colors** for new elements follow Archi's defaults.

## Same figures

Element figures are ported from Archi's Java source rather than redrawn:

- Each element supports the same two figure variants as Archi — the default
  box/rounded box with a corner icon (octagon for motivation elements) and
  the classic notation shape. Switch per object via **Figure** in the
  Properties panel.
- Corner icons are 1:1 transcriptions of Archi's icon-drawing code.

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
