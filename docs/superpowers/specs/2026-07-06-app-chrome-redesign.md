# App Chrome Redesign

## Summary

A cohesive light restyle of the whole application chrome, driven by the
`App Chrome.dc.html` mockup from the "App chrome redesign" Claude Design project.
The mockup was modeled directly on the app's real architecture (its
float/popout/maximize icons are the exact SVG paths from `GroupControls` in
`src/ui/dock/layout-config.tsx`, and it lays panels out exactly as the dockview
shell does), so this is a **restyle of existing components, not a rebuild**.

## Goals

- **Brighter, cooler palette.** Accent moves from `#2a6cc4` to `#1f74f0`; neutrals
  cool down (backgrounds `#eef2f6`/`#f6f8fb`, borders `#d5dbe2`/`#e3e8ee`, text
  `#14181d`/`#5b6672`/`#6b7480`). Centralised as CSS variables in `src/styles.css`.
- **Icon-only toolbar** (42px, white) with the real app icon (`public/icons/icon.svg`)
  as the logo and an `ARCHI ONLINE` wordmark. Every text button becomes an icon
  button carrying the same tooltip / handler. Glyphs are transcribed 1:1 from the
  mockup's `<symbol>` sprite.
- **New bottom status bar** (26px): selection summary, model element/relationship
  totals, filename + unsaved dot, and — for the active view — live cursor `x / y`
  (view coordinates) and zoom `%`.
- **Refined panels:** palette layer micro-labels (STR/BUS/APP/TEC/…), model-tree
  selection with an inset accent bar, dockview active tabs in white with a top
  accent bar, Properties tabs flipped from a left vertical strip to a top
  horizontal strip, and a cleaner floating zoom control.

## Non-Goals

- No structural change to the dockview layout, the canvas, or any model logic —
  purely presentational plus a read-only status read-out.
- No dark theme (the app is light-only today).
- The mockup's plain "A" logo badge is **not** used; the real app icon is used
  instead (consistent with the Welcome panel), per the user's direction.

## Design decisions

- **`.tb-btn` is a shared button class** used across dialogs and side panels, so the
  toolbar's icon buttons use a **new** `.tb-icon` class rather than repurposing it.
- **Save As** has no keyboard shortcut, so it is kept as its own toolbar icon
  (a save glyph with a `+`) rather than dropped — a one-icon deviation from the
  mockup that preserves the feature.
- **Live zoom/cursor** live locally in each `useCanvasViewport` (not the global
  store), so a tiny transient Zustand store (`src/ui/canvas-status.ts`) carries
  `{ zoom, x, y }` from the active `ViewEditor` to the `StatusBar`. The active view
  publishes zoom on change and the cursor on pointer-move (cleared on leave); the
  status bar gates the canvas read-out on `activeViewId !== null`.
- **Selection summary** reuses `resolveTarget()` from `src/ui/properties/target.ts`
  — the same resolver the Properties panel uses — so the label always matches.
- **Toolbar tooltips** are a fast CSS tooltip (`.tb-icon[data-tip]::after`, ~150ms
  delay) rather than the native `title` (whose ~0.5s delay can't be tuned). The
  text lives in `data-tip`; `aria-label` carries the accessible name; right-cluster
  icons set `data-tip-align="end"` so the tooltip never overflows the viewport.

## Component before / after

| Area | Before | After |
|---|---|---|
| Toolbar | text buttons, `Archi Online` text, inline file-status | app-icon logo + `ARCHI ONLINE`, icon buttons, no file-status |
| Palette | thin separators (tooltip only) | visible layer labels (STR/BUS/APP/TEC/PHY/MOT/IMPL/OTHER) |
| Model tree | selected row = flat blue fill | selected row = accent-soft fill + inset accent bar + bold |
| Center tabs | dockview default light theme | muted strip, white active tab + top accent bar |
| Properties | left vertical tab strip (172px) | top horizontal tab strip, active underline; uppercase header |
| Status | none (file status in toolbar) | full status bar with live coords + zoom |
| Zoom control | flat pill | white, rounded, subtle shadow |
