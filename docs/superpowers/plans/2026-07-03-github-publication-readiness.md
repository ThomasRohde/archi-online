# GitHub Publication Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Archi Online to be published as a GitHub repository with clear metadata, CI, community files, license, and publication instructions.

**Architecture:** Add GitHub-native project hygiene without changing app runtime behavior. Keep generated and local deployment artifacts ignored, add CI that runs the existing validation gates, and document the exact first-publish workflow for repository and wiki publication.

**Tech Stack:** GitHub Actions, Markdown community files, npm scripts, Vite/React/TypeScript project checks.

---

### Task 1: Repository Metadata And Hygiene

**Files:**
- Create: `.gitattributes`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Add line-ending and binary file handling through `.gitattributes`.
- [x] Ignore GitHub wiki publish checkout, temporary wiki checkouts, extension archives, and local environment files.
- [x] Add MIT package metadata, Node engine metadata, and a single `ci:check` npm script.
- [x] Refresh `package-lock.json` with `npm install --package-lock-only`.

### Task 2: GitHub Community And CI Files

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

- [x] Add MIT license text for public repository publication.
- [x] Add contributor, security, and conduct guidance.
- [x] Add GitHub Actions CI that runs docs check, lint, typecheck, tests, build, and example extension archive build.
- [x] Add issue and pull request templates.

### Task 3: Publication Runbook

**Files:**
- Create: `docs/github-publication.md`
- Modify: `README.md`
- Modify: `docs/wiki/Publishing-GitHub-Wiki.md`

- [x] Add a GitHub publication checklist covering remote creation, push, Actions, Wiki, and here.now deployment.
- [x] Link the publication runbook from README and wiki publishing docs.

### Task 4: Verification

**Files:**
- Test: all changed files

- [x] Run `npm install --package-lock-only`.
- [x] Run `npm run ci:check`.
- [x] Run `node extensions/build-archives.mjs`.
- [x] Run `git diff --check`.
- [x] Commit the readiness changes.
