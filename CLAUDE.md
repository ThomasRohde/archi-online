# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Web-based ArchiMate modeler (clone of the desktop Archi tool). React 18 + TypeScript + Vite, Zustand/Immer, custom SVG canvas, dockview shell, jArchi-compatible scripting. No backend — models live in `.archimate` files and IndexedDB autosave.

## Commands

- `npm run dev` — dev server on :5173
- `npm test` — vitest; single file: `npx vitest run tests/ops.test.ts`
- `npm run build` — `tsc -b` typecheck + vite build (run before committing; there is no separate lint)
- `node tools/generate-rules.mjs` — regenerate `src/model/data/relations-matrix.ts` from Archi's `tools/data/relationships.xml`. Never edit the generated file by hand.

## Architecture rules

- **All model mutations go through `src/model/ops.ts`** (each op wraps `transact()` in `src/model/store.ts`, which records Immer patches for undo/redo). Never write to `model` via `useStore.setState` directly. A script run wraps its ops in `runBatch()` = one undo step.
- **Fidelity to Archi is the spec.** For figures, icons, colors, relationship rules, or file-format behavior: read Archi's Java source (github.com/archimatetool/archi) and port it exactly — don't invent approximations. Icons in `src/canvas/figures/icons.tsx` are 1:1 transcriptions of Archi's `drawIcon()` methods.
- **`.archimate` round-trip must stay lossless** — `tests/archimate-xml.test.ts` verifies against the real Archisurance fixture. Bendpoints are stored in Archi's relative format (startX/startY/endX/endY) and converted to absolute only at render time.
- Element figures have two variants: `figureType` 0 (default: box/rounded box + corner icon; octagon for motivation) and 1 (classic notation shape, no icon).
- `src/model/` and `src/scripting/` must stay free of React imports (DOMParser in `io/` is the only DOM use).
- Dockview panels sync with the store in `src/ui/DockLayout.tsx` behind a module-level `syncing` guard; view panels have ids `view:<viewId>`. Don't persist layout while a group is maximized.

## Feature workflow

Non-trivial features get a design doc in `docs/superpowers/specs/` and an implementation plan in `docs/superpowers/plans/` (dated filenames) before coding.

## Verifying UI changes

After vitest + build, drive the real app: start `npm run dev`, open it with playwright-cli, and screenshot. Dev-only hooks on `window`: `__archiStore` (the Zustand store), `__archiRunScript(code)` (jArchi runner), `__archiLoadXml(xml)`.

Gotchas when driving the browser:
- Never `import('/src/...')` from page evals — Vite serves HMR-touched modules under `?t=` URLs, so you get duplicate module instances and mutate a phantom store. Use the `window.__archi*` hooks.
- Synthetic PointerEvents with fake pointerIds silently abort canvas handlers (`setPointerCapture` throws). Use real mouse input (`mousemove`/`mousedown`/`mouseup`); for modifier+wheel use a dispatched `WheelEvent` with `cancelable: true`.
- Canvas hit-testing uses `document.elementFromPoint`, not `event.target` (pointer capture retargets events). Wheel zoom lives in a native non-passive listener — React's `onWheel` is passive and can't `preventDefault`.

## Publishing to here.now

The built app is hosted at **https://bitter-mill-c9qn.here.now/** via the `here-now`
skill (installed at `~/.agents/skills/here-now/`). Publishing is manual/on-request —
it is **not** part of the build gate. Authenticated (permanent) publishes read the API
key from `~/.herenow/credentials`.

Workflow: build, then publish the `dist/` folder to the existing slug. Vite's base is
`/`, so `dist/index.html` serves correctly at the here.now root.

```bash
npm run build   # produces dist/
```

**Windows gotcha — do NOT publish with Git Bash's `curl`.** Its Schannel TLS backend
cannot complete the Cloudflare R2 upload (R2 requests a TLS renegotiation Schannel
can't do → `curl: (43) A libcurl function was given a bad argument`; the here.now API
calls succeed, only the storage-upload leg fails). The skill's scripts are also CRLF,
which WSL's stock bash rejects (`set -o pipefail\r`). Publish through **WSL** (curl with
OpenSSL), stripping CR at runtime and setting `HOME` to the Windows home so the script
finds the credentials — the key is never passed on the command line:

```bash
wsl.exe -e bash -c '
SK=/mnt/c/Users/thoma/.agents/skills/here-now/scripts
tr -d "\r" < "$SK/publish.sh" > "$SK/.publish.nocr.sh"
export HOME=/mnt/c/Users/thoma
cd /mnt/c/Users/thoma/Projects/archi-online
bash "$SK/.publish.nocr.sh" dist --slug bitter-mill-c9qn --client claude-code
rc=$?; rm -f "$SK/.publish.nocr.sh"; exit $rc
'
```

The publish needs outbound network, so it must run with the Bash sandbox disabled.
Success shows `publish_result.auth_mode=authenticated`; verify the live site by
fetching its root (via WSL curl) and confirming it matches `dist/index.html`. To create
a *new* site instead of updating, drop `--slug`. `dist/` and `.herenow/` are gitignored;
never commit `~/.herenow/credentials` or `.herenow/state.json`.
