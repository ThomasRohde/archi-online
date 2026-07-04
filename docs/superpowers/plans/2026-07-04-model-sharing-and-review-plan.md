---
title: "feat: Model sharing, visual diff, and GitHub integration"
type: feat
status: active
date: 2026-07-04
origin: docs/brainstorms/2026-07-04-model-sharing-and-review-requirements.md
---

# ✨ feat: Model sharing, visual diff, and GitHub integration

## Overview

Turn Archi Online models into **shareable links** and model changes into
**reviewable visual diffs**, with GitHub as team storage — all client-side,
no backend. Three milestones, each independently shippable
(see origin: `docs/brainstorms/2026-07-04-model-sharing-and-review-requirements.md`):

1. **M1 — Read-only viewer & share links** (R1–R6)
2. **M2 — Visual model diff** (R7–R11)
3. **M3 — GitHub open/save/compare** (R12–R16)

This is the product's differentiation bet: desktop Archi structurally cannot
ship any of it.

## Problem Statement

Models are consumed as screenshots and reviewed by eyeballing XML. Stakeholders
who need to *read* a model shouldn't need a modeling tool; reviewers who need
to know *what changed* shouldn't reverse-engineer it from pixels. (Full
framing in the origin doc.)

## Proposed Solution

### Key decisions carried forward from the origin

- **Gist fallback over standalone HTML export** — sharing stays link-shaped;
  public gists are consumable with zero auth. HTML export deliberately out of
  scope.
- **PAT over OAuth** — GitHub OAuth token exchange requires a proxy, which
  violates the no-backend constraint.
- **Diff = semantic catalog + per-view visual overlay**, with layout-only
  noise demoted (grouped, collapsed by default).
- **Milestone order viewer → diff → git** — the diff renderer builds on the
  viewer; git multiplies both.
- **M3 depth**: open/save + compare refs only. No PR listing/comments, no
  merge/conflict resolution beyond an upstream-change warning.

### Share-link resolution (M1)

```mermaid
flowchart LR
    A[Link opened] --> B{URL fragment\nhas payload?}
    B -- "#m=..." --> C[base64url decode →\nfflate inflate → parseArchimate]
    B -- "#gist=id" --> D[GET gist raw_url\n(no auth for public)]
    B -- "#raw=url" --> E[fetch raw GitHub URL]
    D --> C
    E --> C
    C -- ok --> F[Viewer mode:\nread-only, autosave OFF]
    C -- error --> G[Error screen +\n'Open Archi Online' escape]
```

## Technical Approach

### Architecture

**M1 viewer.** A `?mode=viewer` (or fragment-triggered) entry branch in
`src/App.tsx`. The shared model loads into the normal store via
`replaceModel()`, plus a new global `readOnly` flag that:

- renders `ViewEditor` without `useViewEditorInteractions` (already a
  separable hook — `src/canvas/ViewEditor.tsx:41`), keeping
  `useCanvasViewport` for pan/zoom;
- hides editing chrome (palette, toolbar edit buttons); shows view switcher +
  properties inspector (read-only) + "Open a copy in the editor" (R5);
- **suppresses autosave and layout persistence** — critical: without this,
  opening someone's link overwrites the user's own restored session
  (`src/persistence/autosave.ts` subscribes unconditionally today);
- skips extension loading in viewer mode (lean, avoids `model.opened` side
  effects on foreign models).

**Share encoding.** `serializeArchimate()` → `fflate.deflateSync` →
base64url → `#m=<payload>`. Above a size threshold (constant, default ~8 KB
encoded; tune during implementation), offer gist upload instead (R3).

**M2 diff.** A pure function in `src/model/diff.ts`:
`diffModels(base: ModelState, target: ModelState) → ModelDiff` — no store
dependency, keyed by stable ids (they round-trip through `.archimate`
files). The compare UI is a new dock panel type (`diff:<sessionId>` alongside
`view:<viewId>` in `src/ui/DockLayout.tsx`): semantic catalog list + overlay
rendering. Overlay renders the **target** version through the read-only
canvas with an annotation layer; **removed** objects draw as ghosts from the
base `ModelState` passed as props — this needs `NodeView`/figure rendering to
accept a model snapshot as props instead of reading `useStore` (modest
refactor; the read path is already prop-shaped below `ViewEditor`).

