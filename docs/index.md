---
layout: home

hero:
  name: Archi Online
  text: ArchiMate modeling in your browser
  tagline: A web clone of the Archi desktop tool — full ArchiMate 3.2, lossless .archimate round-trip, and jArchi-compatible scripting. No backend, no account, nothing leaves your browser.
  image:
    src: /icons/icon.svg
    alt: Archi Online
  actions:
    - theme: brand
      text: Get started
      link: /wiki/Getting-Started
    - theme: alt
      text: Open the live app ↗
      link: https://bitter-mill-c9qn.here.now/
    - theme: alt
      text: View on GitHub ↗
      link: https://github.com/ThomasRohde/archi-online

features:
  - icon: 🧩
    title: Full ArchiMate 3.2 metamodel
    details: Every element and relationship type, with Archi's official allowed-relationship matrix enforced live while you draw.
  - icon: 🪟
    title: IDE-style workspace
    details: Views open as draggable tabs — split editors side-by-side, float or maximize groups, and the layout persists across sessions.
  - icon: ✏️
    title: Rich diagram editor
    details: Custom SVG canvas with drag/resize/nesting, grid snapping, marquee selection, a magic connector, manual bendpoints, notes and groups.
  - icon: 🔁
    title: Lossless .archimate round-trip
    details: Open and save native Archi files — verified against Archi's Archisurance example. Import/export Open Exchange XML and Archi CSV too.
  - icon: 📜
    title: jArchi-style scripting
    details: '$() selectors, model and view automation, a Monaco editor with API IntelliSense, and a script library. Each run is a single undo step.'
  - icon: 🔌
    title: Extensions & auto-layout
    details: Browser-local plugins add commands, panels and toolbar buttons — including a bundled ELK automatic-layout extension. Portable .archi-ext packages.
---

## See it in action

Archi Online runs entirely in your browser. Open the built-in **Archisurance**
example, build your own model, or automate it with JavaScript.

![The Archi Online workspace with the Archisurance model open](/screenshots/workspace.png)

The IDE-style shell docks the model tree, palette, properties, and scripting
panels around a custom SVG canvas. Everything is draggable, floatable, and
persists across sessions.

![Drawing a relationship with live validity feedback](/screenshots/palette-validity.png)

Relationship tools show live validity feedback from Archi's own
allowed-relationship matrix, and the *magic connector* offers only the
connections ArchiMate permits between two elements.

## Automate your model

Scripts use the same [jArchi](https://github.com/archimatetool/archi-scripting-plugin)-compatible
API as desktop Archi. A whole script run collapses into one undo step.

```js
var actor = model.createElement("business-actor", "Customer");
var svc = model.createElement("business-service", "Claims Service");
var rel = model.createRelationship("serving-relationship", "", svc, actor);

var view = model.createArchimateView("Overview");
var vs = view.add(svc, 40, 120, 140, 60);
var va = view.add(actor, 40, 20, 140, 60);
view.add(rel, vs, va);
view.openInUI();
```

![The scripting panel with the Monaco editor and console output](/screenshots/scripting.png)

## Where to go next

| If you want to… | Read |
| --- | --- |
| Run the app and build your first model | [Getting Started](/wiki/Getting-Started) |
| Learn the workspace, canvas, and settings | [User Guide](/wiki/User-Guide) |
| Model software architecture with C4 | [C4 Modeling](/wiki/C4-Modeling) |
| Import, export, or present models | [Import & Export](/wiki/Import-and-Export) |
| Exchange models with desktop Archi | [Archi Compatibility](/wiki/Archi-Compatibility) |
| Automate your model with JavaScript | [Scripting API](/wiki/Scripting-API) |
| Build an extension | [Extension API](/wiki/Extension-API) |

::: tip Your data stays local
Models are explicit `.archimate` files you open and save yourself. Autosave,
settings, the script library, extensions, and the window layout live in your
browser's IndexedDB for the current profile only. The app never uploads your
model anywhere.
:::
