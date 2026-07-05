# Levelup Phase 2 Navigator Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only Navigator panel from `LEVELUP.md` Phase 2.

**Architecture:** Keep relationship direction queries pure and React-free in `src/model/analysis.ts`. Render the Navigator as an opt-in dock panel with local root, direction, pin, and expanded-path state, using store selection APIs only for navigation.

**Tech Stack:** Vite, React 18, TypeScript, Zustand store, Dockview, Vitest/jsdom.

---

## Phase 2 Checklist From LEVELUP.md

- [ ] Add `outgoingRelationships` and `incomingRelationships` to `src/model/analysis.ts`.
- [ ] Create `src/ui/NavigatorPanel.tsx` with local `rootId`, `direction`, `pinned`, and `expanded` state.
- [ ] Resolve root from the most recently selected element or relationship in the model tree or view.
- [ ] Re-root on external concept selection unless pinned.
- [ ] Use a module-level `internalSelection` guard so Navigator row clicks select in the tree without re-rooting.
- [ ] Render downstream and upstream traversal with lazy expansion keyed by tree path.
- [ ] Auto-expand only the root's first level when the root or direction changes.
- [ ] Add toolbar controls for direction, pin, and home.
- [ ] Double-click an element row to make it the root.
- [ ] Register `navigator` in `TOOL_PANELS` and `components`, docked with `models` when present, otherwise left.
- [ ] Do not add Navigator to `buildDefaultLayout`.
- [ ] Add `tests/navigator.test.ts`.
- [ ] Extend `tests/dock-layout-config.test.ts`.
- [ ] Run `npx vitest run tests/navigator.test.ts tests/dock-layout-config.test.ts tests/analysis.test.ts`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Browser-drive the app against the Archisurance fixture and save a screenshot.
- [ ] Commit with message `feat: add navigator panel` after the gate is green.

## Implementation Notes

- Use `LEVELUP.md` literal traversal for this phase: relationship rows expand to the other-end concept only. Upstream Archi's relationship-to-relationship child traversal and drill history are out of scope.
- Sort incoming and outgoing relationship query results by relationship name, then id, matching the existing `modelRelations` helper style.
- Resolve selected view objects this way: element node -> `elementId`; relationship connection -> `relationshipId`; non-concept view objects are ignored.
- The home button should re-root to the current store selection even when pinned.
- Navigator is read-only and remains usable in read-only mode.
- Keep `LEVELUP.md` untracked unless explicitly requested.

## Verification

- `npx vitest run tests/navigator.test.ts tests/dock-layout-config.test.ts tests/analysis.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run dev` plus browser verification through `window.__archiLoadXml(xml)`.
