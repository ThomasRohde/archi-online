# LEVELUP Phase 7 — Outline Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Outline minimap for the active view, including a viewport rectangle and click/drag-to-pan navigation.

**Architecture:** Keep viewport state transient in a view-keyed module bus. Reuse the store-free static SVG renderer and the image-export bounds calculation for the thumbnail, while `useCanvasViewport` publishes view-space viewport geometry and handles pan requests for both editable and read-only editors.

**Tech Stack:** React 18, TypeScript, Zustand, SVG, Dockview, Vitest/jsdom, Playwright CLI.

## Global Constraints

- No model mutation, dirty flag, undo entry, schema change, or persisted viewport state.
- Outline remains usable in read-only mode.
- Keep the panel opt-in and dock it with Models when available.
- Preserve current image-export dimensions and the 10-pixel content margin.
- Leave unrelated working-tree files untouched.

## Tasks

- [ ] Export and test `contentViewBox()` from `src/canvas/export/view-image.ts`; use it from image export and Outline.
- [ ] Add and test `src/canvas/viewport-bus.ts`, including latest-value replay, view isolation, unsubscribe, null publication, and pan routing.
- [ ] Extend `useCanvasViewport` to publish visible view-space geometry, observe SVG resizes, handle pan requests, and publish null on unmount.
- [ ] Add `src/ui/OutlinePanel.tsx` with the measured static thumbnail, viewport rectangle, empty state, and pointer-driven pan requests.
- [ ] Register the opt-in Outline panel and add focused `.outline-*` styles.
- [ ] Add `tests/outline.test.ts` and extend image-export and dock-layout coverage.
- [ ] Run focused tests, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Browser-drive all three stages on Archisurance, capture evidence, and verify layout restore and read-only behavior.
- [ ] Document Outline in the User Guide and commit the selected screenshot.
- [ ] Commit once as `feat: Outline (minimap) panel`, then publish and verify the live app.

## Acceptance

- Opening Outline from Views shows the active view thumbnail.
- Pan, zoom, and resize update the viewport rectangle immediately.
- Clicking or dragging in Outline recenters the editor without touching model state or history.
- The panel restores after reload and follows editable and read-only view editors.
- Full automated and browser verification passes before the single phase commit.
