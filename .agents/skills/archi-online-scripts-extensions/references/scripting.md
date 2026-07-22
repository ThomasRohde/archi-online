# Archi Online scripting reference

Use this reference for `.ajs` files and for the model-facing portion of an extension. In a repository checkout, verify exact signatures against `docs/wiki/Scripting-API.md` and `src/scripting/jarchi-dts.ts`.

## Runtime contract

- Globals: `$`, `model`, `console`, restricted `window.alert/confirm/prompt`, and `exit()`.
- Scripts are trusted browser code, not sandboxed code.
- One successful script run is one undo step. Wrapper mutations enforce read-only state and model rules.
- Supported type spellings include jArchi kebab-case and ArchiMate CamelCase; relationships may omit the `-relationship` suffix.
- Desktop-only Java, Eclipse, shell, and filesystem APIs are unavailable.

## Select and inspect

```js
var elements = $('element');
var customer = $('.Customer').first();
var services = $('business-service');

elements.each(function (item, index) {
  console.log(index, item.id, item.type, item.name);
});

var matches = elements.filter(function (item) {
  return item.name.indexOf('Portal') >= 0;
});
```

Useful selectors: `*`, `concept`, `element`, `relationship`, `view`, `folder`, a kebab-case type, `.Exact name`, `#id`, or `type.Exact name`.

Collections expose `size`, `length`, `first`, `last`, `get`, `toArray`, `each`, `map`, `filter`, `not`, `is`, `add`, `prop`, `removeProp`, `attr`, and `delete`. Traversal includes `children`, `find`, `parent`, `parents`, `rels`, `inRels`, `outRels`, `ends`, `sourceEnds`, `targetEnds`, `objectRefs`, and `viewRefs`.

## Create a model slice

```js
var actor = model.createElement('business-actor', 'Customer');
var service = model.createElement('business-service', 'Claims Service');
var relation = model.createRelationship(
  'serving-relationship',
  '',
  service,
  actor
);

var view = model.createArchimateView('Service Overview');
var actorNode = view.add(actor, 40, 40, 160, 60);
var serviceNode = view.add(service, 40, 160, 160, 60);
view.add(relation, serviceNode, actorNode);
view.openInUI();
```

`createRelationship` rejects illegal ArchiMate endpoint/type combinations. Do not catch and ignore that error unless the requested workflow explicitly treats the relationship as optional.

## Common wrappers

All wrappers expose read-only `id` and `type`, plus appropriate `name`, `documentation`, `prop`, `removeProp`, and `delete` members.

- `JConcept`: relationship `source`/`target`; specialization; `setType`; relationship fields; `invert`.
- `JView`: `add`, `createObject`, `createLegend`, `createPlainConnection`, `nodes`, `connections`, `bounds`, `layout`, `openInUI`, `routerType`.
- `JVisual`: `concept`, `view`, relative `bounds`, `absoluteBounds`, `add`, `parent`, `children`, `connections`, text and appearance fields.
- `JConnection`: connectable `source`/`target`, `concept`, style, bendpoints, `absoluteRoute`, `setAbsoluteRoute`, `routedPoints`, and `reconnect`.
- `JFolder`: `children`, `find`, and hierarchy navigation.

Prefer `view.layout()` for coordinated node/connection geometry changes. It validates ownership and finite coordinates and applies the change as one operation.

## Defensive pattern

```js
var view = $('view').first();
if (!view) {
  console.warn('No view is available.');
  exit();
}

var applications = $('application-component');
if (applications.isEmpty()) {
  console.info('No application components are available.');
  exit();
}
```

The Scripting panel does not expose `app.selection`; that is an extension API. Do not invent a `selection` selector. If a script must work from a chosen set, ask for an exact name/property criterion or implement it as an extension that uses `app.selection`.

## Review checklist

- Use exact selectors intentionally; name selectors are exact, not substring searches.
- Keep the replacement returned by `concept.setType()`; the original wrapper points to a removed concept.
- Use mandatory preview/apply APIs for find/replace and global property-key edits.
- Treat a preview as stale after a model, session, or active-view change.
- Use wrapper APIs for model mutations and expect invalid/read-only operations to throw.
- Avoid relying on undocumented globals, raw object shapes, or current store internals.
- Test on a disposable model, verify the resulting model/view, then undo once and confirm the complete run reverses.
