# Archi Online extension reference

Use this reference for editable source extensions and portable `.archi-ext` packages. Also read `scripting.md` whenever the extension touches model content.

## Contents

- [Minimal runtime shape](#minimal-runtime-shape)
- [`app` API map](#app-api-map)
- [Undo and asynchronous work](#undo-and-asynchronous-work)
- [One undo step after confirmation](#one-undo-step-after-confirmation)
- [Panels and trust](#panels-and-trust)
- [Package contract](#package-contract)
- [Repository verification map](#repository-verification-map)

## Minimal runtime shape

```js
app.extension({
  id: 'local.team.tool',
  name: 'Team Tool',
  version: '0.1.0'
});

app.commands.register('local.team.tool.run', {
  title: 'Run team tool',
  run: function (context, args) {
    console.log(context.modelSessionId, context.activeViewId, args);
  }
});

app.menus.addItem('extensions.menu', {
  id: 'local.team.tool.menu.run',
  label: 'Run team tool',
  command: 'local.team.tool.run'
});
```

The `app.extension()` ID must match the source-extension record or package manifest. Namespace every contribution under that stable ID.

## `app` API map

- `extension(meta)`, `extension.package()`, `manifest.get()`
- `commands.register(id, options)`, async `commands.run(id, args)`
- `toolbar.addButton({ id, label, command })`
- `menus.addItem(location, { id, label, command, danger? })`
- `panels.register(id, { title, render })`, `panels.show(id)`
- `events.on(name, handler)`, `events.off(name, handler)`
- async `storage.get(key)`, async `storage.set(key, value)`
- async `dialogs.info(title, message)`, async `dialogs.confirm(title, message)`
- `views.active/get/open/all`, `selection.ids/items/visuals/clear`
- async `layout.elk(options)`
- package-only `assets.text/json/url(path)`
- read-only diagnostic escape hatch `model.current()`

Menu locations are `extensions.menu`, `model-tree.context`, `view.context`, and `selection.context`. Context-menu commands receive trigger information in `context.trigger`.

Events include `app.ready`, model open/change/save/activate/close, selection changes, view open/activate/context menu, tree context menu, and `script.error`. Return promises from async handlers so the runtime can isolate and record their errors.

## Undo and asynchronous work

Synchronous command mutations are batched into one undo step. Mutations after an `await` become separate model operations. For one logical undo step:

1. Await dialogs, configuration, assets, or other required inputs first.
2. Validate the current session/view/selection again after awaiting.
3. Perform all model mutations in one synchronous block.
4. Await storage or notification work after mutations only when separate undo steps are acceptable.

`app.storage` is async, private to the extension ID, browser/profile-local, and deleted when the extension is uninstalled. Never put it in `.archimate` data.

### One undo step after confirmation

The command registry ends its automatic batch when a command first returns a promise. If confirmation must precede several mutations, dispatch back through the same command with a closure-private token. The nested synchronous invocation receives a fresh batch:

```js
var COMMAND_ID = 'local.team.tool.apply';
var APPLY_TOKEN = {};

function selectedConceptIds() {
  return app.selection.items().filter(function (item) {
    return $(item).is('concept');
  }).map(function (item) { return item.id; }).sort();
}

function applySynchronously(context, args) {
  if (context.modelSessionId !== args.sessionId) {
    throw new Error('Model session changed.');
  }
  if (JSON.stringify(selectedConceptIds()) !== JSON.stringify(args.ids)) {
    throw new Error('Selection changed.');
  }
  // Re-resolve and revalidate ids in the current model before changing them.
  var targets = args.ids.map(function (id) { return $('#' + id).first(); });
  targets.forEach(function (target) {
    if (!target) throw new Error('A selected concept is no longer available.');
  });
  var targetsCollection = $(targets[0]);
  for (var index = 1; index < targets.length; index += 1) {
    targetsCollection = targetsCollection.add(targets[index]);
  }
  targetsCollection.prop('review-status', 'reviewed');
  return { changed: targets.length };
}

app.commands.register(COMMAND_ID, {
  title: 'Apply review status',
  run: function (context, args) {
    if (args && args.token === APPLY_TOKEN) return applySynchronously(context, args);
    return confirmThenApply(context);
  }
});

async function confirmThenApply(context) {
  var sessionId = context.modelSessionId;
  var ids = selectedConceptIds();
  if (!ids.length) return;
  if (!await app.dialogs.confirm('Continue?', 'Update ' + ids.length + ' concepts?')) return;
  return app.commands.run(COMMAND_ID, {
    token: APPLY_TOKEN,
    sessionId: sessionId,
    ids: ids
  });
}
```

Keep the token unreachable outside the extension closure. Snapshot stable IDs rather than wrappers across `await`, then re-resolve and revalidate them in the synchronous branch. Avoid catching mutation errors inside that branch unless partial changes and their undo behavior are deliberately handled.

## Panels and trust

```js
app.panels.register('local.team.tool.panel', {
  title: 'Team Tool',
  render: function (container) {
    var heading = document.createElement('strong');
    heading.textContent = 'Selected: ' + String(app.selection.ids().length);
    container.replaceChildren(heading);
  }
});
```

Extensions are trusted code, but model/user/package strings are untrusted. Use DOM creation and `textContent`. Do not interpolate them into `innerHTML`, CSS, URLs, or code. Return an optional cleanup function from `render` when listeners or timers are installed.

## Package contract

An `.archi-ext` file is a ZIP such as:

```text
manifest.json
main.js
data/config.json
assets/icon.svg
```

Required manifest fields:

```json
{
  "schemaVersion": 2,
  "id": "local.team.tool",
  "name": "Team Tool",
  "version": "0.1.0",
  "main": "main.js"
}
```

Optional `contributes` arrays document commands, menus, toolbar items, panels, and events. Runtime code still must register them. Keep descriptive metadata consistent with `main.js`.

Package rules:

- Use normalized relative `/` paths without leading `/`, backslashes, empty segments, `.` or `..`.
- Include `manifest.json` and the manifest's UTF-8 main file.
- Stay at or below 200 files and 5,000,000 stored content characters.
- Read packaged text/JSON/assets through `app.assets`; source-only extensions cannot use these helpers.
- Treat imported packages as trusted executable code and disclose that trust boundary.

## Repository verification map

- Runtime/API: `src/extensions/runtime.ts`, `app-api.ts`, `registry.ts`, and `types.ts`
- Package schema/archive: `package-types.ts`, `package-validation.ts`, and `package-archive.ts`
- Public declarations: `src/scripting/jarchi-dts.ts`
- Examples: `extensions/`
- Tests: `tests/extensions*.test.ts`, `tests/extension-packages.test.ts`, and `tests/extension-examples.test.ts`

Test load/reload error isolation, no-model and no-active-view states, multi-model session context, read-only rejection, empty selections, async storage, panel cleanup/safe text rendering, declared/runtime contribution parity, archive import, and one-step undo for synchronous model mutations.
