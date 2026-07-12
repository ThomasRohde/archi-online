# Archi 5.9 Phase 1 rendering checklist

Compatibility oracle: Archi `5.9.0.202604140726` at `C:\Program Files\Archi`.

Certification completed on July 12, 2026. Desktop Archi loaded and saved the
Online ZIP fixture without a compatibility prompt; normalized semantics plus the
archive asset hash matched. The Golden View was then opened and inspected in the
Desktop GUI using native Windows input and window capture after the Computer Use
runtime could not start. Archi Online was inspected in a real Chromium session.

| Check | Archi 5.9 | Archi Online |
| --- | --- | --- |
| Element and relationship specializations load | Verified | Verified |
| Profile and custom images render | Verified | Verified |
| Image positions 0 through 9 render | Verified | Verified |
| Group, note, view-reference, and standalone images render | Verified | Verified |
| Gradients none/top/left/right/bottom render | Verified | Verified |
| Solid, dashed, dotted, and hidden outlines render | Verified | Verified |
| Normal, medium, and heavy widths render | Verified | Verified |
| Icon visibility and icon colors render | Verified | Verified |
| Font family, point size, bold, and italic render | Verified | Verified |
| Label expression families and prefixes render | Verified | Verified |
| Dublin Core metadata and specialization Exchange export validate | Verified by local XSD test | Verified by local XSD test |

Automated source-semantic comparison is performed by `npm run verify:phase1` and
`tests/phase1-fixtures.test.ts`. Manual checks record visual equivalence only;
they are not a substitute for normalized semantic and asset-hash comparison.

During the first GUI pass, Desktop correctly rejected an `imagePosition`
attribute on `DiagramModelImage`, which does not implement Archi's `IIconic`
interface. The serializer and regression test were corrected so standalone
images omit that unsupported attribute; the regenerated fixture then opened
without a prompt.
