# Visualiser Relationship Names and Main-Canvas Docking

## Goal

Let users opt into readable relationship names in the Visualiser while keeping
the graph uncluttered by default, and give the Visualiser the main-canvas space
needed for useful graph exploration.

## Approved behavior

- Add a visible **Relationship names** checkbox to the Visualiser controls.
- Keep the option off by default.
- Persist the option with the existing analysis preferences.
- Apply the option identically to the live Visualiser, SVG export, PNG export,
  and Copy PNG.
- When enabled, show only a relationship's trimmed, non-empty stored name. Do
  not invent labels from relationship types such as `Aggregation` or
  `Assignment`.
- For a relationship represented by source and target edge segments, add the
  edge label only to the target segment so the two segments do not duplicate it.
- Position labels at the true half-length point of the routed polyline, not at
  the middle array entry. Offset the text slightly above the line and add a
  white outline so the line remains readable behind it.
- Opening or reopening the Visualiser places it as a tab in the central
  view/Welcome group. It remains absent from the initial default layout and is
  not forced open on application startup.
- Respect existing persisted dock layouts and any placement chosen by the user.

## Architecture

Extend `AnalysisPreferences` with a boolean `showRelationshipNames`. The
existing version-1 preference normalizer treats missing or invalid values as
`false`, so existing IndexedDB records require no migration or key change.

Keep the current standalone export builder, but make label eligibility and
placement shared pure behavior. Both the live React SVG and the standalone SVG
builder use the same rule: the option must be enabled, the stored relationship
name must be non-empty after trimming, and a source segment must not receive a
label. Use the existing `pointAlong(points, 0.5)` geometry helper for the label
anchor.

Pass `showRelationshipNames` explicitly into standalone graph rendering. The
Visualiser export action supplies the current persisted preference, ensuring
SVG, PNG, and clipboard PNG all receive the same markup. The exported SVG keeps
label styling inline; the live SVG uses a matching CSS class.

Change the Visualiser tool-panel factory to use `centerPosition(api,
'visualiser')`. That helper already targets an open ArchiMate view or the pinned
Welcome tab, which is the main-canvas group used by view panels.

## Error and compatibility behavior

- Missing or unreadable analysis preferences continue to fall back safely to
  defaults, including `showRelationshipNames: false`.
- Empty and whitespace-only relationship names render no edge label.
- Unnamed relationships never fall back to a metamodel type label.
- Existing saved dock layouts are restored unchanged; the new placement applies
  when the Visualiser panel must be created or recreated.
- No model state, undo history, public API, dependency, or file format changes.

## Testing and verification

- Preference tests cover the default, invalid-value normalization, and persisted
  `true` round trip.
- Visualiser tests prove labels are absent by default, appear in both live and
  standalone SVG output when enabled, omit unnamed/type-fallback labels, appear
  only once for split relationships, and use the routed polyline half-length.
- Dock-layout tests prove a reopened Visualiser joins the Welcome/view group even
  when Navigator is open.
- Update the User Guide to mention the optional names and central-tab placement.
- Run the focused Visualiser, preference, and dock tests, then lint, typecheck,
  the full test suite, and the production build.
- In a production preview, enable the checkbox and verify the live graph and a
  copied PNG show the same readable relationship label; disable it and verify
  both omit the label.