**M3 GitHub client.** New `src/persistence/github.ts` — plain `fetch`
against `api.github.com` (CORS-enabled), no SDK dependency. Contents API for
open (`Accept: application/vnd.github.raw+json` for >1 MB files) and commit
(`PUT /repos/{o}/{r}/contents/{path}` with the file's blob `sha`). GitHub
rejects a stale `sha` with `409`, which *is* the R16 upstream-change check —
no client-side bookkeeping beyond storing the sha at open time. Compare refs
= fetch the file at two refs, run `diffModels`. PAT stored via
`src/persistence/keyval.ts` like other profile data; never placed in links.

### API surface parity

GitHub open/save must flow through the same paths as file open/save
(`replaceModel()`, `emitModelSaved()` in `src/persistence/files.ts`) so
extension events (`model.opened`, `model.saved`), dirty tracking, and the
toolbar status area behave identically. Share/compare actions should also be
registered as commands so extensions and future automation can invoke them.

### Implementation Phases

#### Phase 1: Viewer & share links (M1 — R1–R6)

Deliverables and touchpoints:

- [ ] `src/model/store.ts` — `readOnly` flag; guard mutating ops when set
- [ ] `src/canvas/ViewEditor.tsx` — interaction-free render path (R1)
- [ ] `src/ui/ViewerShell.tsx` — viewer chrome: view switcher, read-only
      properties, "Open a copy in the editor" (R5)
- [ ] `src/persistence/share.ts` — encode/decode (R2), threshold + gist
      fallback (R3), gist-id reuse per `model.info.id` in keyval (R6)
- [ ] `src/persistence/github.ts` (minimal slice) — create/update gist
      (auth), fetch gist `raw_url` / raw file URL (no auth) (R3, R4)
- [ ] `src/App.tsx` — entry branch; autosave/layout/extension suppression in
      viewer mode
- [ ] `src/ui/Toolbar.tsx` — **Share…** action with link-vs-gist flow and
      secret/public choice (R3)
- [ ] `tests/share.test.ts` — encode→decode round-trip equals source model;
      threshold behavior; malformed-payload error path

Success: a link produced from the Archisurance example opens read-only in a
fresh browser profile with zero auth. Effort: **M** (largest unknown is
viewer chrome polish).

#### Phase 2: Visual diff (M2 — R7–R11)

- [ ] `src/model/diff.ts` — semantic diff: added/removed/changed elements,
      relationships, views, folders, properties (R8); per-view node/connection
      changes; **layout-only classification uses absolute bounds** so a moved
      parent doesn't flag every child (R10)
- [ ] `src/ui/DiffPanel.tsx` — catalog list, grouped, layout bucket collapsed
      by default; click-to-navigate (R9)
- [ ] `src/canvas/` — annotation/ghost overlay layer; prop-driven model
      snapshot rendering for base-version ghosts (R9, R11)
- [ ] `src/ui/Toolbar.tsx` / compare entry — "Compare…": two files, or
      current model vs file (R7); deleted views render base version read-only
- [ ] `tests/model-diff.test.ts` — Archisurance vs mutated copy fixture;
      rename (same id) vs replace; layout-only demotion

Success: reviewer answers "what changed?" on the fixture pair in under a
minute. Effort: **L** (diff engine is straightforward; the ghost-render
refactor is the risk item).

#### Phase 3: GitHub open/save/compare (M3 — R12–R16)

- [ ] `src/persistence/github.ts` — repo/branch browse, contents get/put,
      ref compare plumbing (R13–R15)
- [ ] `src/ui/GitHubDialog.tsx` — connect (PAT, stored locally, R12), repo &
      branch picker, open/commit flows with commit message + new-branch
      option (R14)
- [ ] Stale-sha `409` → R16 warning dialog (overwrite / reload / cancel);
      keep serialized XML in memory across re-auth so an expired PAT never
      loses a commit
- [ ] "Compare refs…" — pick base/head, reuse Phase 2 diff (R15)
- [ ] `tests/github.test.ts` — mocked fetch: open, commit, 401/404/409 paths

Success: open → edit → commit → compare entirely in the browser against a
real repo. Effort: **M**.

## Alternative Approaches Considered

- **Standalone HTML export** as the large-model fallback — rejected in the
  origin brainstorm in favor of gists; revisit for offline/intranet later.
- **OAuth (device flow)** — token exchange endpoint lacks CORS; would force a
  proxy service. PAT keeps the no-backend guarantee.
- **GitHub integration as an extension** rather than core — rejected: file
  lifecycle (dirty state, save semantics, model.saved events) is core
  behavior; an extension would fork it. The extension system remains the
  route for *additional* providers later.
- **Git data API (trees/commits)** vs contents API — contents API chosen; we
  commit exactly one file and get optimistic concurrency (sha check) free.

## System-Wide Impact

- **Interaction graph**: viewer entry → `replaceModel()` → store subscribers.
  Today that chain reaches autosave (clobber risk — suppressed in viewer
  mode), dock layout persistence, and `model.opened` extension events
  (skipped in viewer mode). GitHub open/save intentionally *keeps* the full
  chain for parity with file open/save.
- **Error propagation**: parse/inflate failures → viewer error screen with an
  escape hatch (fragment stripped by a chat client degrades to the landing
  page with a hint). GitHub: 401 → re-prompt keeping work in memory; 404 →
  gist/file gone; 409 → R16 flow; 403 rate-limit → explicit message.
- **State lifecycle risks**: gist-id ↔ model association and PAT live in
  keyval; deleting a gist out-of-band → next share creates a fresh gist. No
  partial-commit risk: contents PUT is atomic per file.
- **API surface parity**: GitHub save must call `emitModelSaved()`; share and
  compare exposed as commands for extension parity.
- **Integration test scenarios** (beyond unit tests): share round-trip via
  real URL length limits in a driven browser; viewer-mode autosave
  suppression (open link, reload normal app, original session intact);
  diff navigation from catalog to highlighted overlay; commit conflict
  end-to-end with mocked 409; public-gist open with no token configured.

## Acceptance Criteria

### Functional

- [ ] R1–R6: share links (fragment + gist), zero-auth viewing of public
      gists/raw URLs, read-only viewer with properties inspection, open-a-copy,
      stable re-share updates (per origin doc definitions)
- [ ] R7–R11: compare two local files or current-vs-file; semantic catalog;
      color-coded overlay with ghosts; layout-only changes collapsed;
      catalog→view navigation; strictly read-only
- [ ] R12–R16: PAT connect; browse/open; commit with message + optional new
      branch; compare any two refs; upstream-change warning before overwrite

### Non-Functional

- [ ] No backend: every feature works from the static `dist/` site
- [ ] Model data never sent anywhere except GitHub, and only on explicit user
      action; PAT never appears in any URL or share payload
- [ ] Viewer never mutates the visitor's autosave, settings, or layout
- [ ] Archisurance-scale models share via gist and diff in interactive time

### Quality Gates

- [ ] `npm run ci:check` green; new suites: `tests/share.test.ts`,
      `tests/model-diff.test.ts`, `tests/github.test.ts`
- [ ] Playwright-driven verification of viewer mode and diff overlay
      (per CLAUDE.md UI-verification workflow)
- [ ] Wiki updated (see Documentation Plan)

## Success Metrics

From the origin doc: no-install stakeholders read shared models on first try;
"what changed?" answered in under a minute without XML; teams run
open→edit→commit→compare fully in-browser; URL/gist fallback is automatic.

## Dependencies & Prerequisites

- `fflate` (already a dependency) for share compression.
- Stable element ids across edits — already guaranteed by `.archimate`
  round-trip; this is what makes id-keyed diffing reliable.
- GitHub API from the browser: `api.github.com` and gist/raw hosts are
  CORS-enabled (verify gist `raw_url` CORS during Phase 1 spike).

## Risk Analysis & Mitigation

| Risk | Mitigation |
| --- | --- |
| **Fine-grained PATs may not support the Gists API** — classic PAT with `gist` scope may be required | Verify early in Phase 1; document exact token type in the connect dialog and wiki |
| Gist API truncates files >1 MB in JSON responses | Always fetch via `raw_url` (serves up to ~10 MB); size-check with a clear error beyond that |
| URL fragment limits vary by chat/email intermediaries | Conservative default threshold (~8 KB) behind a constant; gist path always available |
| Ghost-render refactor creeps into a canvas rewrite | Phase 2 spike first: render one static view from a `ModelState` prop; if >2 days, fall back to rendering ghosts from precomputed absolute bounds only (no figures, outline boxes) |
| Share links contain the model itself (privacy) | Copy dialog states this plainly: "anyone with this link has the model data" |
| Viewer link unfurling by chat bots | Fragment never reaches the server; only the static shell is fetched — no data exposure |

## Resource Requirements

Single developer + AI pair. Rough sequence: Phase 1 ≈ 1 week, Phase 2 ≈ 1–2
weeks, Phase 3 ≈ 1 week. Each phase ships independently.

## Future Considerations

GitLab/Bitbucket providers (via the extension system), PR listing/comments,
real-time co-editing, standalone HTML export, diff of scripting-relevant
metadata (viewpoints, profiles) as the metamodel grows.

## Documentation Plan

- Per repo convention, each milestone gets a design doc in
  `docs/superpowers/specs/` before coding (viewer/share encoding spec first).
- Wiki: extend **User Guide** (Share, Compare, GitHub sections), add setup
  notes to **Getting Started**, update **Home** highlights and
  **Archi-Compatibility** (sharing preserves round-trip fidelity).
- README feature bullets.

## Sources & References

### Origin

- **Origin document:**
  [docs/brainstorms/2026-07-04-model-sharing-and-review-requirements.md](../../brainstorms/2026-07-04-model-sharing-and-review-requirements.md)
  — key decisions carried forward: gists over HTML export (user decision);
  PAT over OAuth (no-backend constraint); semantic catalog + visual overlay
  with layout-noise demotion; viewer → diff → git milestone order; M3 scoped
  to open/save + compare refs.
- All origin `Deferred to Planning` questions are addressed above: URL
  threshold (Phase 1 constant + risk row), viewer entry point (App.tsx branch,
  same bundle), rename-vs-replace heuristics (Phase 2 tests), contents API vs
  git data API (Alternatives), gist-id storage (keyval per `model.info.id`).

### Internal References

- Store / model replace: `src/model/store.ts` (`replaceModel`)
- XML round-trip: `src/model/io/archimate-xml.ts`, `tests/archimate-xml.test.ts`
- Canvas split (render vs interactions): `src/canvas/ViewEditor.tsx:22-57`
- Autosave subscription to suppress: `src/persistence/autosave.ts:17`
- File save parity path: `src/persistence/files.ts` (`emitModelSaved`)
- Dock panel ids (`view:<id>` pattern for new `diff:<id>`): `src/ui/DockLayout.tsx`
- Local key-value storage: `src/persistence/keyval.ts`
- Example models for fixtures/demo links: `public/examples/`

### External References

- GitHub REST: Gists, Repository contents (raw media type, PUT + sha
  optimistic concurrency), Compare — https://docs.github.com/en/rest
- fflate — https://github.com/101arrowz/fflate

### Related Work

- `docs/superpowers/plans/2026-07-04-indexeddb-persistence-consolidation.md`
  (keyval layer this builds on)
- `docs/superpowers/plans/2026-07-03-diagram-automation-api-design.md`
  (view.layout — reused by diff navigation highlighting)
