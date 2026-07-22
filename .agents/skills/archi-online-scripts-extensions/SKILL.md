---
name: archi-online-scripts-extensions
description: Create, modify, package, review, and troubleshoot Archi Online `.ajs` scripts, editable source extensions, and `.archi-ext` extension packages. Use for jArchi-style model automation, `app` API commands, menus, toolbar buttons, panels, events, private storage, packaged assets, manifests, extension examples, and scripting or extension compatibility work in the `archi-online` repository or in standalone artifact folders.
---

# Archi Online Scripts and Extensions

Build artifacts against Archi Online's supported wrapper APIs, preserve undo/read-only/session behavior, and prove the result with the bundled checker plus the repository tests that own the changed surface.

## Choose the artifact

1. Use an `.ajs` script for user-triggered model automation in the Scripting panel.
2. Use a source extension for browser-local commands, menus, toolbar buttons, panels, events, or recurring workflows that the user wants to edit in the Extensions panel.
3. Use an extension package when the artifact must be portable or needs bundled JSON, documentation, or image assets. Package it as a `.archi-ext` ZIP with a schema-v2 manifest.

Read [references/scripting.md](references/scripting.md) for scripts. Read [references/extensions.md](references/extensions.md) for source extensions or packages. Read both when an extension mutates or inspects the model.

When working inside the `archi-online` repository, treat the current repository as authoritative and inspect these before implementation:

- `ARCHITECTURE.md`
- `docs/wiki/Scripting-API.md`
- `docs/wiki/Extension-API.md` and `docs/wiki/Extension-Packages.md`
- the closest example under `extensions/`
- `src/scripting/jarchi-dts.ts` for exact public signatures
- the relevant tests under `tests/jarchi*.test.ts` or `tests/extensions*.test.ts`

Do not assume the bundled reference is newer than the checked-out source.

## Build workflow

1. Restate the requested behavior as observable inputs, model changes, output, and failure behavior.
2. Select the nearest existing example or copy a starter from `assets/`:
   - `assets/starter-script.ajs`
   - `assets/starter-extension/`
3. Use namespaced, stable IDs. Keep one extension ID across the manifest, `app.extension()`, commands, menus, toolbar buttons, panels, and storage namespace.
4. Read and mutate model content through jArchi wrappers. Never mutate `app.model.current()` or raw store state.
5. Treat model names, properties, file names, IDs, and event payloads as untrusted. Build panel UI with DOM nodes and `textContent`, not interpolated `innerHTML`.
6. Keep all model mutations that must share one undo step inside one synchronous script run or command block. Gather awaited input first; do not split a logical mutation across `await` boundaries. For an extension that must confirm asynchronously and then batch several mutations, use the guarded self-dispatch pattern in `references/extensions.md`.
7. Await `app.storage`, dialogs, layouts, and `app.commands.run()`. Storage is browser/profile-local and must never be represented as model data.
8. Handle empty selections, no active view, invalid relationships, read-only models, stale wrappers/previews, and repeated extension reloads explicitly.
9. Keep package paths relative, normalized with `/`, and free of `.` or `..` segments. Declare schema version 2 and include UTF-8 `manifest.json` plus the UTF-8 `main` file.

Prefer `var` and `function` in portable scripts unless the requested artifact benefits from newer syntax. Do not use desktop-only Java/Eclipse APIs, filesystem access, or `require()`; Archi Online runs trusted JavaScript in the browser and exposes only the documented globals as a stable contract.

## Validate and package

Run the bundled checker from the skill directory:

```text
python scripts/artifact_tool.py check path/to/script.ajs
python scripts/artifact_tool.py check path/to/extension-folder
python scripts/artifact_tool.py build path/to/extension-folder --output path/to/tool.archi-ext
python scripts/artifact_tool.py check path/to/tool.archi-ext
```

The checker verifies JavaScript parsing when Node is available, schema-v2 package structure, safe paths, limits, namespaced contribution IDs, manifest/runtime consistency, and deterministic archive creation. Treat warnings as review prompts, not automatic proof of correctness.

Inside the repository, also run the narrow owning checks:

- Scripts or public wrapper behavior: `npm test -- tests/jarchi.test.ts tests/jarchi-dts.test.ts`
- Extensions or packages: `npm test -- tests/extensions.test.ts tests/extension-packages.test.ts tests/extension-examples.test.ts`
- Bundled package sources: `node extensions/build-archives.mjs`, then validate/import the resulting archive
- Public API or user-visible behavior changes: update the wiki docs and run `npm run docs:check`
- Before a broad handoff: `npm run lint`, `npm run typecheck`, and the relevant tests; use `npm run ci:check` for repository releases when practical

For standalone artifacts, import the `.ajs` file through the Scripting panel or the `.archi-ext` file through Extensions > Import package. Exercise the success path, failure/empty-state path, undo behavior for mutations, reload behavior for extensions, and the Extensions error list.

## Deliver

Return the real `.ajs`, source-extension folder, or `.archi-ext` artifact rather than only pasting a snippet. Report:

- what the artifact does and where it lives;
- how to install/import and invoke it;
- validation and tests run;
- trust, compatibility, or untested browser behavior that remains.
