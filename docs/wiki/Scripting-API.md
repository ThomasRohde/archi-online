# Scripting API

Archi Online exposes a [jArchi](https://github.com/archimatetool/archi-scripting-plugin)-style
JavaScript API in the **Scripting** panel. Scripts run in the browser against
the currently open model, and one script run is batched into **one undo
step** — a misbehaving script is a single `Ctrl+Z` away from being undone.

The API follows common jArchi patterns:

- a global `$()` selector returning collections,
- a global `model` wrapper with `createElement`, `createRelationship`, and
  `createArchimateView`,
- wrapper objects for concepts, views, visual objects, connections, and
  folders,
- key-value properties through `prop()` / `removeProp()`,
- relationship traversal helpers (`rels`, `inRels`, `outRels`,
  `sourceEnds`, …).

## The Scripting panel

- The script library lives in the panel's list: create, rename, and delete
  scripts, and import/export them as `.ajs` files (the jArchi script
  extension).
- Two built-in examples ship with the app: a small starter script and a
  jArchi capability test.
- The Monaco editor provides IntelliSense for the whole API — the same type
  declarations documented on this page.
- Run with the **Run** button or `Ctrl+Enter`. Output appears in the panel's
  console.

![The Scripting panel: Monaco editor with a jArchi-style script and console output](https://raw.githubusercontent.com/ThomasRohde/archi-online/main/docs/public/screenshots/scripting.png)

## Script environment

Scripts receive these globals:

| Global | Description |
| --- | --- |
| `$` | Selector function; also exposes `$.model`. |
| `model` | The open model (a `JModel` wrapper). |
| `console` | `log`, `info`, `warn`, `error` write to the panel console; `clear()` empties it. |
| `window` | `alert`, `confirm`, and `prompt` only. |
| `exit()` | Stop the script immediately (not an error). |

Scripts are **not sandboxed** — they run as trusted local code in the page.
The globals above are the supported API surface; anything else you reach is
an implementation detail that may change.

## Type names

Wherever a type is expected, ArchiMate type names are accepted in jArchi
kebab-case (`business-actor`, `application-component`,
`serving-relationship`), in CamelCase (`BusinessActor`), and — for
relationships — without the `-relationship` suffix (`composition` means
`composition-relationship`).

## Selectors

`$()` accepts a selector string (or an existing wrapper/collection) and
returns a `JCollection`:

| Selector | Matches |
| --- | --- |
| `"*"` | Everything: folders, elements, relationships, views. |
| `"concept"` | Elements and relationships. |
| `"element"`, `"relationship"`, `"view"`, `"folder"` | That kind of object. |
| `"business-actor"` | A specific type. |
| `".Customer"` | Objects whose name is exactly `Customer`. |
| `"#abc123"` | The object with that id. |
| `"business-actor.Customer"` | Type and exact name combined. |

Name matching is exact, not substring — use `filter()` with a function for
fuzzy matching.

## Collections

`JCollection` methods:

```js
var actors = $("business-actor");

// Inspection
actors.size();      // count (also actors.length)
actors.isEmpty();
actors.first();     // wrapper or undefined
actors.last();
actors.get(0);
actors.toArray();

// Iteration and transformation
actors.each(function (obj, index) { console.log(index, obj.name); });
actors.map(function (obj) { return obj.name; });   // plain array

// Filtering
actors.filter(".Customer");                        // selector…
actors.filter(function (o) { return o.name.indexOf("Cust") >= 0; }); // …or predicate
actors.not(".Draft");
actors.is("business-actor");                       // boolean
actors.add($("business-role"));                    // union with another collection

// Bulk operations
actors.prop("status", "reviewed");                 // set on every member
actors.removeProp("legacy");
actors.attr("fillColor", "#ffe0e0");               // get/set any wrapper field
actors.delete();
```

Traversal helpers (each accepts an optional selector to filter the result):

```js
$("folder").children();          // direct children
$("folder").find();              // all descendants
$("business-actor").parent();
$("business-actor").parents();

$(".Application").rels();        // all relationships touching the element
$(".Application").inRels();     // incoming only
$(".Application").outRels();    // outgoing only
$("serving-relationship").ends();        // both endpoints
$("serving-relationship").sourceEnds();  // source concepts
$("serving-relationship").targetEnds();  // target concepts

$(".Customer").objectRefs();     // visual objects referencing the concept
$(".Customer").viewRefs();       // views containing the concept
```

## The model

```js
model.name;
model.purpose;

model.prop();                    // property keys
model.prop("key");               // get
model.prop("key", "value");      // set (add duplicate key with third arg: true)
model.removeProp("key");         // remove (or a specific value: removeProp(key, value))

model.createElement(type, name, folder);
model.createRelationship(type, name, source, target, folder);
model.createArchimateView(name, folder);

model.specializations;           // ordered JProfile[]
model.createSpecialization("Retail Customer", "business-actor");
model.findSpecialization("Retail Customer", "business-actor");
```

`folder` arguments are optional; new objects land in the default folder for
their kind. `createRelationship` enforces the ArchiMate allowed-relationship
matrix and **throws** if the combination is invalid:

```js
var actor = model.createElement("business-actor", "Customer");
var service = model.createElement("business-service", "Claims Service");
var rel = model.createRelationship("serving-relationship", "", service, actor);

var view = model.createArchimateView("Service Overview");
var serviceNode = view.add(service, 40, 120, 160, 60);
var actorNode = view.add(actor, 40, 20, 160, 60);
view.add(rel, serviceNode, actorNode);
view.openInUI();
```

## Common object members

Every wrapper (`JConcept`, `JView`, `JVisual`, `JConnection`, `JFolder`) has:

```js
obj.id;             // read-only
obj.type;           // read-only, e.g. "business-actor"
obj.name;
obj.documentation;
obj.prop();
obj.prop("key");
obj.prop("key", "value");
obj.removeProp("key");
obj.delete();
```

Not every wrapper supports every setter — for example, connections derive
their name from the underlying relationship and refuse renames.

## Concepts

`JConcept` wraps elements and relationships. Relationship-only members:

```js
concept.specialization;          // primary specialization name or undefined
concept.specialization = "Retail Customer";

var replacement = concept.setType("business-role"); // new ID and wrapper
```

`setType()` replaces the concept and returns a wrapper for the replacement.
Names, documentation, properties, occurrences, and semantic references are
preserved; incompatible specialization and type-specific fields are cleared.
Keep the returned wrapper because the original wrapper points to the removed
concept.

Profiles expose `name`, `type`, `image`, and `delete()`. Profile names are
unique case-insensitively within a base concept type; deleting a used profile
removes its assignments in the same undo transaction.

Relationship-only members:

```js
relationship.source;              // JConcept
relationship.target;              // JConcept
relationship.accessType;          // "access" | "read" | "write" | "readwrite"
relationship.influenceStrength;   // e.g. "++"
relationship.associationDirected; // boolean
relationship.invert();             // stable relationship ID; throws if illegal
```

`invert()` is supported for relationships only. It swaps the semantic ends and
all visual occurrences, including bendpoint direction and source/target label
positions.

## Views

`JView` wraps an ArchiMate diagram:

```js
view.name;
view.documentation;
view.viewpoint;
view.openInUI();                  // open/focus the view tab

view.add(element, x, y, width, height);        // returns JVisual
view.add(relationship, sourceVisual, targetVisual); // returns JConnection
view.createObject("note", x, y, width, height);
view.createObject("group", x, y, width, height);
view.createLegend(x, y, options); // native live legend, returns JVisual
view.createPlainConnection(source, target, connectionType); // returns JConnection

view.nodes();                     // top-level visual objects
view.nodes({ recursive: true }); // including nested children
view.connections();
view.bounds();                    // union of node bounds, or null when empty
view.bounds({ recursive: false });
```

`createPlainConnection()` adds a native, non-semantic diagram connection. A
Note must be one endpoint; the other can be any connectable object or
connection in the same view. `connectionType` is optional and uses Archi's
native bitmask (`1` target filled, `2` dashed, `4` dotted, `8` source filled,
`16` target hollow, `32` source hollow, `64` target open, `128` source open):

```js
var note = view.createObject("note", 40, 40, 180, 80);
var actor = model.createElement("business-actor", "Customer");
var actorVisual = view.add(actor, 300, 40, 140, 60);
var annotation = view.createPlainConnection(note, actorVisual, 64);
annotation.name = "Context";
```

`createLegend()` uses Desktop defaults for omitted options. A legend visual
has type `diagram-model-legend`, exposes a writable `legendOptions` object,
and can resize itself to its live contents:

```js
var legend = view.createLegend(40, 40, {
  rowsPerColumn: 10,
  colorScheme: 1, // 0 None, 1 Core, 2 User
  sortMethod: 1   // 0 Name, 1 Category
});
legend.legendOptions = Object.assign({}, legend.legendOptions, {
  displayRelations: false,
  widthOffset: 8
});
legend.setLegendOptimalSize();
```

## Visual objects

`JVisual` wraps a diagram node — an element visual, note, group, or view
reference:

```js
visual.concept;          // underlying JConcept (undefined for notes/groups)
visual.view;             // owning JView
visual.bounds;           // parent-relative {x, y, width, height}
visual.text;             // note text
visual.legendOptions;    // native LegendOptions, or undefined
visual.setLegendOptimalSize(); // legends only
visual.fillColor;        // "#rrggbb" or undefined for the type default
visual.lineColor;
visual.fontColor;
visual.opacity;          // 0–255
visual.labelExpression;
visual.gradient;         // -1 none/default, 0 top, 1 left, 2 right, 3 bottom
visual.lineStyle;        // -1 default, 0 solid, 1 dashed, 2 dotted, 3 hidden
visual.lineWidth;        // 1 normal, 2 medium, 3 heavy
visual.imageSource;      // 0 specialization, 1 custom
visual.imagePosition;    // 0 through 9, matching Desktop Archi

visual.add(element, x, y, width, height);  // nest a child (relative coordinates)
visual.parent();          // JVisual or JView
visual.children();
visual.absoluteBounds();  // view-space coordinates
visual.connections();
visual.connections({ incoming: false });  // outgoing only
visual.connections({ outgoing: false });  // incoming only
```

`visual.bounds` is relative to the parent container; `absoluteBounds()`
returns view coordinates, which is usually what layout code wants.

## Connections

`JConnection` wraps a diagram connection:

```js
connection.view;
connection.source;        // JVisual
connection.target;        // JVisual
connection.concept;       // underlying relationship
connection.lineColor;
connection.fontColor;
connection.font;          // raw Archi font string
connection.textPosition;  // 0 source, 1 middle, 2 target
connection.connectionType; // native plain-connection bitmask
connection.nameVisible;   // plain-connection label visibility
connection.labelExpression;
connection.lineStyle;
connection.lineWidth;
connection.bendpoints;    // raw Archi/GEF format
connection.absoluteRoute();
connection.setAbsoluteRoute(points);
```

`bendpoints` uses Archi's relative offset representation
(`{ startX, startY, endX, endY }`). For layout code, prefer the absolute
helpers:

```js
connection.setAbsoluteRoute([
  { x: 180, y: 130 },
  { x: 220, y: 160 }
]);
console.log(connection.absoluteRoute());
```

`absoluteRoute()` returns only the intermediate points — the source and
target anchors are not included.

`connectionType` and `nameVisible` are writable only for plain connections.
The remaining appearance fields above apply to semantic and plain
connections.

## Bulk layout

`view.layout()` applies many node and route changes in a single operation:

```js
var view = $("view").first();
var nodes = view.nodes({ recursive: true });

var updates = {};
nodes.forEach(function (node, index) {
  updates[node.id] = { x: 80 + index * 180, y: 120, width: 140, height: 60 };
});

view.layout({ nodes: updates });
```

Connection routes can be updated in the same call. A connection update takes
either `route` (absolute intermediate points; `[]` clears manual routing) or
raw `bendpoints`, not both:

```js
var conn = view.connections()[0];
view.layout({
  connections: {
    [conn.id]: { route: [{ x: 260, y: 150 }] }
  }
});
```

Rules:

- node and connection ids must belong to the target view,
- coordinates and dimensions must be finite numbers,
- omitted `width`/`height` keep their current values,
- minimum node dimensions follow the app settings,
- layout coordinates are absolute view coordinates; stored nested bounds
  remain parent-relative.

For automatic layout, the bundled **ELK Layout** example extension wraps the
app-hosted ELK engine — see [[Extension API|Extension-API]] (`app.layout.elk`)
and [[Extension Packages|Extension-Packages]].

## Example: model audit

```js
var unnamed = $("element").filter(function (item) {
  return !item.name || !item.name.trim();
});

console.log("Elements:", $("element").size());
console.log("Relationships:", $("relationship").size());
console.log("Views:", $("view").size());
console.log("Unnamed elements:", unnamed.size());
```

## Example: nested group

```js
var capability = model.createElement("capability", "Online Service");
var app = model.createElement("application-component", "Claims Portal");
var view = model.createArchimateView("Nested Example");

var group = view.createObject("group", 40, 40, 360, 180);
group.name = "Digital Channel";

var capVisual = group.add(capability, 20, 30, 140, 55);
var appVisual = group.add(app, 190, 30, 140, 55);

console.log(capVisual.bounds.x);           // relative to the group
console.log(capVisual.absoluteBounds().x); // view coordinates
view.openInUI();
```

## Example: recolor by property

```js
$("element").each(function (el) {
  if (el.prop("status") === "deprecated") {
    $(el).objectRefs().attr("fillColor", "#f4cccc");
  }
});
```

## jArchi compatibility notes

The core jArchi idioms — selectors, collections, `model.create*`, view
`add`/`createObject`, properties, traversal — work as in desktop jArchi, so
many published jArchi scripts run unchanged. APIs tied to the desktop
platform (file system access, Java interop, UI toolkits, `load()` of external
scripts) do not exist here. When in doubt, the Monaco IntelliSense shows
exactly what is available.

`view.createPlainConnection()` and writable plain-connection appearance
fields are additive Archi Online APIs. They persist Archi's native diagram
connection attributes but are not currently part of desktop jArchi's public
API.

Related pages:

- [[Extension API|Extension-API]] — the `app` API for extending the UI.
- [[User Guide|User-Guide]] — the Scripting panel in context.
