# Publishing GitHub Wiki

GitHub Wiki content is stored in a separate Git repository whose URL ends in
`.wiki.git`. This project keeps the wiki source in the main repository at
`docs/wiki/` so documentation can be reviewed with normal code changes before a
GitHub remote exists.

## Source Of Truth

Edit wiki pages in:

```text
docs/wiki/
```

Do not edit a temporary wiki checkout directly unless you copy the changes back
to `docs/wiki/`.

## Check Links

Run:

```bash
npm run docs:check
```

This validates local GitHub Wiki links and Markdown links in `docs/wiki/*.md`.

## Publish With An Existing Wiki Checkout

If you already have a GitHub Wiki checkout:

```bash
npm run docs:publish-wiki -- --wiki-dir ../archi-online.wiki
```

The script copies `docs/wiki/*.md` into the wiki checkout, commits changes if
needed, and pushes.

## Publish From A GitHub Remote

After the main repository has a GitHub `origin`, run:

```bash
npm run docs:publish-wiki
```

The script derives the wiki remote from `origin`, clones the wiki repository
into `.wiki-publish/`, copies pages, commits changes if needed, and pushes.

The derived remote forms are:

```text
https://github.com/OWNER/REPO.wiki.git
git@github.com:OWNER/REPO.wiki.git
```

## Dry Run

Preview what would happen:

```bash
npm run docs:publish-wiki -- --dry-run
```

## First GitHub Publish Checklist

1. Follow the repository runbook in `docs/github-publication.md`.
2. Push the main repository to GitHub.
3. Enable the repository Wiki in GitHub settings if it is not already enabled.
4. Run `npm run docs:check`.
5. Run `npm run docs:publish-wiki -- --dry-run`.
6. Run `npm run docs:publish-wiki`.
7. Open the GitHub Wiki **Home** page and verify `_Sidebar.md` renders.

## Authentication

The publish helper uses local Git authentication. Configure GitHub credentials
through your normal Git credential manager or SSH key before publishing.

Related pages:

- [[Home]]
- [[Development]]
