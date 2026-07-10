# Architectural Principles for Archi Online

This guidance is for Codex and other coding agents modifying this repository. It complements the existing repository guidelines. Treat these principles as architectural constraints, not style preferences.

## 1. Product architecture: browser-first, local-first

- Archi Online is a browser-only, static web application. Do not introduce a backend, server-only runtime, mandatory cloud service, or network dependency for core modeling, validation, scripting, layout, persistence, import, or export.
- Model data stays local by default. Any sharing, publishing, AI, telemetry, or external integration must be explicit, user-initiated, reversible, and documented.
- The production app must keep working from Vite-built static assets. Do not add deployment assumptions that require a special server beyond static hosting.
- Browser APIs are integration boundaries. Keep File System Access, IndexedDB, PWA launch/share handling, clipboard, and download fallbacks isolated in their owning modules.

## 2. The model layer is the source of truth

- `src/model/` owns ArchiMate semantics: metamodel, relationship rules, validation, normalized model state, undo/redo operations, model analysis, and file/interchange I/O.
- Do not duplicate domain rules in `src/ui/`, `src/canvas/`, `src/scripting/`, `src/extensions/`, or tests. Those layers may call the model layer; they must not become alternate sources of truth.
- Keep `src/model/` free of React and UI dependencies. DOM usage belongs only at explicit I/O boundaries when unavoidable.
- Preserve the normalized model shape. Do not create parallel mutable object graphs, hidden caches that become authoritative, or UI-local model state that can drift from the store.

## 3. Mutations are operations, not ad hoc state edits

- All model mutations go through operations exported from `src/model/ops.ts` or implementation modules under `src/model/ops/`.
- Every operation that changes model content must be wrapped by `transact()` so undo, redo, dirty tracking, scripting, extensions, autosave, and UI updates stay coherent.
- Do not mutate `state.model` through `useStore.setState`, direct object writes, React-local object copies, or wrapper escape hatches.
- `useStore.setState` is acceptable only for non-model UI/application state through established store functions such as selection, active tool, open views, boot state, or model replacement.
- Honor `readOnly`. No feature may create, delete, move, style, import, script, or auto-layout model content when the store is read-only.

## 4. Undo/redo is an architectural contract

- If the user experiences a change as one action, it must be one undo step.
- Scripts, extension commands, imports, bulk operations, generated model changes, and automatic layout must batch their model mutations with `runBatch()` or an equivalent existing operation boundary.
- Failed validation, failed import, failed script execution, or failed extension command should leave the model unchanged when practical. When partial mutation is unavoidable, keep it inside one transaction and test the failure path.
- New operations must prune or preserve selection, open views, active view, dirty state, and undo/redo stacks consistently with existing store behavior.

## 5. Fidelity to desktop Archi is the compatibility spec

- For ArchiMate rules, figures, icon geometry, default sizes, colors, validators, CSV, Open Exchange XML, `.archimate` XML, bendpoints, and file-format behavior, desktop Archi is the reference implementation.
- Do not invent approximate behavior when Archi behavior can be checked or ported. Prefer a narrow, faithful port over a broader approximation.
- `.archimate` round-trip fidelity is non-negotiable. Model elements, relationships, folders, views, layout, colors, bendpoints, properties, and supported Archi-specific details must survive parse/serialize cycles.
- Browser-local state such as scripts, extensions, settings, autosave, dock layout, PWA state, and transient UI state must not be written into `.archimate` files.
- Unsupported desktop Archi features must fail safely, be documented, and avoid silent corruption. If preservation is not possible, warn or document the limitation clearly.

## 6. Generated and derived files are not hand-authored

- Treat `src/model/data/relations-matrix.ts` as generated output from `tools/data/relationships.xml` via `node tools/generate-rules.mjs`.
- Do not hand-edit generated rule data. Change the source data or generator, regenerate, and test.
- Do not commit `node_modules/`, `dist/`, coverage output, extension build archives, `.tsbuildinfo`, or local tool state.
- If generated files change, the commit must explain the source change and include the generator command in the handoff notes.

