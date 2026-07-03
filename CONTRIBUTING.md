# Contributing

Thanks for improving Archi Online. This project is a browser-only Vite, React,
and TypeScript ArchiMate modeler.

## Development Setup

```bash
npm install
npm run dev
```

The dev server usually runs at `http://localhost:5173`.

## Before Opening A Pull Request

Run the same checks used by CI:

```bash
npm run ci:check
node extensions/build-archives.mjs
```

`npm run lint` currently reports one known React hook warning in
`src/ui/AppDialog.tsx`; do not add new lint errors.

## Code Style

- Use TypeScript and React patterns already present in the repo.
- Keep domain behavior in `src/model/`.
- Keep canvas interaction behavior in `src/canvas/`.
- Keep app shell and panel UI in `src/ui/`.
- Keep scripting wrappers and extension runtime behavior in `src/scripting/`
  and `src/extensions/`.
- Route model mutations through existing operations and transactions.

## Generated Files

Do not commit `dist/`, `coverage/`, `.herenow/`, `.wiki-publish/`, or generated
extension archives under `extensions/dist/`.

Run `node tools/generate-rules.mjs` only after changing
`tools/data/relationships.xml`.

`tools/data/relationships.xml` and `src/canvas/figures/icons.tsx` contain
Archi-derived material. Keep `THIRD_PARTY_NOTICES.md` accurate if those sources
or derived files change.

## Documentation

Wiki source lives in `docs/wiki/`. Check docs links with:

```bash
npm run docs:check
```

See `docs/github-publication.md` for the repository publication runbook.
