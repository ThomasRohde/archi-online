# Extension API

Extensions are browser-local plugins that extend the app's chrome and
workflows. An extension is a JavaScript file that runs when the app starts
(or when you reload extensions) and registers its contributions — commands,
menu items, toolbar buttons, dockable panels, and event handlers — through
the `app` API documented here.

Extensions receive the same scripting globals as the **Scripting** panel
(`$`, `model`, `console`, `window` dialogs, `exit`) plus `app`. See
[[Scripting API|Scripting-API]] for the model-side API and
[[Extension Packages|Extension-Packages]] for shipping an extension as a
portable `.archi-ext` file.

## Trust model

Extensions are trusted local code. They run in the page with full access to
the current model and the browser profile — there is no sandbox. Do not
install extensions or import packages from sources you don't trust.

Model names, file names, ids, properties, and event payloads are still
external data. When building panel DOM, prefer `textContent` and DOM nodes
over `innerHTML` for anything derived from a model or user input.

## Minimal extension

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

Create it in the **Extensions** panel (**Add extension**), paste the source,
save, and reload. The command appears in the toolbar's **Extensions ▾** menu.

## Extension metadata

Declare metadata once when the extension loads:

```js
app.extension({
  id: "local.my-extension",
  name: "My extension",
  version: "0.1.0"
});
```

The `id` must match the extension record (or the package manifest for
package-owned extensions) and should be namespaced,
e.g. `local.team-name.tool-name`. All contribution ids (commands, menu items,
toolbar buttons, panels) should be namespaced under the extension id.

Package-owned extensions can inspect their package:

```js
var info = app.extension.package();
if (info) {
  console.log(info.id, info.version, info.files);
}
```

For source-only extensions, `app.extension.package()` returns `null`.

## Manifest and assets

Package-owned extensions can read their manifest and bundled files:

```js
var manifest = app.manifest.get();
var readme = app.assets.text("README.md");
var config = app.assets.json("data/config.json");
var iconUrl = app.assets.url("assets/icon.svg");  // data: URL
```

`app.assets.*` requires an imported package; source-only extensions throw if
they call asset helpers. (`app.manifest.get()` works for both — source
extensions get a synthesized minimal manifest.)

## Commands

```js
app.commands.register("local.audit.run", {
  title: "Run audit",
  description: "Count model content and report warnings.",
  run: function (context, args) {
    console.log(context.extensionId);
    console.log(context.activeViewId);   // string | null
    console.log(context.selectionIds);   // string[]
    console.log(context.trigger);        // set for context-menu invocations
    return args;
  }
});

await app.commands.run("local.audit.run", { mode: "full" });
```

`app.commands.run` returns a promise resolving to the command's return value.

**Undo batching.** Synchronous command mutations are batched into one undo
step by the extension registry. If a command awaits a dialog, dynamic import,
or other promise, mutations after that `await` run as separate model
operations. To keep an async command to one undo step, gather data first,
then perform all model mutations in one synchronous block.

Commands reached from context-menu locations receive the right-click payload
in `context.trigger`, for example `{ x, y, viewId, targetId, selectionIds }`.

Command errors are recorded in the Extensions panel's error list and do not
reject menu or toolbar invocations.

## Toolbar buttons

```js
app.toolbar.addButton({
  id: "local.audit.toolbar",
  label: "Audit",
  command: "local.audit.run"
});
```

The toolbar **Extensions ▾** dropdown shows items registered in
`extensions.menu`; as a fallback it also auto-lists registered commands that
do not already appear in any extension menu location.

## Menus

```js
app.menus.addItem("extensions.menu", {
  id: "local.audit.menu.run",
  label: "Run model audit",
  command: "local.audit.run"
});
```

Menu locations:

| Location | Where it appears |
| --- | --- |
| `extensions.menu` | The toolbar **Extensions ▾** dropdown. |
| `model-tree.context` | Right-click in the Models tree. |
| `view.context` | Right-click on the view canvas. |
| `selection.context` | Right-click on a selection. |

Set `danger: true` to style a destructive action:

```js
app.menus.addItem("selection.context", {
  id: "local.cleanup.delete-empty",
  label: "Delete empty notes",
  command: "local.cleanup.delete-empty",
  danger: true
});
```

If `id` is omitted, one is derived from the extension id and command.

## Panels

Register a dockable panel — it shows up in the **Views ▾** menu alongside the
built-in panels:

```js
app.panels.register("local.audit.panel", {
  title: "Audit",
  render: function (container) {
    container.textContent = "Audit output";
    return function cleanup() {
      // optional: runs when the panel unmounts
    };
  }
});

app.panels.show("local.audit.panel");
```

