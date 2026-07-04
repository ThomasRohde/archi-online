---
date: 2026-07-04
topic: model-sharing-and-review
---

# Model Sharing & Review — viewer, visual diff, GitHub integration

## Problem Frame

Architecture models today are consumed as screenshots and reviewed by
eyeballing XML diffs or exported images. Stakeholders who need to *read* a
model shouldn't need a modeling tool, and reviewers who need to know *what
changed* shouldn't need to reverse-engineer it from pixels.

Archi Online is uniquely positioned to fix this: it is already a URL instead
of an installer. This arc turns models into **shareable links** and model
changes into **reviewable visual diffs**, with GitHub as the team storage and
review backbone — all without adding a backend. Desktop Archi structurally
cannot match any of this; it is the product's differentiation bet.

The arc ships as three milestones, each building on the previous:
**M1 viewer & share links → M2 visual diff → M3 GitHub open/save/compare**.

## Requirements

### M1 — Read-only viewer & share links

- R1. A **viewer mode** renders a model read-only: switch between views,
  pan/zoom, and inspect any object's name, documentation, and properties. No
  editing affordances are shown.
- R2. **Share as link**: models small enough after compression are encoded
  entirely in the URL fragment. The model data never leaves the browser —
  fragments are not sent to any server.
- R3. Models too large for a URL are shared by **uploading to a GitHub Gist**
  (using the user's token) and producing a short link that references the
  gist. Gists default to *secret*; the user can choose *public*.
- R4. The viewer **opens public sources without any authentication**: share
  links (fragment or gist-backed), public gist URLs, and raw
  GitHub file URLs pointing at a `.archimate` file.
- R5. The viewer offers **"Open a copy in the editor"**, loading the shared
  model as a new editable (unsaved) model.
- R6. Re-sharing the same model updates the existing gist when possible, so
  previously distributed links show the latest version rather than going
  stale.

### M2 — Visual model diff

- R7. A **compare mode** takes two versions of a model (two local
  `.archimate` files, or the currently open model vs. a file) and presents
  their differences.
- R8. A **semantic change catalog** lists added, removed, and changed
  elements, relationships, views, folders, and key-value properties, with
  names and types — readable without opening any diagram.
- R9. A **per-view visual overlay** renders each changed view with
  color-coded markup: added objects highlighted, removed objects shown
  ghosted, modified objects flagged. Selecting a catalog entry navigates to
  and highlights it in the affected view.
- R10. **Layout-only changes** (moved/resized objects, rerouted connections
  with no semantic change) are grouped separately and collapsed by default,
  so reviews aren't drowned in position noise.
- R11. Compare mode is read-only; it reuses the M1 viewer rendering.

### M3 — GitHub open, save, and compare

- R12. Users connect GitHub with a **personal access token**, stored
  browser-locally like other app data. No backend, no OAuth proxy.
- R13. Users can **browse repositories and branches and open** a
  `.archimate` file directly from GitHub.
- R14. Users can **commit changes back** to a branch with a commit message,
  optionally creating a new branch first.
- R15. Users can **compare any two refs** (branches, tags, commits) of a
  model file using the M2 diff experience — "review this architecture
  change" in one flow.
- R16. If the file changed upstream since it was opened, committing warns and
  requires an explicit choice before overwriting.

## Success Criteria

- A stakeholder with no tooling installed opens a shared link and reads the
  model — views, documentation, properties — on the first try.
- A reviewer answers "what changed between these two versions?" in under a
  minute, without reading XML.
- A team keeps its model in a GitHub repo and does open → edit → commit →
  compare entirely from the browser.
- Sharing works for real models: pure-URL links for small models, gist-backed
  links for large ones, with the fallback happening automatically.

## Scope Boundaries

- **No backend service** — everything is client-side; GitHub is the only
  external dependency, and only when the user brings a token or a public URL.
- **No real-time co-editing** — sharing is snapshot-based; collaboration is
  git-based.
- **GitHub only** in this arc — no GitLab/Bitbucket.
- **No PR listing or PR comments** — compare refs covers the review need;
  deeper PR integration is a future arc.
- **No merge or conflict resolution** — M3 is open/commit with an upstream-
  change warning (R16), not a git client.
- **No standalone HTML export** — considered as a sharing fallback; gists
  were chosen instead. May be revisited later for offline/intranet sharing.

## Key Decisions

- **Gist fallback over standalone HTML export**: keeps sharing link-shaped
  end to end; public gists are also consumable with zero auth (user
  decision).
- **PAT over OAuth**: GitHub's OAuth flows need a token-exchange proxy, which
  would violate the no-backend constraint. A PAT is honest and works today.
- **Diff = semantic catalog + visual overlay**: the catalog is the reviewable
  record; the overlay is the standout. Layout noise is demoted by design
  (R10).
- **Milestone order viewer → diff → git**: each layer is independently
  shippable and the diff renderer builds on the viewer; git integration then
  multiplies both.

## Dependencies / Assumptions

- Element/relationship ids are stable across edits (they are — ids round-trip
  through `.archimate` files), which is what makes semantic diffing reliable.
- Client-side GitHub API usage stays within unauthenticated/PAT rate limits
  for realistic team usage.
- Compression (fflate, already a dependency) makes small/medium models fit in
  URL fragments; the exact threshold is a planning question.

## Outstanding Questions

### Resolve Before Planning

- (none)

### Deferred to Planning

- [Affects R2/R3][Needs research] Practical URL-fragment size limits across
  browsers/chat tools/email clients → the automatic gist-fallback threshold.
- [Affects R4][Technical] Viewer entry point: URL parameter/route on the same
  app bundle vs. a separately built lightweight viewer bundle.
- [Affects R8][Technical] Rename-vs-replace heuristics when ids match but
  types differ, and how property-list changes are summarized.
- [Affects R14][Technical] Commit mechanics via the GitHub contents API vs.
  the git data API (single-file commits suffice for this arc).
- [Affects R6][Technical] Where the gist id ↔ model association is stored so
  re-shares update in place (browser profile storage, keyed by model id).

## Next Steps

→ `/ce:plan` for structured implementation planning
