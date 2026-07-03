# Example Extension Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful local example extensions under `./extensions` that demonstrate V2 package capabilities.

**Architecture:** Each extension is a source package folder with `manifest.json`, `main.js`, optional `README.md`, `data/`, and `assets/`. A repo-local `extensions/build-archives.mjs` script validates these folders and writes importable `.archi-ext` archives to `extensions/dist/`.

**Tech Stack:** Browser extension runtime API, jArchi scripting globals, `fflate`, Vitest, Node.js build script.

---

## File Structure

- Create `extensions/README.md` for import/build instructions.
- Create `extensions/build-archives.mjs` for package folder validation and archive generation.
- Create `extensions/model-audit-dashboard/` for model audit commands, panel, toolbar, packaged rules, and private storage.
- Create `extensions/selection-workbench/` for selection event/history and context menu behavior.
- Create `extensions/package-showcase/` for manifest/package/assets API demonstrations.
- Create `extensions/event-log-console/` for lifecycle event listening and panel rendering.
- Add `tests/extension-examples.test.ts` to validate folders, generated archive bytes, and runtime registration.

## Tasks

- [ ] Write failing tests asserting the four package folders exist, each manifest points to a main file, archive bytes import through `readExtensionArchive`, and each package registers at least one command.
- [ ] Add `extensions/build-archives.mjs` with path-safe zip creation and package folder validation.
- [ ] Add the four extension source folders with useful scripts and assets.
- [ ] Run `npm test -- tests/extension-examples.test.ts` and fix issues until green.
- [ ] Run `node extensions/build-archives.mjs`, then full `npm test`, `npm run typecheck`, and `npm run build`.

## Self-Review

- Spec coverage: each approved example extension maps to a folder and exercises a different runtime surface.
- Placeholder scan: no placeholders or deferred behaviors.
- Type consistency: manifests use V2 `schemaVersion: 2`, `main: "main.js"`, and `local.*` IDs that match `app.extension(...)`.
