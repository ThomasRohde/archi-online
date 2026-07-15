# Repository Guidelines

## Project Structure & Module Organization

This is a browser-only, static Vite + React + TypeScript ArchiMate modeler. Application code lives in `src/`, grouped by responsibility:

- `src/model/` contains the ArchiMate metamodel, rules, normalized store, undo/redo operations, and `.archimate` XML I/O.
- `src/canvas/` contains the SVG view editor, figures, geometry, connections, and pointer interactions.
- `src/ui/` contains the docked shell, toolbar, panels, menus, and Monaco editor integration.
- `src/scripting/` implements the jArchi-compatible API and script runner.
- `src/extensions/` contains the extension registry, package handling, and runtime integration.
- `src/persistence/` isolates File System Access, IndexedDB-backed storage, autosave, sharing, and templates.
- `src/pwa/` owns the service worker, web manifest, launch queue, and share-target behavior.
- `src/settings/` contains persistent application settings and defaults.

Tests are in `tests/**/*.test.ts`. The main Vite entry point is `index.html`; copy-through assets, schemas, examples, and the pop-out entry page are in `public/`. Generators, parity checks, documentation tooling, and their source data are in `tools/`.

## Build, Test, and Development Commands

- Node.js 22 or newer is required.
- `npm install` installs dependencies for local development; use `npm ci` for a clean, lockfile-exact install.
- `npm run dev` starts Vite at `http://localhost:5173`.
- `npm test` runs the Vitest suite once in `jsdom`.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run lint` runs ESLint across the repository.
- `npm run typecheck` runs TypeScript project checks without emitting files.
- `npm run build` type-checks, builds the production site in `dist/`, and verifies license distribution.
- `npm run docs:check` validates the maintained wiki documentation.
- `npm run ci:check` runs the broad application gate: version synchronization, documentation checks, linting, type checks, tests, parity checks, dependency audit, and production build.

Use targeted checks while developing, then run `npm run ci:check` before broad handoffs and releases when practical. For documentation-site or extension-package changes, also run `npm run docs:build` or `node extensions/build-archives.mjs`, respectively. If a relevant check cannot run, report exactly what was skipped and why.

Run `node tools/generate-rules.mjs` after changing `tools/data/relationships.xml`; it regenerates `src/model/data/relations-matrix.ts`.

## Coding Style & Naming Conventions

Use strict TypeScript with React JSX. Follow the existing style: two-space indentation, single quotes, semicolons, named exports for shared helpers, and PascalCase component filenames such as `Toolbar.tsx`. Keep pure domain behavior in `src/model/` and UI concerns in `src/ui/` or `src/canvas/`.

Route every model mutation through operations exported by `src/model/ops.ts` or implemented under `src/model/ops/`, using `transact()` and `runBatch()` so undo, redo, dirty tracking, scripting, extensions, autosave, and UI behavior remain consistent. In multi-model workflows, pass the owning session's `ModelStore` explicitly instead of relying on the globally active store. Read `ARCHITECTURE.md` before non-trivial changes; it is the source of truth for layer ownership, Archi fidelity, local-first behavior, and verification requirements.

## Testing Guidelines

Vitest is the test framework. Name tests `*.test.ts` and place them under `tests/` by feature area, for example `tests/archimate-xml.test.ts` or `tests/jarchi.test.ts`. Add or update tests for model rules, undo/redo behavior, XML round trips, scripting API changes, and every fixed bug or new public behavior. Use the verification matrix in `ARCHITECTURE.md` to select targeted checks.

## Commit & Pull Request Guidelines

Recent commits use imperative, sentence-case summaries such as `Add properties panel` or `Improve canvas navigation`. Keep commits focused on one behavior or feature. Pull requests should include a short description, test results, linked issues when relevant, and screenshots or short clips for visible UI changes.

In this repository, a request to commit or push implies the full release flow unless the user explicitly opts out: run the appropriate verification gate, integrate feature-branch work into `main` before pushing or publishing, rebuild `dist/`, republish the established here.now site, and verify the live root, viewer mode, and built assets. Keep machine-specific publishing commands and credentials in ignored local instructions rather than this file.

## Configuration & Generated Files

Respect `.gitignore` and do not commit dependencies, build output, coverage, local tool state, credentials, nested publishing checkouts, generated extension archives, or local planning artifacts. Notable examples include `node_modules/`, `dist/`, `coverage/`, `.playwright-cli/`, `.herenow/`, `.wiki-publish/`, `extensions/dist/`, `docs/.vitepress/cache/`, `docs/.vitepress/dist/`, `docs/superpowers/`, `docs/brainstorms/`, and `*.tsbuildinfo`.

Treat `src/model/data/relations-matrix.ts` as generated output from `tools/data/relationships.xml`. Never edit the matrix by hand; change the source or generator, run `node tools/generate-rules.mjs`, and include both the source and regenerated output when the relationship data changes.
