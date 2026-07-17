# Publishing the documentation site (GitHub Pages)

The documentation website at
**https://thomasrohde.github.io/archi-online/** is built with
[VitePress](https://vitepress.dev/) from the same Markdown that powers the
GitHub Wiki (`docs/wiki/*.md`), and deployed by the
[`.github/workflows/docs.yml`](../.github/workflows/docs.yml) GitHub Actions
workflow. A push to `main` that touches `docs/` (or the workflow) rebuilds and
redeploys the site.

This is maintainer process documentation — it intentionally lives in the
repository, not on the published site (VitePress excludes it via `srcExclude`).

The **app itself** is not hosted here — it runs at
**https://archi-online.klok-rohde.dk/**, with
**https://bitter-mill-c9qn.here.now/** retained as a fallback URL. It is published
separately via the `here-now` skill; see the root `CLAUDE.md`. GitHub Pages serves
the docs only; the docs' "Open the app" links point at the custom domain.

## What the site contains

The docs pages reuse `docs/wiki/*.md`. A small markdown-it plugin
(`docs/.vitepress/wikiLinks.ts`) rewrites GitHub-wiki `[[links]]` to normal
links; `docs/index.md` is the VitePress hero landing page; and the
wiki-only pages (`_Sidebar.md`, `_Footer.md`, `Home.md`) are excluded.

## Local preview

```bash
npm run docs:dev        # VitePress dev server with hot reload
npm run docs:build      # build to docs/.vitepress/dist (fails on dead links)
npm run docs:preview    # serve the built site
```

`docs:build` runs VitePress's dead-link check. Internal `[[wiki links]]` are
rewritten to `/wiki/<slug>` and must resolve to a page.

## Screenshots

Screenshots live in `docs/public/screenshots/*.png` and are **committed**, so
the deploy workflow stays browserless and deterministic. They are embedded in
the shared `docs/wiki/*.md` pages using absolute
`https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/<name>.png`
URLs, so the same Markdown renders images on **both** the Pages site and the
GitHub Wiki. (The link checker, `tools/check-wiki-docs.mjs`, treats `http(s):`
targets as external and skips them.) The Pages-only hero, `docs/index.md`,
uses root-absolute `/screenshots/...` paths instead.

To regenerate a screenshot, run the app (`npm run dev`), open it with a browser
automation tool, load an example model via the dev hook
`window.__archiLoadXml(xml)` (models are in `public/examples/`), drive it to the
desired state, and capture into `docs/public/screenshots/`. Capture in the
light theme at a generous viewport (~1680×1000) and clip to the relevant panel.

## First-time setup

In the repository settings, under **Pages**, set **Source** to
**GitHub Actions** (already done). The first successful `docs.yml` run
publishes the site; subsequent pushes update it.
