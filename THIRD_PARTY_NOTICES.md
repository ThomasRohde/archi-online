# Third-Party Notices

Archi Online is licensed under the MIT License. It includes or derives behavior
from the third-party material listed below under each material's own license.

## Archi

Source: https://github.com/archimatetool/archi

License: MIT

Copyright (c) 2013-2026 Phillip Beauvoir, Jean-Baptiste Sarrodie, The Open Group

Derived material in this repository:

- `tools/data/relationships.xml` is the ArchiMate 3.2 relationship matrix used
  by Archi.
- `src/model/data/relations-matrix.ts` is generated from that relationship
  matrix.
- `src/canvas/figures/icons.tsx` contains TypeScript/SVG transcriptions of
  Archi element icon geometry from Archi figure classes.
- `src/model/io/exchange-xml/` is a TypeScript port of Archi's Open Exchange
  format import/export (`org.opengroup.archimate.xmlexchange` plugin).
- `tests/fixtures/exchange-sample1.xml` and
  `tests/fixtures/exchange-bendpoint.xml` are Open Exchange test files from
  Archi's `org.opengroup.archimate.xmlexchange.tests` plugin.

The MIT permission notice is included in `LICENSE`.

## Eclipse Draw2D Manhattan connection router

Source: https://github.com/archimatetool/archi/blob/release_5.9.0/org.eclipse.draw2d/src/org/eclipse/draw2d/ManhattanConnectionRouter.java

Pinned Archi source: tag `release_5.9.0`, commit
`e0ba88c6b3391e0d3c5839917474d1b6085adbe4`

License: Eclipse Public License 1.0 (EPL-1.0),
https://www.eclipse.org/legal/epl-v10.html

Complete license text: `public/licenses/EPL-1.0.txt`

Complete Archi Online MIT terms: `public/licenses/MIT.txt`

Distributed copyright, modification, and corresponding-source notice:
`public/licenses/Eclipse-Draw2D-NOTICE.txt`

Exact corresponding modified source included with the object distribution:
`public/licenses/source/manhattan-router.ts.txt`

Vite copies all four files to `dist/licenses/` so every production object-code
distribution includes both complete licenses, the IBM/Draw2D notice, explicit
EPL object-code disclaimers, and the exact corresponding modified source.

Copyright (c) 2000, 2010 IBM Corporation and others.

Derived material in this repository:

- `src/canvas/manhattan-router.ts` is a behaviorally faithful TypeScript port
  of `org.eclipse.draw2d.ManhattanConnectionRouter`, including route direction,
  spacing, and row/column reservation behavior.

## elkjs

Source: https://github.com/kieler/elkjs

License: EPL-2.0

Used for the bundled ELK layered layout extension host API.
