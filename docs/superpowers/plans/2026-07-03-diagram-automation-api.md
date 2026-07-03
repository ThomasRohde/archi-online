# Diagram Automation API Implementation Plan

## Goal

Implement the approved diagram automation API for scripts and extensions so
layout-style extensions can discover views, inspect selections, traverse
diagram visuals, edit connection routes, and apply bulk layout changes.

## Tasks

1. Add failing tests for jArchi wrappers:
   - view node and connection traversal
   - visual parent/children/absolute bounds
   - connection raw bendpoints and absolute route helpers
   - bulk layout with absolute-to-relative bounds conversion
   - invalid layout IDs and malformed route input
2. Add failing tests for extension app APIs:
   - `app.views.active/get/open/all`
   - `app.selection.ids/items/visuals/clear`
   - packaged command calling `app.views.active().layout(...)`
3. Add a transactional bulk diagram layout model operation.
4. Implement wrapper helpers on `JView`, `JVisual`, and `JConnection`.
5. Expose `app.views` and `app.selection` through the extension app API.
6. Update Monaco/jArchi declarations for the new scripting surface.
7. Run focused tests, then full verification:
   - `npm test`
   - `npm run typecheck`
   - `npm run build`

## Notes

- Layout inputs use absolute view-space coordinates; stored node bounds remain
  parent-relative.
- Raw bendpoints keep the existing Archi/GEF format.
- Absolute route helpers reuse the same geometry assumptions as canvas
  rendering.
- Settings continue to live outside the model; this API mutates only model
  view content through normal transactions.
