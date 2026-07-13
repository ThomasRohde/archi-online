# Phase 2 reciprocal parity fixtures

`phase2-online.archimate` is deterministically authored from Archi Online's
normalized state. Its adjacent semantic JSON is captured from that state before
serialization, so the XML parser is not used as its own oracle.

`source/phase2-desktop-authored.archimate` is a separately hand-authored
Desktop-native source. It does not import, call, or reuse the Online fixture
builder or parser. Installed Desktop Archi `5.9.0.202604140726` loaded and saved
that source to produce the frozen `phase2-desktop.archimate` golden. Its adjacent
semantic JSON is independently hand-maintained from the authored source rather
than derived by Online parsing. Desktop IDs, object ordering, geometry, property
ordering, recursive topology, route coordinates, and legend configuration are
deliberately distinct from the Online pair. Together the fixtures cover:

- the complete root-folder set and a nested custom folder;
- properties on the model, folders, concepts, views, groups, notes, legends,
  and plain connections, including blank, duplicate, ordered, and rename keys;
- directly nested Application Components with a legal Composition relationship,
  stored diagram occurrence, and derived hidden/revealed rendering;
- node-to-connection, connection-to-node, and recursive semantic/visual chains;
- manual and Manhattan routers, including dormant manual bendpoints;
- a named, documented, property-bearing note connection; and
- a configured native live legend.

The malformed fixtures prove atomic rejection of a missing endpoint and a
recursive endpoint cycle.

Regenerate the Online fixture and malformed probes, then verify without
changing committed goldens:

```text
npm run fixtures:phase2
npm run verify:phase2
npm run verify:phase2:desktop
```

The ordinary generator contains no Desktop authoring path and never writes the
Desktop source, golden, or semantic baseline. Its Vitest coverage generates
Online candidates in a temporary directory, compares their bytes with the
committed Online/malformed artifacts, and removes the directory in `finally`.
Maintainers update the Desktop-native source and semantic JSON by independent
review, ask the pinned Desktop CLI to load/save the source into a temporary
candidate, and replace the frozen golden only after the complete verifier passes.

`verify:phase2` is the cross-platform CI gate. It checks both independent
semantic contracts through an Online serialize/reparse cycle, proves both
malformed failures, hashes every golden before and after, and fails if any file
changes. `verify:phase2:desktop` first runs that gate, checks the exact installed
Desktop version, asks Desktop to rebuild a temporary candidate directly from
the authored source, requires exact byte identity with the frozen golden plus
agreement with the independent baseline, then round-trips both fixtures through
Online and Desktop. It independently settles each cleanup in an outer `finally`
block and rechecks committed source/golden/baseline hashes.

Visual and interaction evidence is recorded in `RENDERING-CHECKLIST.md` and
`BROWSER-SMOKE.md`; it complements rather than replaces semantic verification.