## 7. Layer ownership and dependency direction

| Area | Owns | Must not own |
| --- | --- | --- |
| `src/model/` | Domain model, metamodel, rules, validation, operations, undo/redo, XML/CSV/exchange I/O | React components, dock layout, canvas gestures, browser persistence policy |
| `src/canvas/` | SVG view rendering, figures, geometry, connection routing visuals, pointer interactions, image export | ArchiMate semantics, file persistence, scripting API contracts |
| `src/ui/` | App shell, dockview layout, panels, toolbar, menus, properties, model tree, Monaco integration | Independent model mutation logic or duplicated validation rules |
| `src/scripting/` | jArchi-compatible wrappers, selectors, globals, script runner | React, UI state as domain truth, direct model writes outside operations |
| `src/extensions/` | Extension registry, runtime, app API, packages, command/menu/panel/event contribution model | Raw model mutation contracts that bypass wrappers/operations |
| `src/persistence/` | File open/save, downloads, IndexedDB autosave, browser-local key-value storage | ArchiMate semantics or UI rendering assumptions |
| `src/settings/` | Browser-local application settings | Model file content or domain behavior |
| `src/pwa/` | Web manifest, launch/share/protocol handling, unload guard | Core modeling logic or persistence formats |
| `docs/wiki/` | User and developer documentation published as wiki/pages | Unreviewed behavior that diverges from code |
| `tools/` | Code generation and project utilities | Runtime-only application behavior |

## 8. Scripting and extensions are public compatibility surfaces

- Preserve jArchi-style scripting compatibility. Changes to selectors, wrappers, traversal, creation APIs, properties, and script-visible behavior require tests and documentation.
- A script run is one undoable operation from the user's perspective.
- Extension APIs are trusted local code, but model names, file names, IDs, properties, package metadata, and event payloads are external data. Treat them as untrusted strings.
- When building extension panel DOM or package-rendered UI, prefer `textContent`, DOM node creation, and explicit escaping over `innerHTML`.
- Extension IDs, command IDs, menu IDs, toolbar IDs, panel IDs, and storage namespaces must be stable and namespaced under the extension or package ID.
- Extension load, command, and event errors must be isolated to the failing extension and must not corrupt the app, registry, or current model.

## 9. Canvas and UI are projections of model state

- Canvas and UI components render current store state and dispatch model operations. They must not own persistent model truth.
- Keep geometry, hit testing, layout calculations, and figure logic pure and testable where practical.
- Relationship creation, magic connector behavior, and live validity feedback must use the model rules rather than duplicated UI-specific relationship matrices.
- Preserve dock layout stability. Do not persist transient maximized layout state or remove existing guards that prevent store/layout feedback loops.
- Dev-only browser hooks may be used for manual or automated verification, but they are not production APIs.

## 10. Interchange and import/export must be conservative

- Importers must validate IDs, known types, relationship legality, coordinates, styles, and references before applying changes where practical.
- Imports that update the current model should be a single undo step and should abort without changing the model on validation failure.
- Exporters must not leak browser-local state, secrets, extension storage, autosave records, or transient UI state.
- Image, XML, CSV, Open Exchange, `.archimate`, and extension package export paths must remain client-side unless the user explicitly chooses a sharing/publishing workflow.

## 11. Agentic/model-generation work must be declarative and reviewable

- If adding AI-assisted model creation or editing, prefer a declarative, validated plan format that describes elements, relationships, views, and layout hints before applying changes.
- Validate generated plans in `src/model/` before mutation: known types, resolved references, allowed relationships, finite coordinates, unique keys, reasonable size limits, and safe defaults.
- Apply generated changes through normal model operations and batch them into one undo step.
- Do not drive generated model edits by simulating canvas clicks when a domain operation can express the intent directly. UI automation is for verification, not the primary model-write path.

## 12. Security and privacy defaults

