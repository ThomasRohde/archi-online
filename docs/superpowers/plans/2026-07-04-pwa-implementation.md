# PWA Implementation Plan

**Goal:** Ship the PWA design from `docs/superpowers/specs/2026-07-04-pwa.md`:
installable app with full offline precache, `.archimate` file handling, app
shortcuts, Web Share Target, and a prompt-based update flow.

**Architecture:** `vite-plugin-pwa` in `injectManifest` mode with a small
hand-written `src/sw.ts` (Workbox precache + navigation route + share-target
POST route). All app-side PWA logic lives in `src/pwa/` as React-free modules;
the only React surface is `src/ui/UpdatePrompt.tsx`. OS integrations are
feature-detected and degrade to no-ops outside Chromium.

**Tech Stack:** Vite, React, TypeScript, `vite-plugin-pwa`, `workbox-core`,
`workbox-precaching`, `workbox-routing`, `sharp` (icon generation, dev-only),
Vitest, jsdom.

---

## File Structure

- Create `public/icons/icon.svg` plus checked-in generated PNGs (192, 512,
  maskable 192/512, apple-touch 180).
- Create `tools/generate-icons.mjs`: one-time icon rasterization via sharp.
- Create `src/pwa/webmanifest.ts`: manifest object imported by `vite.config.ts`
  and unit tests.
- Create `src/sw.ts`: custom service worker (precache, navigation fallback,
  share-target POST, SKIP_WAITING).
- Create `src/pwa/boot-signal.ts`, `src/pwa/launch-queue.ts`,
  `src/pwa/actions.ts`, `src/pwa/unload-guard.ts`,
  `src/pwa/share-target-protocol.ts`, `src/pwa/share-target-inbox.ts`.
- Create `src/ui/UpdatePrompt.tsx`, `src/types/launch-queue.d.ts`.
- Modify `vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`,
  `src/main.tsx`, `src/App.tsx`, `src/persistence/files.ts`,
  `src/persistence/autosave.ts`, `src/ui/Toolbar.tsx`, `src/styles.css`.
- Create `tests/pwa-manifest.test.ts`, `tests/pwa-actions.test.ts`,
  `tests/pwa-launch-queue.test.ts`, `tests/pwa-share-target.test.ts`.

---

### Task 1: Icons

- [ ] Draw `public/icons/icon.svg` (512 viewBox, rounded rect `#2a6cc4`, white
      outlined "A" — no font dependency).
- [ ] Add `tools/generate-icons.mjs` (sharp devDep) producing icon-192/512,
      maskable 192/512 (art in central 80% safe zone), apple-touch-icon 180
      (opaque). Commit the PNGs; CI never runs sharp.

### Task 2: Manifest + Vite config + service worker

- [ ] `src/pwa/webmanifest.ts` with name/short_name, `id`/`start_url`/`scope`
      `/`, `display: standalone`, `theme_color #fafafa`,
      `background_color #f4f4f4`, icons, `file_handlers` (`.archimate` under
      `application/xml`), `launch_handler focus-existing`, `shortcuts`
      (`/?action=new`, `/?action=open`), `share_target` (POST multipart, file
      param `model`).
- [ ] `vite.config.ts`: `VitePWA({ strategies: 'injectManifest', srcDir:
      'src', filename: 'sw.ts', registerType: 'prompt', injectRegister: false,
      manifest, injectManifest: { globPatterns, maximumFileSizeToCacheInBytes:
      8 MiB }, devOptions: { enabled: false } })`.
- [ ] `src/sw.ts`: precache manifest, `cleanupOutdatedCaches`, `clientsClaim`,
      SKIP_WAITING handler, NavigationRoute bound to `index.html` with
      denylist `popout.html` + `/share-target`, POST route stashing shared
      files and 303-redirecting to `/?action=share-received`.
- [ ] `tsconfig.json`: add `WebWorker` lib and `vite-plugin-pwa/react` types.
- [ ] `index.html`: real favicon, theme-color, description, apple metas.

### Task 3: Update prompt

- [ ] `src/persistence/autosave.ts`: export `flushAutosaveNow()`.
- [ ] `src/pwa/unload-guard.ts`: `bypassUnloadGuardOnce()` /
      `shouldBlockUnload()`; use in `App.tsx` beforeunload handler.
- [ ] `src/ui/UpdatePrompt.tsx` with `useRegisterSW` (hourly update poll),
      mounted in `src/main.tsx`; `.update-toast` styles in `src/styles.css`.

### Task 4: File handling + shortcuts

- [ ] `src/types/launch-queue.d.ts` declarations.
- [ ] `src/persistence/files.ts`: `openModelFromHandle()`; reuse in
      `openModelFromDisk`.
- [ ] `src/pwa/boot-signal.ts`; signal from `bootEditorRuntime` finally.
- [ ] `src/pwa/launch-queue.ts` consumer (await boot, confirm discard, open);
      init from `main.tsx`. Export `confirmDiscardChanges` from `Toolbar.tsx`.
- [ ] `src/pwa/actions.ts` `consumePwaAction()`; wire `new`/`open`/
      `share-received` branches into `App.tsx` after editor boot (picker needs
      a user gesture → confirm dialog first).

### Task 5: Share target receive

- [ ] `src/pwa/share-target-protocol.ts` constants shared by sw + app.
- [ ] `src/pwa/share-target-inbox.ts` `takeSharedFile()`.
- [ ] `share-received` branch: consume inbox, confirm discard, load model.

### Task 6: Tests + verification

- [ ] Unit tests: manifest shape, action parsing, launch-queue sequencing
      (fake `window.launchQueue`), share inbox (Map-backed `caches` stub).
- [ ] `npm run ci:check` green.
- [ ] Manual: preview + DevTools offline reload (Monaco, ELK, example,
      popout), install + double-click `.archimate`, shortcuts, update toast
      with dirty model, share sheet, dev server stays SW-free.
