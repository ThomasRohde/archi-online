# Development

How to work on Archi Online itself. For contribution guidelines, see
[CONTRIBUTING.md](https://github.com/ThomasRohde/archi-online/blob/main/CONTRIBUTING.md)
in the repository.

## Prerequisites

- Node.js 22+ and npm.

## Repository layout

```text
src/model/        pure-TS domain core: metamodel, rules, store, ops, .archimate XML I/O
src/canvas/       SVG view editor: figures, geometry, interactions
src/ui/           dock shell, toolbar, panels, menus, Monaco integration
src/scripting/    jArchi-compatible wrappers, selectors, globals, runner
src/extensions/   extension registry, runtime, app API, package import/export
src/persistence/  file open/save, IndexedDB autosave, key-value storage
src/settings/     app settings model and store
tests/            Vitest suites
tools/            code generation and project utility scripts
extensions/       example extension package sources
docs/wiki/        source for these wiki pages
```

## Commands

```bash
npm install
npm run dev          # dev server on http://localhost:5173
npm test             # vitest (single file: npx vitest run tests/ops.test.ts)
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
npm run docs:check   # validate wiki page links
npm run ci:check     # docs + lint + typecheck + tests + audit + build
```

## Architecture ground rules

- **All model mutations go through `src/model/ops.ts`.** Each operation wraps
  a transaction that records Immer patches for undo/redo. Scripts and
  extensions batch their operations into single undo steps.
- **Fidelity to desktop Archi is the spec.** Figures, icons, colors,
  relationship rules, and file-format behavior are ported from Archi's Java
  source, not approximated. See [[Archi Compatibility|Archi-Compatibility]].
- **`.archimate` round-trip must stay lossless** — `tests/archimate-xml.test.ts`
  verifies against the real Archisurance fixture.
- **`src/model/` and `src/scripting/` stay free of React imports** so the
  domain core remains portable and testable.

## Generated relationship rules

The allowed-relationship matrix is generated from Archi's own data file:

```bash
node tools/generate-rules.mjs
```

This regenerates `src/model/data/relations-matrix.ts` from
`tools/data/relationships.xml`. Run it only when the source XML changes, and
never edit the generated file by hand.

## Testing

Test files live under `tests/**/*.test.ts`. The suites cover the metamodel
rules, model operations and undo/redo, `.archimate` XML parse/serialize,
file save/open behavior, settings persistence, the jArchi scripting
wrappers, the extension runtime and package validation, and the example
extension packages.

Before handing off changes:

```bash
npm test
npm run typecheck
npm run build
```

or simply `npm run ci:check` for the full gate.

## Example extensions

Build the example `.archi-ext` archives (see
[[Extension Packages|Extension-Packages]]):

```bash
node extensions/build-archives.mjs
```

Archives are written to `extensions/dist/` and are git-ignored.

## Documentation

These wiki pages are maintained in the main repository under `docs/wiki/`, so
documentation changes are reviewed like code changes. After editing:

```bash
npm run docs:check          # validate links
npm run docs:publish-wiki   # copy the pages to the GitHub wiki
```

Details of the publishing helper live in the repository at
[docs/wiki-publishing.md](https://github.com/ThomasRohde/archi-online/blob/main/docs/wiki-publishing.md).
