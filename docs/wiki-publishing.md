# Publishing the GitHub Wiki

GitHub Wiki content is stored in a separate Git repository whose URL ends in
`.wiki.git`. This project keeps the wiki source in the main repository at
`docs/wiki/` so documentation is reviewed with normal code changes; a helper
script copies the pages to the wiki repository.

This is maintainer process documentation — it intentionally lives in the
repository, not on the wiki itself.

## Source of truth

Edit wiki pages in:

```text
docs/wiki/
```

Do not edit a wiki checkout directly unless you copy the changes back to
`docs/wiki/` — the publish script overwrites the wiki with the repository
content and deletes wiki pages that no longer exist in `docs/wiki/`.

## Check links

```bash
npm run docs:check
```

This validates GitHub-wiki-style `[[links]]` and relative Markdown links in
`docs/wiki/*.md`.

## Publish

```bash
npm run docs:publish-wiki
```

The script derives the wiki remote from `origin`
(`https://github.com/OWNER/REPO.wiki.git` or the SSH equivalent), clones or
pulls the wiki repository into `.wiki-publish/`, syncs pages (including
deleting stale ones), commits, and pushes.

Options:

```bash
npm run docs:publish-wiki -- --dry-run                       # preview actions
npm run docs:publish-wiki -- --wiki-dir ../archi-online.wiki # use an existing checkout
npm run docs:publish-wiki -- --remote URL                    # explicit wiki remote
```

## First-time setup

GitHub creates the backing wiki repository only after the first wiki page has
been created once in the GitHub web UI. If `docs:publish-wiki` reports
`Repository not found`:

1. Enable the Wiki in the repository settings.
2. Open the Wiki tab and create a temporary first page.
3. Rerun `npm run docs:publish-wiki`.

## Authentication

The publish helper uses your normal local Git authentication (credential
manager or SSH key).
