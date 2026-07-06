# Levelup Phase 4 — Duplicate (model tree, Ctrl+D)

**Goal:** Port Archi's `DuplicateCommandHandler`: duplicate **elements** and
**views** (not relationships, not folders) from the model tree, via a context
menu and Ctrl+D.

**Why:** Closes the next desktop-Archi parity gap. Duplicating an element or a
whole view is a common editing action absent from the web app.

**Verified against Archi Java** (`com.archimatetool.editor/.../tree/commands/
DuplicateCommandHandler.java`): only `IArchimateElement` / `IDiagramModel` are
duplicable; name = original + " (copy)"; element copies name/documentation/
properties (not relationships); diagrams deep-copied (`EcoreUtil.copy` +
`generateNewIDs`) so diagram objects get fresh ids while element nodes still
reference the same concepts and connections reuse the same relationships; copy
lands in the same folder.

---

## File structure

- Create: `src/model/ops/duplicate.ts`
  - `duplicateItems(ids: string[]): string[]` — filter to elements + views,
    one `transact('Duplicate')`, pre-generated new ids returned in order.
    Element: `{...el, id, name+' (copy)', properties deep-copied}`. View: copy
    view object + recursively clone nodes (z-order preserved) with an old→new id
    map via `attachNode`, then clone connections whose both endpoints are in the
    map via `attachConnection` (both from `src/model/ops/draft.ts`). Element
    nodes keep `elementId`; connections keep `relationshipId` + bendpoints.
- Modify: `src/model/ops.ts` — add `export * from './ops/duplicate';`.
- Modify: `src/ui/ModelTree.tsx`
  - `readOnly` selector; **Duplicate** item on element/view menus (after Rename,
    before Delete), `disabled: readOnly`, selects the copies after.
- Modify: `src/App.tsx`
  - `onKey`: Ctrl+D branch (tree selection, not read-only, not in text input);
    `preventDefault()`; `duplicateItems` + `setSelection('tree', newIds)`.
- Modify: `src/ui/Toolbar.tsx` — add `['Ctrl+D', 'Duplicate (model tree)']`.
- Create: `tests/duplicate.test.ts`.

## Checklist

- [ ] `duplicateItems` op + barrel re-export.
- [ ] Duplicate context-menu item in ModelTree (read-only aware).
- [ ] Ctrl+D handler in App.tsx.
- [ ] Shortcut help row in Toolbar.tsx.
- [ ] `tests/duplicate.test.ts` (element, view w/ nested child + connection,
      single undo, non-duplicable ids ignored, Archisurance round-trip).
- [ ] `npm test` + `npm run build` green.
- [ ] Drive the app: Duplicate a view via menu + Ctrl+D on an element,
      screenshot, Ctrl+Z restores in one step.

## Semantics reference

- Element copy: new id, `name + ' (copy)'`, same `type`/`documentation`/
  `folderId`/`junctionType`, `properties` deep-copied. Relationships untouched.
- View copy: new id, `name + ' (copy)'`, same folder/`viewpoint`/
  `connectionRouterType`/properties; all nodes deep-copied (same `elementId`),
  z-order + nesting + bounds + styles preserved; connections with both endpoints
  copied get remapped source/target/viewId, same `relationshipId` + bendpoints.
- Whole call = one undo step. Non-element/non-view ids ignored.
