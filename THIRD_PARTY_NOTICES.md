# Third-Party Notices

Archi Online is licensed under the MIT License. Some compatibility data and
visual geometry are derived from the Archi project, which is also licensed
under the MIT License.

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

## elkjs

Source: https://github.com/kieler/elkjs

License: EPL-2.0

Used for the bundled ELK layered layout extension host API.
