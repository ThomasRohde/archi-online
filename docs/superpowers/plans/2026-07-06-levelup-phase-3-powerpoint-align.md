# Levelup Phase 3 Rework — PowerPoint Align / Match Size / Distribute

**Goal:** Replace the GEF/Archi union-box semantics shipped in commit `87a9fff`
with PowerPoint semantics: anchor-based Align and Match Size (anchor = first or
last selected element, chosen by a setting), plus Distribute Horizontally /
Vertically, plus icons in the context menu.

**Why:** The original union-box alignment and match-to-largest sizing were
non-intuitive for the user, who wants the PowerPoint mental model (align/size to
a key object). Distribution — previously listed out-of-scope — is now a
deliberate deviation.

**Architecture:** All diagram geometry mutations stay in `src/model/ops/alignment.ts`,
wrapped by `transact()`. Ops compute in absolute view coordinates via
`absoluteBounds()` and write back parent-relative bounds. Selection order is the
source of "first/last" (Ctrl-click appends to `selection.ids`).

---

## File structure

- Modify: `src/settings/app-settings.ts`
  - Add `alignmentAnchor: number` (default `1` = last), a new `alignment`
    settings section, `AnchorMode`, and `alignmentAnchorMode(settings)`.
- Modify: `src/model/ops/alignment.ts`
  - Anchor-based `alignNodes(ids, mode, anchor)` and `matchSize(ids, mode, anchor)`;
    add `distributeNodes(ids, mode)` (equal-gap, ≥ 3 nodes). Keep
    `alignableNodeIds()` and geometry helpers.
- Create: `src/canvas/view-editor/alignment-icons.tsx`
  - 14×14 `currentColor` SVG `ReactNode` constants for each action.
- Modify: `src/canvas/view-editor/contextMenu.ts`
  - `showViewObjectContextMenu` takes `settings`; builds Align / Distribute /
    Match Size submenus with icons.
- Modify: `src/canvas/view-editor/useViewEditorInteractions.ts`
  - Pass `settings` into `showViewObjectContextMenu`.
- Rewrite: `tests/alignment.test.ts`
  - Anchor semantics (first & last), distribution (H/V, < 3 no-op), plus the
    retained nested/connection/no-op cases.
- Docs: update `LEVELUP.md` Phase 3 + remove distribute from out-of-scope.

## Checklist

- [x] Add `alignmentAnchor` setting + `alignmentAnchorMode` helper.
- [x] Rewrite `alignNodes`/`matchSize` to anchor semantics; add `distributeNodes`.
- [x] Add `alignment-icons.tsx`.
- [x] Wire Align / Distribute / Match Size submenus (with icons) in the context menu.
- [x] Thread `settings` through `showViewObjectContextMenu`.
- [x] Rewrite `tests/alignment.test.ts`.
- [x] Update `LEVELUP.md`.
- [x] `npm test` + `npm run build` green.
- [ ] Drive the app: Ctrl-click 3 elements → Align Left / Distribute Horizontally,
      screenshot, Ctrl+Z restores in one step; flip the anchor setting.

## Semantics reference

- **Align** (each node, from anchor box `A`): left `x=A.x`; right
  `x=A.x+A.width-w`; center `x=A.x+A.width/2-w/2`; top/middle/bottom analogous on y.
- **Match**: width/height/both set from `A`, top-left corner fixed.
- **Distribute (equal gap)**: sort by crossed edge; `gap = (span - Σsize)/(n-1)`;
  walk sorted, first stays, `cursor += size + gap`. Both extremes stay fixed.
