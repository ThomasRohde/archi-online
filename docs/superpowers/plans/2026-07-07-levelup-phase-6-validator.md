# LEVELUP Phase 6 — Model Validator panel (2026-07-07)

Implementation plan for Phase 6 of `LEVELUP.md`. Ports Archi's validator (the
**Hammer** plugin,
`com.archimatetool.hammer/src/com/archimatetool/hammer/validation/`) as a
read-only, on-demand panel. Depends on Phase 5's viewpoint table.

## Checkers (ported 1:1 — severity/rule/wording from Archi)

Message templates transcribed from `checkers/messages.properties` (NLS `''` → `'`).

| Rule id | Severity | Message | Click target |
|---|---|---|---|
| `invalid-relationship` | error | `{relType} is not allowed between '{srcName}' and '{tgtName}'` | conceptId = rel |
| `junction` | error | `'{name}' has different relationship types` | conceptId = junction |
| `duplicate-name` | warning | `The name '{name}' is used more than once for the type '{typeLabel}'.` | conceptId = element |
| `unused-element` | warning | `'{name}' is not used in a View` | conceptId = element |
| `unused-relationship` | warning | `'{name}' is not used in a View` | conceptId = rel |
| `viewpoint` | warning | `'{conceptLabel}' does not belong in '{viewName}' ({viewpointName} Viewpoint)` | viewId + objectId = node |
| `empty-view` | advice | `'{viewName}' is empty` | viewId = view |
| `nested-elements` | advice | `'{childName}' is nested inside of '{parentName}' but there is a non-nesting relationship between them or no relationship.` | viewId + objectId = childNode |

Semantics, name/label rules, and nested-elements algorithm: see the full
description in `LEVELUP.md` §6 and the approved plan. Key reuse:
`isAllowedRelationship` (rules.ts), `isAllowedElementInViewpoint` +
`viewpointName` (data/viewpoints.ts), `viewsUsing` / `modelRelations`
(analysis.ts), `elementLabel` / `relationshipLabel` (metamodel.ts).

`validateModel` composes checkers in `Validator.java` order: invalid, unused
elements, unused relations, empty views, viewpoint, nested, duplicate,
junctions.

## Tasks
- [ ] `src/model/data/viewpoints.ts` — add `viewpointName(id)`.
- [ ] `src/model/validation.ts` — engine (React-free): `Severity`,
      `ValidationIssue`, one fn per checker, `validateModel`.
- [ ] `src/ui/ValidatorPanel.tsx` — Validate button, `N errors, N warnings,
      N advice` summary, severity-grouped rows (⛔/⚠️/ℹ️), click-to-navigate.
- [ ] `src/ui/dock/layout-config.tsx` — register `validator` (dock with
      `scripts` within, else below); not in `buildDefaultLayout`.
- [ ] `src/styles.css` — `.validator-*` classes.
- [ ] `tests/validation.test.ts` — per-checker + Archisurance no-errors + panel
      component test.
- [ ] `tests/dock-layout-config.test.ts` — Validator dock placement.

## Gate
`npm test` → `npm run build` → drive app (load Archisurance via
`__archiLoadXml`, open Validator, Validate, screenshot; inject an illegal
relationship, re-validate, click the error, screenshot). One commit:
`feat: Model Validator panel`.
