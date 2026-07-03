# Script Extension System Design

## Summary

Archi Online should support trusted, browser/profile-local extensions built on top of the existing jArchi-style scripting runtime. The first implementation should use a simple extension registry around local scripts, while shaping the records and APIs so a later manifest-based plugin package system can reuse the same runtime.

Extensions are user preferences for this browser profile. They are not model data, are not written to `.archimate` files, and do not participate in model undo history except when an extension deliberately mutates the model through existing model APIs.

## Goals

- Let trusted local scripts extend app chrome and workflow surfaces that classic Eclipse-based jArchi scripts could not hook into.
- Support extension-provided commands, toolbar buttons, menu items, dock panels, event handlers, and private extension storage.
- Keep the current Scripts panel and jArchi model scripting behavior intact.
- Keep extension state browser-local and separate from the model store.
- Prepare the data model and runtime seams for later package/manifest-based plugins.

## Non-Goals

- No extension sharing through `.archimate` files.
- No remote plugin marketplace in the first implementation.
- No untrusted sandbox or permission system in v1; local extensions are trusted.
- No arbitrary React component loading in v1 panels.
- No model schema migration.

## Chosen Approach

Use a trusted local extension registry around scripts. Extensions are browser-local records with manifest-shaped metadata and a source string. Enabled extensions are loaded once during startup and register contributions through a stable `app` API.

This is simpler than a full plugin bundle system but uses the same concepts:

- Extension metadata: `id`, `name`, `version`
- Runtime entrypoint: a script source string
- Contributions: commands, menus, toolbar buttons, panels, events
- Extension-local storage

Later plugin bundles can provide a manifest and one or more source files while still registering into the same runtime registry.

## Architecture

Add a new `src/extensions/` area:

- `extension-store.ts`
  Stores local extension records in IndexedDB or localStorage. This store is app-global for the browser profile and is never serialized into model XML.

- `registry.ts`
  Holds live runtime contributions for the current session: commands, toolbar items, menu items, panels, and event handlers. Reloading an extension removes its previous contributions and registers new ones.

- `runtime.ts`
  Loads enabled extensions after app startup/autosave restore, creates the trusted `app` API, runs each extension once, and isolates registration errors to the failing extension.

- `app-api.ts`
  Defines the script-facing `app` object. Existing `model`, `$`, and `console` globals remain available.

- `events.ts`
  Defines stable event names and payload shapes emitted by app-owned seams.

The extension runtime should not import UI components directly where that creates cycles. UI surfaces should read from the registry or subscribe to registry updates.

## Local Extension Record

V1 records should already resemble a future manifest-backed plugin:

```ts
interface LocalExtensionRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}
```

Extension IDs must be globally unique within the browser profile. Commands, panels, menus, toolbar item IDs, and storage keys should be namespaced under the extension ID.

## Script API

The first public extension API should be:

```ts
app.extension(meta)
app.commands.register(id, options)
app.commands.run(id, args?)
app.toolbar.addButton(options)
app.menus.addItem(location, options)
app.panels.register(id, options)
app.panels.show(id)
app.events.on(name, handler)
app.storage.get(key)
app.storage.set(key, value)
app.dialogs.info(title, message)
app.dialogs.confirm(title, message)
app.model.current()
```

Example:

```js
app.extension({
  id: "local.audit-tools",
  name: "Audit tools",
  version: "0.1.0"
});

app.commands.register("local.audit-tools.countElements", {
  title: "Count elements",
  run() {
    app.dialogs.info("Elements", $("element").size() + " elements");
  }
});

app.toolbar.addButton({
  id: "local.audit-tools.countButton",
  label: "Count",
  command: "local.audit-tools.countElements"
});
```

The `run` callback receives a context object for the active model, selection, active view, and triggering event where relevant. Commands can mutate the model through existing jArchi APIs. Those mutations must still flow through current `transact()` / `runBatch()` behavior.

## UI Contributions

### Commands

Commands are the stable primitive. Menus, toolbar buttons, panels, and event handlers call commands instead of duplicating behavior.

Each command has:

- `id`
- `title`
- optional `description`
- `run(context, args?)`

Duplicate command IDs are rejected unless they belong to a reloading extension and the previous registration has been cleared.

### Toolbar

Add an extension toolbar zone near the right side of the existing toolbar. V1 supports simple text buttons bound to commands:

```js
app.toolbar.addButton({
  id: "local.audit-tools.countButton",
  label: "Count",
  command: "local.audit-tools.countElements"
});
```

