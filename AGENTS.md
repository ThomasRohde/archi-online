# Repository Guidelines

## Project Structure & Module Organization

This is a browser-only Vite + React + TypeScript ArchiMate modeler. Application code lives in `src/`, grouped by responsibility:

- `src/model/` contains the ArchiMate metamodel, rules, normalized store, undo/redo operations, and `.archimate` XML I/O.
- `src/canvas/` contains the SVG view editor, figures, geometry, connections, and pointer interactions.
- `src/ui/` contains the docked shell, toolbar, panels, menus, and Monaco editor integration.
- `src/scripting/` implements the jArchi-compatible API and script runner.
- `src/persistence/` handles File System Access and IndexedDB autosave.

Tests are in `tests/**/*.test.ts`. Static assets and browser entry files are in `public/`, with example models under `public/examples/`. Tooling and source data for generated model rules are in `tools/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts Vite at `http://localhost:5173`.
- `npm test` runs the Vitest suite once in `jsdom`.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run typecheck` runs TypeScript project checks without emitting files.
- `npm run build` runs `tsc -b` and writes the production site to `dist/`.

Run `node tools/generate-rules.mjs` after changing `tools/data/relationships.xml`; it regenerates `src/model/data/relations-matrix.ts`.

## Coding Style & Naming Conventions

Use strict TypeScript with React JSX. Follow the existing style: two-space indentation, single quotes, semicolons, named exports for shared helpers, and PascalCase component filenames such as `Toolbar.tsx`. Keep pure domain behavior in `src/model/` and UI concerns in `src/ui/` or `src/canvas/`. Route model mutations through existing store operations and `transact()`/`runBatch()` so undo, redo, scripting, and UI behavior remain consistent.

## Testing Guidelines

Vitest is the test framework. Name tests `*.test.ts` and colocate new tests under `tests/` by feature area, for example `tests/archimate-xml.test.ts` or `tests/jarchi.test.ts`. Add or update tests for model rules, undo/redo behavior, XML round trips, and scripting API changes. Run `npm test` and `npm run typecheck` before handing off changes.

## Commit & Pull Request Guidelines

Recent commits use imperative, sentence-case summaries such as `Add properties panel` or `Improve canvas navigation`. Keep commits focused on one behavior or feature. Pull requests should include a short description, test results, linked issues when relevant, and screenshots or short clips for visible UI changes.

## Configuration & Generated Files

Do not commit `node_modules/`, `dist/`, coverage output, `.playwright-cli/`, or `*.tsbuildinfo`. Treat `src/model/data/relations-matrix.ts` as generated from `tools/data/relationships.xml`; update both only when the relationship source changes.
