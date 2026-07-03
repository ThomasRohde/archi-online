# Development

## Repository Layout

```text
src/model/        ArchiMate metamodel, rules, store, ops, XML I/O
src/canvas/       SVG view editor, figures, geometry, interactions
src/ui/           dock shell, toolbar, panels, menus, Monaco integration
src/scripting/    jArchi-compatible wrappers, selectors, globals, runner
src/extensions/   extension registry, runtime, package import/export
src/persistence/  file open/save and IndexedDB autosave
tests/            Vitest suites
tools/            generation and project utility scripts
extensions/       example extension package sources
docs/wiki/        GitHub Wiki source pages
```

## Commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run docs:check
```

`npm run build` runs TypeScript project checks and writes a static production
site to `dist/`.

## Generated Rules

Relationship rules are generated from Archi's relationship matrix:

```bash
node tools/generate-rules.mjs
```

Run this only when `tools/data/relationships.xml` changes. It regenerates
`src/model/data/relations-matrix.ts`.

## Testing

Test files live under `tests/**/*.test.ts`.

Core suites cover:

- metamodel rules
- model operations and undo/redo
- `.archimate` XML parse/serialize
- file save/open behavior
- settings persistence and validation
- jArchi scripting wrappers
- extension runtime and package validation
- example extension package sources

Before handing off changes, run:

```bash
npm test
npm run typecheck
npm run build
```

For docs changes, also run:

```bash
npm run docs:check
```

## Extension Examples

Build example extension archives:

```bash
node extensions/build-archives.mjs
```

Generated archives are written to `extensions/dist/` and ignored by Git.

## Documentation Workflow

Wiki source lives in `docs/wiki/`. The files are named for GitHub Wiki pages:

- `Home.md`
- `_Sidebar.md`
- `Scripting-API.md`
- `Extension-API.md`

Check wiki links:

```bash
npm run docs:check
```

Publish to GitHub Wiki after a GitHub remote exists:

```bash
npm run docs:publish-wiki
```

See [[Publishing GitHub Wiki|Publishing-GitHub-Wiki]].