This keeps v1 implementation simple. Later plugin packages can add icon metadata and placement.

### Menus

Add a dedicated toolbar `Extensions` menu. Registered commands can appear there by default, and extension scripts can add menu items to named locations:

- `extensions.menu`
- `model-tree.context`
- `view.context`
- `selection.context`

V1 menu items support `label`, `command`, optional `id`, and optional `danger`. A later version can add `when(context)` predicates.

### Panels

Dockable extension panels should be supported, but v1 panels should render plain DOM rather than arbitrary React:

```js
app.panels.register("local.audit-tools.panel", {
  title: "Audit",
  render(container) {
    container.innerHTML = "<button id='count'>Count</button>";
    container.querySelector("#count").onclick = () =>
      app.commands.run("local.audit-tools.countElements");
  }
});
```

The dock layout hosts extension panels by ID. `app.panels.show(id)` opens or focuses the panel.

## Events And Lifecycle

The app should emit stable app-owned events, not expose raw DOM hooks.

Initial events:

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

Startup lifecycle:

1. App starts.
2. Autosave/model restore completes.
3. Extension runtime loads enabled local extensions.
4. Each extension runs once and registers contributions.
5. App emits `app.ready`.
6. UI and model events call registered handlers and commands as the user works.

Event handling rules:

- A failing extension handler logs an error and does not break the app shell.
- `model.changed` events are debounced.
- If an event handler causes another model change, follow-up handlers run in a later tick.
- Model mutations inside handlers still use the existing transaction path so undo remains coherent.

## Extension Management UI

Add a dockable `Extensions` panel. It is browser-local, like Settings and Scripts.

The panel supports:

- List installed local extensions
- Enable or disable an extension
- Edit extension source
- Run or reload an extension
- View registration/runtime errors for this session
- Reset or delete an extension
- Create a new extension from a template

Source and enabled state are persisted. Runtime registrations and errors are session state.

Default template:

```js
app.extension({
  id: "local.my-extension",
  name: "My extension",
  version: "0.1.0"
});

app.commands.register("local.my-extension.hello", {
  title: "Hello",
  run() {
    app.dialogs.info("Hello", "Extension is working.");
  }
});

app.toolbar.addButton({
  id: "local.my-extension.helloButton",
  label: "Hello",
  command: "local.my-extension.hello"
});
```

## Error Handling

- Registration errors disable only that extension for the current session.
- Command and event errors are logged to the extension runtime status and script console if visible.
- Duplicate IDs are treated as registration errors.
- Missing command references make the contribution inactive and visible as an error in the Extensions panel.
- Broken extension panels show an error placeholder rather than crashing the dock.

## Testing Strategy

Unit tests:

- Extension registry registers and clears commands, toolbar items, menu items, panels, and event handlers.
- Duplicate IDs are rejected.
- `app.commands.run()` invokes registered command handlers.
- A command can mutate the model through jArchi APIs and create undo history.
- Broken extension registration does not affect other extensions.
- Disabling or reloading an extension removes previous live contributions.
- Extension records are not included in XML serialization.

Focused integration tests:

- Enabled local extension loads after startup.
- `selection.changed` and `model.changed` events fire once per expected change.
- Debounced `model.changed` handlers do not loop synchronously.

Browser smoke tests:

- An extension command appears in the `Extensions` menu.
- A toolbar button runs a command.
- A docked extension panel opens and can call a command.
- A broken extension reports an error without breaking the app.

## Rollout Plan

Implement in vertical slices:

1. Runtime core: store, registry, app API, extension loading, command execution.
2. UI contributions: `Extensions` menu, toolbar zone, docked panels.
3. Events: app/model/selection/view event emitters and handler isolation.
4. Management UI: Extensions panel with enable, edit, reload, delete, and template creation.

Existing Scripts remain unchanged. Extensions are introduced as a separate power-user surface.

## Future Option 3 Compatibility

The v1 runtime should be compatible with a later package format:

```ts
interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  contributes?: {
    commands?: CommandContribution[];
    menus?: MenuContribution[];
    panels?: PanelContribution[];
  };
}
```

The future package importer would translate a manifest and files into the same runtime registration process. Static manifest contributions can improve validation and discoverability, while executable scripts still provide command and panel implementations.

The key compatibility rule is that UI surfaces depend on the runtime registry, not on how an extension was stored or packaged.
