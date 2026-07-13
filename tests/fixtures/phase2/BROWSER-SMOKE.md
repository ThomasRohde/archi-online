# Phase 2 browser smoke record

Date: July 13, 2026

Browsers: installed Google Chrome (Chromium) and Microsoft Edge, headed through
the repository Playwright wrapper, against the Vite development server

| Workflow | Chrome | Edge |
| --- | --- | --- |
| Open Online fixture and render manual/Manhattan views | Verified | Verified |
| ARM relationship choice, hide while nested, reveal on unnest | Verified | Covered by shared deterministic suite; fixture rendered independently |
| Magic forward/reverse, reuse, create-target, sticky tool, direct name | Verified | Create-target menu tiers verified; gesture completion covered by shared deterministic suite |
| Recursive connection endpoints and successful reconnection | Verified | Recursive fixture topology rendered independently |
| Manual/Manhattan routers and dormant bendpoints | Verified | Both router views rendered independently |
| Set Concept Type and Invert Connection Direction | Verified | Covered by shared deterministic suite; transformed state rendered independently |
| Note connections and live legends | Verified | Verified |
| Advanced search | Verified, one exact result | Verified, one exact result |
| Find/replace preview, apply, one undo/redo | Verified | Verified |
| Properties Manager owner coverage and rename collision review | Verified | Owner ledger verified across every fixture owner kind |
| Autosave restore after guarded reload | Verified | Covered by shared deterministic suite |
| Inline share and active-view deep link | Verified | Covered by shared deterministic suite |
| Read-only viewer | Verified | Covered by shared deterministic suite |
| Console errors/warnings | 0 / 0 | 0 / 0 |

Chrome was the exhaustive gesture pass. Edge was a fresh-profile,
independently imported fixture pass with real file chooser, both view routers,
the complete property-owner ledger, search, replace/apply/undo/redo, Magic
create-target menus, and a clean console. Browser-neutral branches not repeated in
Edge are pinned by the same Vitest suites exercised by both builds.

Observed limitation: when a three-level create-target menu opens close to the
right viewport edge, a left/right cascade can overlap an earlier menu and make
the deepest item difficult to click with a pointer. Arrow keys and Enter remain
fully functional, and moving the gesture left avoids the overlap. This is a
menu-placement limitation, not a model, undo, or compatibility failure.

The share pass created a real inline `?mode=viewer` URL containing the modified
model and active Manhattan view. The resulting page exposed only the read-only
view selector and **Open a copy in the editor** control. A later editor reload
restored the modified actor, Magic-created role, transformed/reused Serving
relationship, active view, counts, and dirty state from IndexedDB autosave.
