# Scripting API

Archi Online exposes a jArchi-style JavaScript API in the **Scripting** panel.
Scripts run in the browser against the currently open model. One script run is
batched into one undo transaction.

The API intentionally follows common jArchi patterns where possible:

- global `$()` selector
- global `model`
- wrapper objects for concepts, views, visuals, connections, folders, and
  collections
- properties through `prop()` and `removeProp()`
- relationship traversal helpers

## Running Scripts

Open **Scripting**, choose or create a script, then click **Run** or press
`Ctrl+Enter` in the editor.

Scripts have access to:

- `$`
- `model`
- `console`
- `window.alert`, `window.confirm`, `window.prompt`
- `exit()`

## Selectors

Use `$()` to select model objects:

```js
$("*");
$("element");
$("relationship");
$("view");
$("folder");
$("concept");
$("business-actor");
$(".Customer");
$("#some-id");
$("business-actor.Customer");
```

`$()` returns a `JCollection`.

## Collections

Common collection methods:

```js
var actors = $("business-actor");

actors.size();
actors.length;
actors.isEmpty();
actors.first();
actors.last();
actors.get(0);
actors.toArray();

actors.each(function (obj, index) {
  console.log(index, obj.name);
});

actors.filter(function (obj) {
  return obj.name.indexOf("Customer") >= 0;
});

actors.filter(".Customer");
actors.not(".Draft");
actors.is("business-actor");
```

Traversal helpers:

```js
$("folder").children();
$("folder").find();
$("business-actor").parent();
$("business-actor").parents();

$(".Application").rels();
$(".Application").inRels();
$(".Application").outRels();
$("serving-relationship").sourceEnds();
$("serving-relationship").targetEnds();

$(".Customer").objectRefs();
$(".Customer").viewRefs();
```

## Model

The global `model` wrapper exposes:

```js
model.name;
model.purpose;

model.prop();
model.prop("key");
model.prop("key", "value");
model.removeProp("key");

model.createElement(type, name, folder);
model.createRelationship(type, name, source, target, folder);
model.createArchimateView(name, folder);
```

Example:

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

Type names accept ArchiMate names in kebab style, such as
`business-actor`, `application-component`, and `serving-relationship`.

## Common Object Fields

All wrapper objects have:

```js
obj.id;
obj.type;
obj.name;
obj.documentation;
obj.prop();
obj.prop("key");
obj.prop("key", "value");
obj.removeProp("key");
obj.delete();
```

Not every wrapper supports every setter. For example, folders and concepts can
be renamed, while connections derive names from relationships.

## Concepts

`JConcept` wraps elements and relationships.

Relationship-only fields:

```js
relationship.source;
relationship.target;
relationship.accessType;
relationship.influenceStrength;
relationship.associationDirected;
```

## Views

`JView` wraps an ArchiMate diagram view.

```js
view.name;
view.documentation;
view.viewpoint;
view.openInUI();

view.add(element, x, y, width, height);
view.add(relationship, sourceVisual, targetVisual);
view.createObject("note", x, y, width, height);
view.createObject("group", x, y, width, height);
```

Diagram automation helpers:

```js
view.nodes();
view.nodes({ recursive: true });
view.connections();
view.bounds();
view.bounds({ recursive: false });
```

`view.bounds()` returns the union of node bounds in view coordinates, or `null`
for an empty view.

## Visual Objects

`JVisual` wraps a diagram node, such as an element visual, note, group, or view
reference.

```js
visual.concept;
visual.view;
visual.bounds;
visual.text;
visual.fillColor;
visual.lineColor;
visual.fontColor;
visual.opacity;

visual.add(element, x, y, width, height);
visual.parent();
visual.children();
visual.absoluteBounds();
visual.connections();
visual.connections({ incoming: false });
visual.connections({ outgoing: false });
```

`visual.bounds` is parent-relative. `visual.absoluteBounds()` returns view-space
coordinates, which are easier to use for layout engines.

## Connections

`JConnection` wraps a diagram connection.

```js
connection.view;
connection.source;
connection.target;
connection.concept;
connection.lineColor;
connection.bendpoints;
connection.absoluteRoute();
connection.setAbsoluteRoute(points);
```

`bendpoints` uses the raw Archi/GEF offset representation:

```js
connection.bendpoints = [
  { startX: 10, startY: 20, endX: -30, endY: 40 }
];
```

For layout tools, prefer absolute intermediate route points:

```js
connection.setAbsoluteRoute([
  { x: 180, y: 130 },
  { x: 220, y: 160 }
]);

console.log(connection.absoluteRoute());
```

The source and target anchors are not included in `absoluteRoute()`.

## Bulk Layout

Use `view.layout()` to apply many node and route changes in one transaction:

```js
var view = $("view").first();
var nodes = view.nodes({ recursive: true });

var updates = {};
nodes.forEach(function (node, index) {
  updates[node.id] = {
    x: 80 + index * 180,
    y: 120,
    width: 140,
    height: 60
  };
});

view.layout({ nodes: updates });
```

Connection route changes can be applied in the same transaction:

```js
view.layout({
  nodes: {
    [node.id]: { x: 80, y: 120 }
  },
  connections: {
    [connection.id]: {
      route: [{ x: 260, y: 150 }]
    }
  }
});
```

Layout coordinates are absolute view coordinates. Stored nested node bounds
remain parent-relative after the update.

Validation rules:

- node IDs must belong to the target view
- connection IDs must belong to the target view
- coordinates and dimensions must be finite numbers
- omitted width and height keep current values
- minimum node dimensions follow app settings
- a connection update can use `route` or `bendpoints`, not both
- `route: []` clears manual routing

## Example: Simple Audit

```js
var unnamed = $("element").filter(function (item) {
  return !item.name || !item.name.trim();
});

console.log("Elements:", $("element").size());
console.log("Relationships:", $("relationship").size());
console.log("Views:", $("view").size());
console.log("Unnamed elements:", unnamed.size());
```

## Example: Create A Nested Group

```js
var capability = model.createElement("capability", "Online Service");
var app = model.createElement("application-component", "Claims Portal");
var view = model.createArchimateView("Nested Example");

var group = view.createObject("group", 40, 40, 360, 180);
group.name = "Digital Channel";

var capVisual = group.add(capability, 20, 30, 140, 55);
var appVisual = group.add(app, 190, 30, 140, 55);

console.log(capVisual.bounds.x);          // relative to group
console.log(capVisual.absoluteBounds().x); // view coordinate
view.openInUI();
```

Related pages:

- [[Extension API|Extension-API]]
- [[Extension Packages|Extension-Packages]]

