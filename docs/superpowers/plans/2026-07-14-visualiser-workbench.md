# Visualiser Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Visualiser into a polished, navigable graph workbench with label-aware ELK routing, route-placard relationship labels, fit/zoom/pan controls, shortcuts, and useful context menus while preserving live/export geometry parity.

**Architecture:** Keep graph discovery and preferences in `VisualiserPanel`, move pure presentation and viewport calculations into focused modules, extend the generic ELK bridge with labels and ports, and render the interactive SVG through a dedicated `VisualiserCanvas`. The same normalized layout and presentation objects drive both the live canvas and exported SVG.

**Tech Stack:** React 19, TypeScript, SVG, ELK.js, Vitest, jsdom

## Global Constraints

- [ ] Keep `showRelationshipNames` off by default and preserve the existing filters, focus history, pinning, selection, navigation, and export workflows.
- [ ] Implement Option A “route placards”: compact white plates with a quiet border and small text positioned by ELK on separated orthogonal routes.
- [ ] Use dedicated invisible ELK ports per relationship endpoint and deterministic IDs; do not expose them in the DOM.
- [ ] Use ELK label coordinates when valid and a routed half-length fallback when labels are absent or invalid.
- [ ] Keep exports independent of the interactive viewport while using the same graph geometry and label presentation.
- [ ] Write a failing test before each production change and make focused commits after green verification.
- [ ] Do not add dependencies, change public model APIs, or commit `dist`.

---

## Task 1: Extend the generic ELK bridge for labels, ports, and layout options

**Files:**

- Modify: `src/model/layout/elk-graph.ts`
- Modify: `tests/elk-graph.test.ts`

- [ ] Add a failing test proving `layoutElkGraph` accepts immutable node ports, edge source/target port IDs, edge labels, and extra ELK layout options, then returns normalized label bounds along with edge points.
- [ ] Add a test seam for the ELK runner so the test can inspect the exact immutable ELK input without loading the real engine.
- [ ] Extend `ElkGraphNode` with optional ports and port constraints, `ElkGraphEdge` with optional port IDs and labels, layout options with typed extra ELK options, and layout results with edge labels.
- [ ] Serialize fixed-side ports, edge labels, source/target port references, and the supplied ELK options without mutating the caller graph.
- [ ] Normalize label coordinates using the same layout offset as nodes and edges; ignore incomplete or non-finite label output safely.
- [ ] Run `npm test -- --run tests/elk-graph.test.ts` and `npm run typecheck`.
- [ ] Commit as `Extend ELK graph presentation support`.

## Task 2: Extract a pure Visualiser presentation model

**Files:**

- Create: `src/ui/visualiser/presentation.ts`
- Create: `tests/visualiser-presentation.test.ts`
- Modify: `src/ui/VisualiserPanel.tsx`

- [ ] Add failing tests for wrapped node labels, measured relationship label plates, deterministic endpoint ports, label-on/off ELK profiles, graph content bounds, and safe routed-midpoint fallback placement.
- [ ] Move node sizing, word wrapping, edge point fallback, path generation, bounds calculation, and XML escaping into the presentation module with explicit exported types.
- [ ] Build a presentation graph from `AnalysisGraph` plus `showRelationshipNames`, including only stored non-blank relationship names and only one label for split relationship-node edges.
- [ ] Use a maximum relationship text width of 160px and deterministic text measurement suitable for both jsdom and SVG export.
- [ ] Encode the compact label-off profile and exact label-on spacing/placement profile from the approved design.
- [ ] Preserve current Visualiser rendering and export behavior through the new pure helpers before adding interaction.
- [ ] Run `npm test -- --run tests/visualiser-presentation.test.ts tests/visualiser.test.ts` and `npm run typecheck`.
- [ ] Commit as `Extract Visualiser presentation model`.

## Task 3: Add deterministic Visualiser viewport math

**Files:**

- Create: `src/ui/visualiser/viewport.ts`
- Create: `tests/visualiser-viewport.test.ts`

- [ ] Add failing unit tests for clamping, pointer-anchored zoom, screen-delta panning, 100% centering, and fit-to-view with 32px screen padding and a 150% maximum fit zoom.
- [ ] Define the viewport as `{ zoom, x, y }`, where `x` and `y` are screen-space translations applied before graph coordinates.
- [ ] Implement `zoomAtPoint`, `panByScreenDelta`, `centerAtZoom`, `fitViewport`, and conversion to a graph-coordinate SVG view box.
- [ ] Handle empty/invalid bounds and zero-size canvases with stable defaults rather than NaN/Infinity.
- [ ] Run `npm test -- --run tests/visualiser-viewport.test.ts` and `npm run typecheck`.
- [ ] Commit as `Add Visualiser viewport geometry`.

## Task 4: Build the interactive Visualiser canvas

**Files:**

- Create: `src/ui/visualiser/VisualiserCanvas.tsx`
- Create: `tests/visualiser-canvas.test.ts`
- Modify: `src/ui/VisualiserPanel.tsx`
- Modify: `src/styles.css`

