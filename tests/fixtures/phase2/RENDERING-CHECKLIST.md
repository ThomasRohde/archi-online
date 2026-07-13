# Archi 5.9 Phase 2 rendering checklist

Compatibility oracle: Archi `5.9.0.202604140726` at `C:\Program Files\Archi`.

Certification completed on July 13, 2026. The Online fixture is generated from
Online normalized state. The separate Desktop fixture starts from hand-authored
Desktop-native XML and a hand-maintained semantic contract, then passes a real
installed-Desktop CLI load/save. Both frozen fixtures passed an Online
serialize/reparse cycle and a separate Desktop cycle in temporary paths. The
committed Desktop source, golden, semantic JSON, and Online pair stayed
byte-for-byte unchanged.

| Check | Desktop Archi 5.9 | Archi Online |
| --- | --- | --- |
| Full root folders and nested custom folder | Verified semantically | Verified semantically and in tree |
| Nested element topology | Verified semantically | Verified semantically and visually |
| Node-to-connection and connection-to-node endpoints | Verified semantically | Verified semantically and visually |
| Recursive relationship/visual endpoint chains | Verified semantically | Verified semantically and visually |
| Manual router and explicit bendpoints | Verified semantically | Verified semantically and visually |
| Manhattan router with dormant manual bendpoints | Verified semantically | Verified semantically and visually |
| Named/property-bearing plain note connection | Verified semantically | Verified semantically and visually |
| Configured live legend fields | Verified semantically | Verified semantically and visually |
| Ordered properties on every supported owner kind | Verified semantically | Verified semantically and in Properties Manager |
| Missing endpoint rejected | Not used as a Desktop input | Verified atomic failure |
| Endpoint cycle rejected | Not used as a Desktop input | Verified atomic failure |

Desktop normalizes omitted native defaults and does not retain names on
semantic diagram-connection occurrences. The canonical Phase 2 semantic layer
therefore compares those documented defaults explicitly and treats the
underlying relationship name as authoritative. It does not ignore endpoint
topology, router mode, dormant bendpoints, plain-connection fields, legend
configuration, property order, or adjacency order.

Automated evidence comes from `tests/phase2-fixtures.test.ts`,
`npm run verify:phase2`, and `npm run verify:phase2:desktop`. The browser record
in `BROWSER-SMOKE.md` covers rendered output and interaction behavior that an
XML semantic comparison cannot prove.
