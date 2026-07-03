# Archi Online Wiki

Archi Online is a browser-only ArchiMate modeler built with Vite, React, and
TypeScript. It edits native `.archimate` models, keeps autosave data in the
current browser profile, and adds JavaScript scripting plus browser-local
extensions on top of the core modeling workflow.

This wiki source is stored in the main repository under `docs/wiki/`. When the
project is published to GitHub, these files can be copied into the repository's
GitHub Wiki with `npm run docs:publish-wiki`.

## Start Here

- [[Getting Started|Getting-Started]] - run the app, create/open/save models,
  and understand browser storage.
- [[User Guide|User-Guide]] - app shell, panels, canvas editing, settings,
  files, shortcuts, and extensions.
- [[Scripting API|Scripting-API]] - jArchi-style selectors, model wrappers,
  view automation, and examples.
- [[Extension API|Extension-API]] - trusted browser-local extension API for
  commands, menus, toolbar buttons, panels, events, dialogs, storage, views,
  and selection.
- [[Extension Packages|Extension-Packages]] - `.archi-ext` package format,
  import/export, bundled assets, and examples.
- [[Development|Development]] - repo layout, commands, tests, and release
  checks.
- [[Publishing GitHub Wiki|Publishing-GitHub-Wiki]] - how to publish this
  directory into GitHub Wiki pages later.

## What Runs Where

Archi Online has no application backend. The app is a static site, and all model
editing, XML parsing, scripting, extension loading, autosave, and settings live
in the browser.

- Model files are explicit `.archimate` files chosen by the user.
- Autosave uses IndexedDB for the current browser profile.
- Settings, script snippets, extensions, extension packages, and layout state
  are browser/profile-local preferences.
- Browser-local preferences are not exported into `.archimate` files.
- Script and extension model edits still use the normal model operation and
  transaction system, so undo/redo and dirty-state behavior match canvas edits.

## Current Scope

The app is intended for local, trusted use in the current browser/profile. The
extension system is not a remote marketplace, account sync service, or untrusted
sandbox. Installed extensions are user-controlled local scripts or imported
local packages.

