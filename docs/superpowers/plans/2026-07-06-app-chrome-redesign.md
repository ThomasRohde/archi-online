# App Chrome Redesign — Implementation Plan

See the design in `docs/superpowers/specs/2026-07-06-app-chrome-redesign.md`.

## Files changed

1. **`src/styles.css`** — the bulk:
   - `:root` tokens updated to the mockup palette; new `--border-soft`, `--text-mid`, `--warn`.
   - `.toolbar` → 42px white bar; new `.tb-logo`, `.app-title` (uppercase wordmark),
     `.toolbar-sep`; new `.tb-icon` (29×29 icon button) + `.tb-icon-text` for
     extension-provided buttons. `.tb-btn` (shared) left intact.
   - New `.status-bar` block (`.status-sel`, `.status-sel-name`, `.status-dot`,
     `.status-spacer`, `.status-sep`, `.status-unsaved`, `.status-file`).
   - Dockview theming: CSS custom properties on `.dock-root` + `.dv-tab.dv-active-tab`
     `box-shadow: inset 0 2px 0 var(--accent)` for the active-tab accent bar.
   - `.tree-row.selected` inset accent bar; `.prop-*` flipped to a horizontal tab
     strip; `.pal-sep-label` micro-labels; refined `.zoom-controls`.
2. **`src/ui/Toolbar.tsx`** — added a transcribed `TB_ICONS` sprite + `TbIcon`;
   replaced text buttons with `.tb-icon` buttons (same handlers/tooltips); logo
   `<img>` + wordmark; removed the inline file-status (and its now-unused
   `dirty`/`fileName`/`modelName` subscriptions); menu buttons use
   `e.currentTarget` for positioning.
3. **`src/ui/canvas-status.ts`** (new) — transient Zustand store `{ zoom, x, y }`
   + `setCanvasStatus()`.
4. **`src/ui/StatusBar.tsx`** (new) — reads the store + canvas-status; selection via
   `resolveTarget`; totals from `Object.keys(model.elements/relationships)`;
   filename/unsaved; live `x / y` + zoom gated on `activeViewId`.
5. **`src/canvas/ViewEditor.tsx`** — the active `EditableViewEditor` publishes
   `zoom` (effect) and cursor `x/y` (wrapped pointer-move via `toView`, cleared on
   pointer-leave) to canvas-status.
6. **`src/ui/AppShell.tsx`** — renders `<StatusBar />` below `.app-main`.
7. **`src/ui/Palette.tsx`** — `LAYER_ABBREV` map; layer/C4 separators render visible
   labels.

## Verification (done)

- `npm run build` — tsc + vite pass.
- `npm test` — 298/298 pass.
- Drove the app (Archisurance example): confirmed icon toolbar + app-icon logo,
  palette labels, tree selection accent bar, white active tab with a `2px` accent
  bar (verified via computed `box-shadow` = `rgb(31,116,240) 0 2px 0 inset`),
  horizontal Properties tabs, and the status bar showing selection summary, model
  totals, filename, and live `x / y` + zoom updating on mouse-move / zoom.
