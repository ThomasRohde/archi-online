# Publishing the documentation site (GitHub Pages)

The documentation website at
**https://thomasrohde.github.io/archi-online/** is built with
[VitePress](https://vitepress.dev/) from the same Markdown that powers the
GitHub Wiki (`docs/wiki/*.md`), and deployed by the
[`.github/workflows/docs.yml`](../.github/workflows/docs.yml) GitHub Actions
workflow. A push to `main` that touches `docs/`, `src/`, `public/`, or the
build config rebuilds and redeploys the site.

This is maintainer process documentation — it intentionally lives in the
repository, not on the published site (VitePress excludes it via `srcExclude`).

## What the site contains

The Pages deployment bundles two things at one origin:

| URL | Content | Vite base |
| --- | --- | --- |
| `/archi-online/` | The VitePress docs site | `/archi-online/` |
| `/archi-online/app/` | A live demo of the app itself | `/archi-online/app/` |

The docs pages reuse `docs/wiki/*.md`. A small markdown-it plugin
(`docs/.vitepress/wikiLinks.ts`) rewrites GitHub-wiki `[[links]]` to normal
links; `docs/index.md` is the VitePress hero landing page; and the
wiki-only pages (`_Sidebar.md`, `_Footer.md`, `Home.md`) are excluded.

## The app demo build (two Vite bases)

The default `npm run build` targets the root (`/`) with the full installable
PWA — that build is what ships to here.now. The workflow produces a **second**
build for the subpath demo:

```bash
APP_BASE=/archi-online/app/ npm run build
```

`vite.config.ts` reads `APP_BASE` and, when it is not `/`, **disables the PWA**.
The service worker and web manifest hardcode root-absolute paths, so the
subpath copy is a plain single-page app: fully functional (canvas, scripting,
file open/save, the bundled example models), just without offline install,
share-target, or file-handler registration. The canonical installable PWA
remains the root deployment.

The workflow copies that `dist/` into `docs/.vitepress/dist/app/` before
uploading the combined tree as the Pages artifact.

## Local preview

```bash
npm run docs:dev        # VitePress dev server with hot reload
npm run docs:build      # build to docs/.vitepress/dist (fails on dead links)
npm run docs:preview    # serve the built site

# To preview the combined site (docs + app demo) exactly as deployed:
npm run docs:build
APP_BASE=/archi-online/app/ npm run build
cp -r dist docs/.vitepress/dist/app        # PowerShell: Copy-Item -Recurse dist docs/.vitepress/dist/app
npm run docs:preview                        # app is at .../archi-online/app/
```

`docs:build` runs VitePress's dead-link check. Internal `[[wiki links]]` are
rewritten to `/wiki/<slug>` and must resolve to a page; the `/app/` demo path
is allow-listed in `docs/.vitepress/config.ts` (`ignoreDeadLinks`) because it
is injected at deploy time.

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