- Do not add telemetry, remote logging, analytics, model upload, package fetch, or external script loading by default.
- Never log model content, file contents, user scripts, extension source, local paths, or potentially sensitive properties unless the user explicitly requests diagnostic output.
- Keep dependency additions rare. Before adding a production dependency, check whether the existing stack can solve the problem. Prefer small, auditable code over large general-purpose packages.
- Any new dynamic code execution path must document its trust model and test error isolation.

## 13. Documentation and design discipline

- Non-trivial features need a short design note in `docs/superpowers/specs/` and an implementation plan in `docs/superpowers/plans/` before coding.
- User-visible behavior changes require updates in `docs/wiki/` and `npm run docs:check`.
- Public API changes in scripting or extensions require examples and compatibility notes.
- Architectural shortcuts are not acceptable just because tests pass. If a requested change conflicts with these principles, implement an architecture-safe alternative and explain the trade-off.

## 14. Verification matrix

Use the narrowest relevant checks while developing, then run the broader gate before handoff when practical.

| Change type | Required verification |
| --- | --- |
| Model operations, undo/redo, deletion, movement, styles, layout | Relevant `tests/*ops*`, `tests/duplicate.test.ts`, `tests/alignment.test.ts`, or feature-specific tests |
| ArchiMate rules or metamodel | Relationship/rules tests plus regenerated matrix check if source data changed |
| `.archimate` I/O | `tests/archimate-xml.test.ts` and fixture round-trip coverage |
| Open Exchange or CSV | `tests/exchange-xml.test.ts`, `tests/csv.test.ts`, and import failure-path tests |
| Scripting API | `tests/jarchi.test.ts`, `tests/jarchi-dts.test.ts`, and examples if behavior is user-visible |
| Extensions or packages | `tests/extensions*.test.ts`, package validation tests, and example package tests |
| Dock layout or UI shell | Dock/layout tests plus manual browser check for visible changes |
| Canvas interactions or rendering | Geometry/canvas-related tests plus manual browser check or screenshot for visible changes |
| Docs | `npm run docs:check` |
| Dependency, security, or build config | `npm run lint`, `npm run typecheck`, `npm test`, `npm run security:audit`, `npm run build` |

Preferred full gate before handoff:

```bash
npm run ci:check
```

If the full gate cannot run, report exactly which checks ran, which did not, and why.

## 15. Codex working rules

Before editing:

1. Identify the owning layer from the table above.
2. Read the closest existing implementation and tests for that layer.
3. Prefer extending an existing operation, wrapper, registry, or adapter over creating a parallel path.
4. Plan the smallest change that preserves undo/redo, Archi compatibility, local-first behavior, and testability.

While editing:

- Keep changes focused and reviewable.
- Avoid cross-layer imports that violate ownership.
- Do not add broad abstractions until at least two concrete call sites need them.
- Do not weaken tests to make a change pass.
- Add regression tests for every fixed bug and every new public behavior.

Before handoff:

- Review the diff against these principles.
- Confirm generated files were produced by their generators.
- Confirm model mutations are operation-based and undoable.
- Confirm `.archimate` and interchange compatibility risks are tested.
- Confirm user-visible behavior is documented.
- State the commands run and any remaining risk plainly.

## 16. Review guidelines

When reviewing a change, flag the following as high-risk architecture issues:

- Direct mutation of `state.model` outside model operations.
- React imports or UI dependencies in `src/model/` or `src/scripting/`.
- New backend, telemetry, upload, or network dependency for core local workflows.
- Hand edits to generated relationship data.
- `.archimate`, CSV, or Open Exchange behavior changes without round-trip/import/export tests.
- Scripting or extension API changes without compatibility tests.
- User/model/package strings inserted through unsafe HTML paths.
- Canvas/UI code duplicating relationship rules or metamodel decisions.
- Operations that bypass undo/redo, dirty tracking, read-only guards, or batching.
- New production dependencies without a clear architectural need.