Panel renderers use plain DOM — do not assume React is available. Treat
model-derived strings as untrusted data when constructing panel contents.

## Events

```js
function onSelection(payload) {
  console.log(payload);
}

app.events.on("selection.changed", onSelection);
app.events.off("selection.changed", onSelection);
```

Event names:

| Event | Fires when |
| --- | --- |
| `app.ready` | The app finished starting up. |
| `model.opened` | A model was created, opened, or restored. |
| `model.changed` | The model state changed. |
| `model.saved` | The model was saved to a file or download. |
| `selection.changed` | The tree/view selection changed. |
| `view.opened` | A view tab was opened. |
| `view.activated` | A view tab became active. |
| `view.contextMenu` | The canvas context menu opened. |
| `tree.contextMenu` | The model-tree context menu opened. |
| `script.error` | A Scripting-panel run threw; payload is `{ message: string }`. |

Event handler errors are recorded per extension and do not break other
extensions.

## Storage

Private, per-extension key-value storage. Both operations are **async**:

```js
await app.storage.set("lastRun", new Date().toISOString());
var lastRun = await app.storage.get("lastRun");
```

Storage is browser/profile-local, namespaced under the extension id, and is
not model data. Deleting or uninstalling an extension removes its private
storage.

## Dialogs

```js
await app.dialogs.info("Audit complete", "No warnings found.");

var confirmed = await app.dialogs.confirm(
  "Delete generated notes?",
  "This removes the notes from the current view."
);
```

## Views

```js
var active = app.views.active();   // JView | null
var all = app.views.all();         // JView[]
var view = app.views.get("view-id");   // JView | null
var opened = app.views.open("view-id"); // opens the tab, returns JView | null
```

Returned values are `JView` wrappers — see [[Scripting API|Scripting-API]]
for `nodes()`, `connections()`, `layout()`, and the rest.

## Selection

```js
var ids = app.selection.ids();       // string[]
var items = app.selection.items();   // wrappers; missing ids are dropped
var visuals = app.selection.visuals(); // only diagram visual objects

app.selection.clear();
```

## Automatic layout (ELK)

`app.layout.elk()` runs the app-hosted [ELK](https://eclipse.dev/elk/)
layered layout engine against a view and applies the result as a single undo
step:

```js
var result = await app.layout.elk({
  scope: "selection-or-view",
  direction: "right",
  edgeRouting: "orthogonal",
  nodeSpacing: 40,
  layerSpacing: 80
});
console.log(result.nodeCount, "nodes in", result.elapsedMs, "ms");
```

Options (all optional):

| Option | Values | Default |
| --- | --- | --- |
| `view` | a `JView` | the active view (throws if none) |
| `scope` | `"selection-or-view"`, `"selection"`, `"view"` | `"selection-or-view"` — uses the selection when 2+ top-level objects are selected, otherwise the whole view |
| `direction` | `"right"`, `"down"`, `"left"`, `"up"` | `"right"` |
| `edgeRouting` | `"orthogonal"`, `"splines"`, `"preserve"` (keep existing routes) | `"orthogonal"` |
| `nodeSpacing` | number, clamped to 10–300 | `40` |
| `layerSpacing` | number, clamped to 20–500 | `80` |

The result reports `scope`, `nodeCount`, `connectionCount`,
`routedConnectionCount`, and `elapsedMs`.

`app.layout.elk()` is async because the ELK engine is lazy-loaded; the async
command undo caveat from [Commands](#commands) applies. Recursive layout of
nested containers is not supported yet (`recursive: true` throws). The
bundled **ELK Layout** example package wraps this API with menu commands and
a settings panel.

## Model snapshot escape hatch

The supported contract is the wrapper API. For diagnostics or read-only
inspection, extensions can access the raw model state:

```js
var current = app.model.current();
```

Treat this as an escape hatch: never mutate raw state objects — all
mutations must go through the wrapper API so undo/redo and dirty tracking
stay correct.

## Errors and lifecycle

- Extensions load at app startup and on **Reload** in the Extensions panel.
- If an extension throws while loading, contributions registered before the
  error are removed so the extension is not left partially active.
- Registration, command, and event errors are isolated to the failing
  extension and recorded in the Extensions panel; other extensions continue
  to run.

Related pages:

- [[Extension Packages|Extension-Packages]] — package format, import/export,
  and the bundled examples.
- [[Scripting API|Scripting-API]] — the model automation API.
