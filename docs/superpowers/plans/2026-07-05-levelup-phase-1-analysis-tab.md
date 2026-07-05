# Levelup Phase 1 Analysis Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only Properties Analysis tab from `LEVELUP.md` Phase 1.

**Architecture:** Keep analysis queries pure and React-free in `src/model/analysis.ts`. Render a focused `AnalysisTab` inside the existing Properties panel, using store selection and open-view APIs for navigation only.

**Tech Stack:** Vite, React 18, TypeScript, Zustand store, Vitest/jsdom.

---

## Phase 1 Checklist From LEVELUP.md

- [ ] Add `src/model/analysis.ts` with `modelRelations`, `viewsUsing`, and `findInView`.
- [ ] Extend `PropertiesPanel` tabs to include `analysis` for selected elements and relationships only.
- [ ] Add `src/ui/properties/AnalysisTab.tsx` with **Model Relations** and **Used in Views** sections.
- [ ] Relationship rows display `<relationship label> (<source name> -> <target name>)` and select the relationship in the model tree.
- [ ] View rows open the view, find the represented node or connection, and select it in the view.
- [ ] Add empty states: `No relations.` and `Not used in any view.`
- [ ] Add `tests/analysis.test.ts`.
- [ ] Extend `tests/properties-panel.test.ts` for Analysis tab rendering and row clicks.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Browser-drive the app against the Archisurance fixture and save a screenshot.
- [ ] Commit with message `feat: add properties analysis tab` after the gate is green.

## Implementation Notes

- `modelRelations(state, conceptId)` returns outgoing/source relationships first, then incoming/target relationships. Sort each group by relationship name, then id. Self-relations appear once in the outgoing group.
- `viewsUsing(state, conceptId)` finds element nodes by `elementId` and relationship connections by `relationshipId`, then returns unique views sorted by view name, then id.
- `findInView(state, viewId, conceptId)` returns the first matching element node id or relationship connection id in insertion order, or `undefined`.
- The Analysis tab is shown only when the resolved target concept id exists in `model.elements` or `model.relationships`.
- Analysis remains available in read-only mode. It performs no model mutations.
- Keep `LEVELUP.md` untracked unless explicitly requested.

## Verification

- `npx vitest run tests/analysis.test.ts tests/properties-panel.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run dev` plus browser verification through `window.__archiLoadXml(xml)`.