- [ ] Add failing component tests for pointer-anchored plain-wheel zoom, empty-canvas left drag, middle-button drag, Space+drag, lost-capture cleanup, and the HUD buttons (`−`, percentage, `+`, `Fit`).
- [ ] Add failing tests for shortcuts `+`, `-`, `0`, and `1`, while ignoring editable targets.
- [ ] Add failing tests that canvas and node context menus expose the approved fit/zoom/center/select/open actions without changing the existing single-click and double-click semantics.
- [ ] Implement a focusable canvas shell with a native non-passive wheel listener, pointer capture, ResizeObserver-backed fitting, and transient pan state.
- [ ] Render the graph inside a viewport-transformed SVG group; keep selection and navigation callbacks owned by the panel.
- [ ] Use the existing global context menu host and restore focus after menu dismissal.
- [ ] Add accessible labels/titles for HUD controls and a visible keyboard focus treatment.
- [ ] Run `npm test -- --run tests/visualiser-canvas.test.ts tests/visualiser.test.ts` and `npm run typecheck`.
- [ ] Commit as `Add Visualiser canvas navigation`.

## Task 5: Integrate label-aware ELK routing and export parity

**Files:**

- Modify: `src/ui/VisualiserPanel.tsx`
- Modify: `src/ui/visualiser/presentation.ts`
- Modify: `tests/visualiser.test.ts`
- Modify: `tests/visualiser-presentation.test.ts`

- [ ] Add failing integration tests proving label visibility changes the ELK input profile, routes through per-edge side ports, and uses returned ELK label geometry in both live SVG and export.
- [ ] Make the panel request layout from the presentation graph and invalidate stale results when any geometry-affecting preference changes.
- [ ] Apply the label-on profile: node spacing 56, layer spacing 112, edge-edge 18, edge-node 20, between-layer edge-edge 16, between-layer edge-node 20, edge-label 6, label-node 12, inline labels false, side selection `SMART_DOWN`, center placement `SPACE_EFFICIENT_LAYER`, and edge merging false.
- [ ] Apply the label-off compact profile: node spacing 40, layer spacing 80, orthogonal routing, and no ELK labels/ports beyond what routing requires.
- [ ] Render returned relationship label boxes as route placards with wrapped text and use the routed midpoint fallback only when necessary.
- [ ] Make `renderAnalysisGraphSvg` consume the same presentation/layout helpers and emit equivalent placard geometry without viewport transforms or HUD chrome.
- [ ] Run `npm test -- --run tests/visualiser-presentation.test.ts tests/visualiser.test.ts tests/elk-graph.test.ts` and `npm run typecheck`.
- [ ] Commit as `Improve Visualiser relationship routing`.

## Task 6: Apply the standout visual treatment

**Files:**

- Modify: `src/styles.css`
- Modify: `tests/visualiser-canvas.test.ts`

- [ ] Add class-level assertions for the route placard group, quiet floating HUD, pan cursor states, and high-contrast focus state.
- [ ] Style relationship placards as compact white cards with subtle border and shadow, small readable type, and enough inner padding to separate text from routes.
- [ ] Refine node typography, selected-node emphasis, route contrast, dotted canvas, and hover states without changing ArchiMate layer fills.
- [ ] Position the HUD as a compact floating control at the bottom-right of the canvas and keep it legible across light/dark shell chrome.
- [ ] Respect reduced motion and avoid animated graph geometry.
- [ ] Run `npm test -- --run tests/visualiser-canvas.test.ts tests/visualiser.test.ts` and `npm run typecheck`.
- [ ] Commit as `Polish the Visualiser workbench`.

## Task 7: End-to-end verification and browser smoke test

**Files:**

- Verify: `src/model/layout/elk-graph.ts`
- Verify: `src/ui/visualiser/presentation.ts`
- Verify: `src/ui/visualiser/viewport.ts`
- Verify: `src/ui/visualiser/VisualiserCanvas.tsx`
- Verify: `src/ui/VisualiserPanel.tsx`
- Verify: `src/styles.css`

- [ ] Run `npm run lint` if present, `npm test`, `npm run typecheck`, and `npm run build`; record exact pass counts and any non-blocking warnings.
- [ ] Start the production preview and use the in-app browser/Playwright flow to load the Archisurance example, focus `Document Processing SSC`, enable relationship names, and verify placard separation, wrapped labels, wheel zoom, drag pan, Fit, shortcuts, and both context menus.
- [ ] Export SVG and PNG, inspect the SVG markup and rendered PNG, and confirm that labels and routes match the live graph while HUD/context-menu chrome is absent.
- [ ] Verify relationship names remain off by default after a clean preference reset.
- [ ] Review `git diff main...HEAD`, confirm no generated `dist` or unrelated files are staged, and make any final focused correction with a failing regression test first.
- [ ] Stop local preview and visual-companion servers.

## Acceptance Gate

- [ ] Dense named-relationship graphs remain readable without label-on-route collisions in the approved Archisurance scenario.
- [ ] Plain wheel zooms at the pointer; empty-canvas, middle-button, and Space+left drags pan reliably.
- [ ] HUD, shortcuts, and context menus expose fit, zoom, center, select, and open actions accessibly.
- [ ] Live SVG, SVG export, PNG export, and clipboard PNG use the same node, route, and relationship-label geometry.
- [ ] Existing selection, focus pinning, history, filters, word wrapping, async layout gating, and default-off relationship names continue to pass.
- [ ] Full test, typecheck, and production build are green.
