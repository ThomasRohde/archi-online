# Phase 2 browser smoke record

Date: July 13, 2026

Browsers: installed Google Chrome (Chromium) and Microsoft Edge, headed through
the repository Playwright wrapper, against the Vite development server

| Workflow | Chrome | Edge |
| --- | --- | --- |
| Open Online fixture and render manual/Manhattan views | Verified | Verified |
| ARM relationship choice, hide while nested, reveal on unnest | Verified | Verified with apply and undo |
| Magic forward/reverse, reuse, create-target, sticky tool, direct name | Verified | Reverse, create-target, and semantic reuse verified through the keyboard cascade |
| Recursive connection endpoints and successful reconnection | Verified | Recursive topology rendered; target-end reconnection and undo verified |
| Manual/Manhattan routers and dormant bendpoints | Verified | Manual stored bends and Manhattan right-angle routing rendered |
| Set Concept Type and Invert Connection Direction | Verified | Verified with confirmation and independent undo for each operation |
| Note connections and live legends | Verified | Verified |
| Advanced search | Verified, one exact result | Verified, one exact result |
| Find/replace preview, apply, one undo/redo | Verified | Verified |
| Properties Manager owner coverage and rename collision review | Verified | Owner ledger verified across all 20 `probe` owners |
| Autosave restore after guarded reload | Verified | Verified after the 800 ms debounce and a full reload |
| Inline share and active-view deep link | Verified | Verified with an actual 3,313-character inline URL targeting Manhattan |
| Read-only viewer | Verified | Verified by an attempted Delete that left 9 nodes and 9 connections intact |
| Console errors/warnings | 0 / 0 | 0 / 0 |

Chrome was the original exhaustive gesture pass. Edge was a fresh headed pass
that imported the updated fixture through the application's browser-file-input
fallback, exercised both view routers, and completed the required model,
persistence, sharing, and viewer interactions. Playwright cannot operate the
system-native File System Access picker, so the Edge run deliberately removed
`showOpenFilePicker` and used the product's real fallback chooser rather than
claiming native-picker coverage.

The Edge ARM pass started with the directly nested Application Components and
their stored Composition occurrence hidden. Dragging the child out revealed the
connection and produced **Undo Automatic Relationship Management**; nesting the
child again hid it, and undo revealed it again. The Edge Magic pass used the
keyboard cascade for the menu tiers: reverse **Serving** created Process →
Actor, create-target used Composition → Business → Business Actor, and
deleting only that connection occurrence exposed **Reuse unnamed Composition**.
Reusing it kept the semantic count at 6 elements and 7 relationships.

The Edge reconnection pass changed the reused Composition target after first
using **Set Concept Type** to provide a legal target. The UI reported **Undo
Reconnect Connection**, and undo restored the original target. Undo also
restored the original concept type. **Invert Connection Direction** reversed
the endpoints and its own undo restored them. Advanced search used Business
Actor type plus Match Case and returned one result. Find/replace previewed one
field and one occurrence, applied the rename, and passed undo/redo. The
Properties Manager listed the fixture's 20 `probe` occurrences, including the
two ARM elements and their relationship.

Observed limitation: when a three-level create-target menu opens close to the
right viewport edge, a left/right cascade can overlap an earlier menu and make
the deepest item difficult to click with a pointer. Arrow keys and Enter remain
fully functional, and moving the gesture left avoids the overlap. This is a
menu-placement limitation, not a model, undo, or compatibility failure.

After the autosave debounce, a full Edge reload crossed the native
`beforeunload` guard and restored the renamed **Edge Autosave Target**, dirty
state, and active Manhattan tab from IndexedDB. **Share model** then copied a
real inline `?mode=viewer#m=...&view=p2o-view-manhattan` URL. It opened directly
on Manhattan in the shared-link viewer and exposed no editor undo control.
Switching the viewer to Manual showed the renamed target; selecting it and
pressing Delete left all 9 nodes, all 9 connections, and the target intact.
