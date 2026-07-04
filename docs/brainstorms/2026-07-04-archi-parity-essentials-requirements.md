---
date: 2026-07-04
topic: archi-parity-essentials
---

# Archi Parity Essentials — image export, search, presentation, interop

## Problem Frame

Archi Online has shipped its differentiation features (scripting, extensions,
share links, PWA) but still fails a desktop Archi user in the first real work
session: there is no way to get a diagram out of the app as an image, no way
to find an element by name in a large model, and no way to exchange models
with other tools (Open Exchange, CSV). These gaps decide whether the app can
be someone's daily modeler or stays a demo.

This arc closes the highest-friction parity gaps with desktop Archi across
two fronts: **daily-driver essentials** (export a picture, find things,
present views) and **interop** (Open Exchange format, CSV). Fidelity to
Archi's behavior and file formats is the spec, per project rules.

## Requirements

### Image export & presentation

- R1. Any view can be **exported as a PNG** rendered identically to the
  canvas (fonts, colors, figures), with a scale/resolution choice and a
  white or transparent background option.
- R2. Any view can be **exported as an SVG** suitable for embedding in docs
  and wikis.
- R3. The current view (or current selection) can be **copied to the system
  clipboard as an image** for direct pasting into slides/chat.
- R4. A **full-screen presentation mode** renders the current view
  chrome-free: pan/zoom works, arrow keys step through the model's views,
  Esc exits.

### Finding things

- R5. The model tree has a **search/filter box**: type-ahead filtering by
  name, with an optional concept-type filter. Matching elements are shown
  with their ancestry; selecting a result selects the element (and its
  Properties), consistent with desktop Archi's search widget.

### Interop

- R6. The app can **import ArchiMate Open Exchange format** (`.xml`) files,
  producing the same model desktop Archi would.
- R7. The app can **export the current model to Open Exchange format** that
  validates and opens cleanly in desktop Archi and other conforming tools.
- R8. The app can **export the model to CSV** in Archi's exact format
  (elements/relations/properties files), consumable by Archi's CSV import.
- R9. The app can **import Archi-format CSV**, matching Archi's semantics
  for creating new concepts and updating existing ones by id.

## Success Criteria

- A user gets a slide-ready image of a view (file or clipboard) in two
  clicks, and it is pixel-faithful to the canvas.
- The Archisurance model exported to Open Exchange re-imports into desktop
  Archi without errors or content loss; the reverse trip also holds.
- CSV exported by desktop Archi imports cleanly, and vice versa.
- In a 500+ element model, any element is found and selected via tree
  search in seconds.
- A view walkthrough can be presented full-screen in a meeting without the
  editor chrome visible.

## Scope Boundaries

- **Magic Connector: already exists** — the pending-connection overlay
  offers valid relationship types from the relations matrix. Not in scope.
- **HTML report export: deliberately not pursued** — share links + the
  read-only viewer are this product's answer to "give stakeholders a
  browsable model." This is the one intentional divergence from Archi
  parity in this arc.
- No print support, no model templates, no format painter (cut for now).
- No PDF export (PNG/SVG only in this arc).
- No specializations/profiles, sketch/canvas views, or analysis features
  (Navigator, Validator) — candidate follow-up arcs.

## Key Decisions

- **Clusters A + C over analysis/fidelity clusters**: export, search, and
  interop are what a first-session desktop-Archi user hits immediately;
  analysis depth matters only after daily use is viable.
- **Formats ported from Archi's Java source, not approximated** — CSV
  column layout and Open Exchange mapping follow Archi's implementation
  exactly (project fidelity rule).
- **Share links substitute for HTML report** — avoids building and
  maintaining a second read-only rendering pipeline.

## Dependencies / Assumptions

- The canvas is already SVG, so SVG/PNG export can reuse the live render
  path rather than a second renderer (assumed; validated in planning).
- Open Exchange coverage targets the ArchiMate 3.x exchange schema as
  implemented by desktop Archi (its importer/exporter is the reference).

## Outstanding Questions

### Resolve Before Planning

- (none)

### Deferred to Planning

- [Affects R1/R2][Technical] How to serialize the live SVG canvas with
  fonts/styles inlined so exports are self-contained and faithful.
- [Affects R3][Needs research] Clipboard image-write support and formats
  across Chromium/Firefox/Safari; graceful fallback where unavailable.
- [Affects R6/R7][Needs research] Which Open Exchange schema versions Archi
  reads/writes, and how `.archimate`-only features (e.g. figure variants,
  relative bendpoints) map or degrade.
- [Affects R9][Technical] Archi's exact CSV import matching/update rules
  (id matching, property merging, error handling) from its Java source.
- [Affects R5][Technical] Whether search also covers views/folders and
  documentation text in Archi's widget, and matching that scope.

## Next Steps

→ `/ce:plan` for structured implementation planning
