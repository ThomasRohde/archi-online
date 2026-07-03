# App Docs And GitHub Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create user-facing documentation for Archi Online, including scripting and extension APIs, and prepare the docs to be published as GitHub Wiki pages when the project is published to GitHub.

**Architecture:** Keep wiki-ready Markdown in `docs/wiki/` using GitHub Wiki filenames and `_Sidebar.md`. Add small Node tooling to validate local wiki links and publish the directory into a separate GitHub wiki checkout once a GitHub remote exists. Link the repo README to the wiki source so the docs are discoverable before GitHub publication.

**Tech Stack:** Markdown, GitHub Wiki conventions, Node.js ESM scripts, npm scripts.

---

### Task 1: Wiki Document Set

**Files:**
- Create: `docs/wiki/Home.md`
- Create: `docs/wiki/Getting-Started.md`
- Create: `docs/wiki/User-Guide.md`
- Create: `docs/wiki/Scripting-API.md`
- Create: `docs/wiki/Extension-API.md`
- Create: `docs/wiki/Extension-Packages.md`
- Create: `docs/wiki/Development.md`
- Create: `docs/wiki/Publishing-GitHub-Wiki.md`
- Create: `docs/wiki/_Sidebar.md`
- Modify: `README.md`

- [ ] **Step 1: Create wiki pages**

  Write app overview, getting-started, user-guide, scripting API, extension API,
  extension packaging, development, and wiki publishing pages. Use GitHub Wiki
  page links such as `[[Scripting API|Scripting-API]]` so pages work when copied
  into a `.wiki.git` repository.

- [ ] **Step 2: Link docs from README**

  Add a short `Documentation` section pointing to `docs/wiki/Home.md` and the
  major wiki source pages.

### Task 2: Wiki Tooling

**Files:**
- Create: `tools/check-wiki-docs.mjs`
- Create: `tools/publish-wiki.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add wiki link checker**

  Validate that every `[[Page]]`, `[[Label|Page]]`, and local Markdown link in
  `docs/wiki/*.md` resolves to an existing file.

- [ ] **Step 2: Add GitHub Wiki publish helper**

  Copy `docs/wiki/*.md` into a caller-provided wiki checkout. If no checkout is
  provided, derive the wiki remote from `origin` when it points at GitHub, clone
  the `.wiki.git` repository, copy docs, commit, and push.

- [ ] **Step 3: Add npm scripts**

  Add:

  ```json
  {
    "docs:check": "node tools/check-wiki-docs.mjs",
    "docs:publish-wiki": "node tools/publish-wiki.mjs"
  }
  ```

### Task 3: Verification

**Files:**
- Test: `docs/wiki/*.md`
- Test: `tools/check-wiki-docs.mjs`
- Test: `tools/publish-wiki.mjs`
- Test: `package.json`

- [ ] **Step 1: Run docs check**

  Run: `npm run docs:check`

  Expected: all wiki links resolve.

- [ ] **Step 2: Run TypeScript and tests**

  Run: `npm run typecheck`

  Expected: exit 0.

  Run: `npm test`

  Expected: all tests pass.

- [ ] **Step 3: Confirm GitHub wiki publish readiness**

  Inspect `tools/publish-wiki.mjs` help and verify it supports a future GitHub
  wiki checkout without needing a current remote.
