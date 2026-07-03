# Extension API

Extensions are trusted browser/profile-local scripts that can extend app chrome
and workflows. They use the same model and jArchi wrappers as the **Scripting**
panel, plus an `app` API for commands, menus, toolbar buttons, dock panels,
events, storage, dialogs, views, and selection.

Extensions are not written to `.archimate` files and do not participate in undo
history unless extension code mutates the model through scripting/model APIs.

## Trust Model

Current extensions are trusted local code. They run in the browser context and
can access the APIs documented here. Do not import extension packages from
untrusted sources.

## Minimal Extension

```js
app.extension({
  id: "local.hello",
  name: "Hello Extension",
  version: "0.1.0"
});

app.commands.register("local.hello.say", {
  title: "Say hello",
  run: function () {
    return app.dialogs.info("Hello", "Hello from an extension.");
  }
});

app.menus.addItem("extensions.menu", {
  id: "local.hello.menu.say",
  label: "Say hello",
  command: "local.hello.say"
});
```

## Extension Metadata

Register metadata once when the extension loads:

```js
app.extension({
  id: "local.my-extension",
  name: "My extension",
  version: "0.1.0"
});
```

The `id` must match the browser-local extension record or package manifest.
Extension IDs should be globally unique within the browser profile. Use a
namespace such as `local.team-name.tool-name`.

Package-owned extensions can inspect package metadata:

```js
var info = app.extension.package();
if (info) {
  console.log(info.id, info.version, info.files);
}
```

For source-only extensions, `app.extension.package()` returns `null`.

## Manifest And Assets

Package-owned extensions can read their manifest and bundled files:

```js
var manifest = app.manifest.get();
var readme = app.assets.text("README.md");
var config = app.assets.json("data/config.json");
var iconUrl = app.assets.url("assets/icon.svg");
```

`app.assets.*` requires an imported package. Source-only extensions are not
package-owned and will throw if they call asset helpers.

## Commands

Register commands:

```js
app.commands.register("local.audit.run", {
  title: "Run audit",
  description: "Count model content and report warnings.",
  run: function (context, args) {
    console.log(context.extensionId);
    console.log(context.activeViewId);
    console.log(context.selectionIds);
    return args;
  }
});
```

Run commands:

```js
app.commands.run("local.audit.run", { mode: "full" });
```

Command context:

```ts
{
  extensionId: string;
  activeViewId: string | null;
  selectionIds: string[];
  trigger?: unknown;
}
```

Synchronous command mutations are batched into one undo step by the extension
registry. If a command awaits a dialog, network call, dynamic import, or other
promise, mutations after that await run as normal model operations. To keep an
async command to one undo step, collect data first and then perform model
mutations together in one synchronous block.

Commands reached from context-menu locations receive the right-click payload in
`context.trigger`, for example `{ x, y, viewId, targetId, selectionIds }`.

Command errors are recorded in the Extensions panel error list and do not reject
UI menu or toolbar invocations.

## Toolbar Buttons

Add toolbar buttons bound to commands:

```js
app.toolbar.addButton({
  id: "local.audit.toolbar",
  label: "Audit",
  command: "local.audit.run"
});
```

Toolbar IDs should be namespaced under the extension ID.

The toolbar **Extensions** dropdown shows items registered in
`extensions.menu`. As a fallback it also auto-lists registered commands that do
not already appear in any extension menu location.

## Menus

Add menu items:

```js
app.menus.addItem("extensions.menu", {
  id: "local.audit.menu.run",
  label: "Run model audit",
  command: "local.audit.run"
});
```

Supported menu locations:

- `extensions.menu`
- `model-tree.context`
- `view.context`
- `selection.context`

Set `danger: true` for destructive actions:

```js
app.menus.addItem("selection.context", {
  id: "local.cleanup.delete-empty",
  label: "Delete empty notes",
  command: "local.cleanup.delete-empty",
  danger: true
});
```

## Panels

Register a dockable panel:

```js
app.panels.register("local.audit.panel", {
  title: "Audit",
  render: function (container) {
    container.textContent = "Audit output";
    return function cleanup() {
      // optional cleanup when panel unmounts
    };
  }
});

app.panels.show("local.audit.panel");
```

Panel renderers use plain DOM. They should not assume React is available.

## Events

Register event handlers:

```js
app.events.on("selection.changed", function (payload) {
  console.log(payload);
});
```

Unregister a handler when it is no longer needed:

```js
function onSelection(payload) {
  console.log(payload);
}

app.events.on("selection.changed", onSelection);
app.events.off("selection.changed", onSelection);
```

Supported event names:

- `app.ready`
- `model.opened`
- `model.changed`
- `model.saved`
- `selection.changed`
- `view.opened`
- `view.activated`
- `view.contextMenu`
- `tree.contextMenu`
- `script.error`

Event handler errors are recorded on the extension registry and should not break
other extensions.

## Storage

Use private extension storage:

```js
app.storage.set("lastRun", new Date().toISOString());
var lastRun = app.storage.get("lastRun");
```

Storage is browser/profile-local and namespaced under the extension ID. It is
not model data.

## Dialogs

Use custom app dialogs:

```js
await app.dialogs.info("Audit complete", "No warnings found.");

var confirmed = await app.dialogs.confirm(
  "Delete generated notes?",
  "This cannot be undone outside the normal model undo stack."
);
```

## Views

Extensions can inspect and open views:

```js
var active = app.views.active();
var all = app.views.all();
var view = app.views.get("view-id");
var opened = app.views.open("view-id");
```

Return values are `JView` wrappers or `null` where no view exists. See
[[Scripting API|Scripting-API]] for `JView` methods such as `nodes()`,
`connections()`, and `layout()`.

## Selection

Inspect or clear current selection:

```js
var ids = app.selection.ids();
var items = app.selection.items();
var visuals = app.selection.visuals();

app.selection.clear();
```

`items()` resolves known IDs through jArchi wrappers and drops missing IDs.
`visuals()` returns only selected diagram visual objects.

## Model Snapshot Escape Hatch

The preferred extension contract is the wrapper API. For diagnostics or
read-only inspection, extensions can access the current model state:

```js
var current = app.model.current();
```

Treat this as an escape hatch. Do not mutate raw state objects.

## Runtime Errors

Registration errors are isolated to the failing extension. Command and event
errors are recorded in the extension registry. Other extensions continue to run.
If an extension throws while loading, contributions registered before the error
are removed so the extension is not left partially active.

Related pages:

- [[Scripting API|Scripting-API]]
- [[Extension Packages|Extension-Packages]]
