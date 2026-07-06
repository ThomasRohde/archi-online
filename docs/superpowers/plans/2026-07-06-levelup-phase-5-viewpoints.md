# Levelup Phase 5 — Viewpoint enforcement in the palette

**Goal:** Port Archi's `ViewpointManager` so palette element entries not allowed
by the active view's viewpoint are greyed out and inert — Archi's default behavior.

**Why:** Views already store a `viewpoint` id (`setViewpoint`, Properties field),
but nothing enforces it. Closes the next desktop-Archi parity gap. Read-only
enforcement — no model mutation, no `.archimate` format change. Phase 6 (Validator)
reuses the ported table + `isAllowedElementInViewpoint`.

**Verified against Archi `master`:**
- `com.archimatetool.model/model/viewpoints.xml` — 25 viewpoints; ids/names match
  `VIEWPOINT_ID_TO_NAME` (`src/model/io/exchange-xml/mapping.ts`) exactly, both ways.
- `.../viewpoints/Viewpoint.java` `isAllowedConcept()`: empty element list ⇒ allow
  all; `defaultList = {Junction, Grouping}` always allowed; null/unknown viewpoint
  ⇒ allow all. Relationships not gated here.
- `.../util/ArchimateModelUtils.java` — `$…Elements$` collection expansions (per layer).

---

## File structure

- Create: `src/model/data/viewpoints.ts` (React-free; header cites the 3 Archi sources)
  - 7 collection constants (`STRATEGY_ELEMENTS` … `IMPLEMENTATION_MIGRATION_ELEMENTS`).
  - `interface ViewpointDef { id; name; elementTypes: readonly ElementType[] }`.
  - `const VIEWPOINTS` — 25 entries, `elementTypes` = spread collections + individuals,
    1:1 with `viewpoints.xml` (`layered` = `[]`).
  - `isAllowedElementInViewpoint(viewpointId, type)` — rules above; `{Junction,Grouping}`
    always true; empty/undefined/unknown viewpoint ⇒ true.
- Modify: `src/ui/Palette.tsx` — read active view's `viewpoint`; `ToolButton` gains
  `disabled?` (adds `palette-item-disabled`, no-op onClick); element loop in `LAYERS.map`
  passes `disabled={!allowed}` + "Not allowed by this view's viewpoint" title.
- Modify: `src/styles.css` — `.palette-item-disabled { opacity:.35; pointer-events:none; }`.
- Create: `tests/viewpoints.test.ts` — id/name set-equality both ways; allow spot-checks.
- Modify: `tests/palette.test.ts` — restricted-viewpoint case.

## Checklist

- [ ] `src/model/data/viewpoints.ts` ported (table + fn)
- [ ] Palette wiring + CSS
- [ ] `tests/viewpoints.test.ts`
- [ ] `tests/palette.test.ts` extended
- [ ] `npm test` green
- [ ] `npm run build` clean
- [ ] Browser: set/clear viewpoint on Archisurance view, screenshot grey/restore
- [ ] Commit `feat: Viewpoint enforcement in the palette`
