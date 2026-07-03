# GitHub Publication Runbook

This repository is prepared for GitHub publication from the current working
tree. Use this checklist when creating the public repository.

## Pre-Publish Checks

Run:

```bash
npm run ci:check
node extensions/build-archives.mjs
npm run docs:publish-wiki -- --dry-run
```

Expected:

- docs links resolve
- lint has no errors
- TypeScript checks pass
- Vitest passes
- npm audit reports no vulnerabilities
- production build succeeds
- extension archives can be generated
- wiki publishing dry run lists the pages that would be copied

## Create The GitHub Repository

1. Create an empty GitHub repository.
2. Keep the repository wiki enabled if the docs should be published there.
3. Add the remote:

   ```bash
   git remote add origin git@github.com:OWNER/REPO.git
   ```

4. Push the intended branch:

   ```bash
   git push -u origin main
   ```

If publishing a feature branch first, push that branch and open a pull request
instead of pushing directly to `main`.

## Repository Settings

Recommended GitHub settings:

- Enable GitHub Actions.
- Enable the Wiki.
- Protect `main` once the first CI run passes.
- Require the `CI / validate` workflow before merging pull requests.
- Enable private vulnerability reporting if the repository is public.

## License And Notices

The project license is MIT, matching Archi. Keep `LICENSE` and
`THIRD_PARTY_NOTICES.md` in the repository root so the Archi-derived
relationship matrix and icon geometry retain their attribution.

## Publish The Wiki

After `origin` points to GitHub and the Wiki exists:

```bash
npm run docs:check
npm run docs:publish-wiki -- --dry-run
npm run docs:publish-wiki
```

The source of truth remains `docs/wiki/` in this repository.

## Deploy The App

The production app is a static site from `dist/`:

```bash
npm run build
```

This workspace currently publishes to here.now separately from GitHub. When the
GitHub repository is public, decide whether to keep here.now as the main hosted
preview, add GitHub Pages, or use both.

## Do Not Commit

These paths are intentionally ignored:

- `node_modules/`
- `dist/`
- `coverage/`
- `.herenow/`
- `.wiki-publish/`
- `extensions/dist/`
- local `.env` files
