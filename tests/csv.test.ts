import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { applyCsvImport, parseCsvRecords, serializeCsv } from '../src/model/io/csv';
import { createEmptyModel } from '../src/model/ops/concepts';
import type { ModelState } from '../src/model/types';

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
const model = parseArchimate(archisurance);

describe('parseCsvRecords', () => {
  it('parses quoted fields with embedded delimiters, quotes, and newlines', () => {
    const records = parseCsvRecords('"a,b","say ""hi""","line1\r\nline2"\r\n"x","y","z"');
    expect(records).toEqual([
      ['a,b', 'say "hi"', 'line1\r\nline2'],
      ['x', 'y', 'z'],
    ]);
  });

  it('auto-detects semicolon and tab delimiters', () => {
    expect(parseCsvRecords('"a";"b"\r\n"c";"d"')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsvRecords('"a"\t"b"')).toEqual([['a', 'b']]);
  });

  it('auto-detects unquoted semicolon and tab delimiters', () => {
    expect(parseCsvRecords('a;b\r\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsvRecords('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('skips comment lines and tolerates a BOM', () => {
    expect(parseCsvRecords('﻿# comment\r\n"a","b"')).toEqual([['a', 'b']]);
  });
});

describe('serializeCsv', () => {
  const files = serializeCsv(model);
  const [elements, relations, properties] = files;

  it('produces the three Archi file names', () => {
    expect(files.map((f) => f.name)).toEqual(['elements.csv', 'relations.csv', 'properties.csv']);
    const prefixed = serializeCsv(model, { filePrefix: 'x-' });
    expect(prefixed[0].name).toBe('x-elements.csv');
  });

  it('writes the exact Archi headers and the model row first', () => {
    const rows = elements.content.split('\r\n');
    expect(rows[0]).toBe('"ID","Type","Name","Documentation","Specialization"');
    expect(rows[1].startsWith(`"${model.info.id}","ArchimateModel","Archisurance"`)).toBe(true);
    expect(relations.content.split('\r\n')[0]).toBe(
      '"ID","Type","Name","Documentation","Source","Target","Specialization"',
    );
    expect(properties.content.split('\r\n')[0]).toBe('"ID","Key","Value"');
  });

  it('covers every element and relationship exactly once', () => {
    expect(elements.content.split('\r\n').length).toBe(
      1 + 1 + Object.keys(model.elements).length,
    );
    expect(relations.content.split('\r\n').length).toBe(
      1 + Object.keys(model.relationships).length,
    );
  });

  it('writes access type as a pseudo-property', () => {
    // Archisurance relationship 695 has accessType 1 (Read).
    expect(properties.content).toContain('"695","Access_Type","Read"');
  });

  it('honors BOM and delimiter options', () => {
    const semi = serializeCsv(model, { delimiter: ';', bom: true });
    expect(semi[0].content.charCodeAt(0)).toBe(0xfeff);
    expect(semi[0].content).toContain('"ID";"Type"');
  });
});

describe('CSV round-trip into an empty model', () => {
  const files = serializeCsv(model);
  const target = createEmptyModel('Empty');
  applyCsvImport(target, {
    elements: files[0].content,
    relations: files[1].content,
    properties: files[2].content,
  });

  it('recreates the model header', () => {
    expect(target.info.name).toBe('Archisurance');
  });

  it('recreates all elements with types and names', () => {
    expect(Object.keys(target.elements).length).toBe(Object.keys(model.elements).length);
    for (const el of Object.values(model.elements)) {
      const back = target.elements[el.id];
      expect(back, `element ${el.id}`).toBeTruthy();
      expect(back.type).toBe(el.type);
      expect(back.name).toBe(el.name);
    }
  });

  it('recreates all relationships with endpoints and extras', () => {
    expect(Object.keys(target.relationships).length).toBe(
      Object.keys(model.relationships).length,
    );
    for (const rel of Object.values(model.relationships)) {
      const back = target.relationships[rel.id];
      expect(back, `relationship ${rel.id}`).toBeTruthy();
      expect(back.type).toBe(rel.type);
      expect(back.sourceId).toBe(rel.sourceId);
      expect(back.targetId).toBe(rel.targetId);
      if (rel.type === 'AccessRelationship') {
        expect(back.accessType ?? 0).toBe(rel.accessType ?? 0);
      }
      if (rel.strength) expect(back.strength).toBe(rel.strength);
      expect(!!back.directed).toBe(!!rel.directed);
    }
  });

  it('recreates concept properties', () => {
    for (const el of Object.values(model.elements)) {
      if (el.properties.length === 0) continue;
      expect(target.elements[el.id].properties).toEqual(el.properties);
    }
  });
});

describe('CSV import semantics', () => {
  function baseModel(): ModelState {
    const m = createEmptyModel('Base');
    return m;
  }

  it('updates existing objects by id instead of duplicating', () => {
    const m = baseModel();
    const csv =
      '"ID","Type","Name","Documentation"\r\n"e1","BusinessActor","First","d1"';
    applyCsvImport(m, { elements: csv });
    expect(m.elements.e1.name).toBe('First');
    const csv2 =
      '"ID","Type","Name","Documentation"\r\n"e1","BusinessActor","Renamed","d2"';
    applyCsvImport(m, { elements: csv2 });
    expect(Object.keys(m.elements).length).toBe(1);
    expect(m.elements.e1.name).toBe('Renamed');
    expect(m.elements.e1.documentation).toBe('d2');
  });

  it('rejects a record whose id exists with another class', () => {
    const m = baseModel();
    applyCsvImport(m, {
      elements: '"ID","Type","Name","Documentation"\r\n"x1","BusinessActor","A",""',
    });
    expect(() =>
      applyCsvImport(m, {
        elements: '"ID","Type","Name","Documentation"\r\n"x1","BusinessRole","B",""',
      }),
    ).toThrow(/different class/);
  });

  it('rejects relationships that violate the ArchiMate rules', () => {
    const m = baseModel();
    const elements =
      '"ID","Type","Name","Documentation"\r\n' +
      '"a","BusinessActor","A",""\r\n' +
      '"o","BusinessObject","O",""';
    // BusinessActor -> BusinessObject Composition is not allowed.
    const relations =
      '"ID","Type","Name","Documentation","Source","Target"\r\n' +
      '"r1","CompositionRelationship","","","a","o"';
    expect(() => applyCsvImport(m, { elements, relations })).toThrow(/Invalid relationship/);
  });

  it('applies special pseudo-properties to concept attributes', () => {
    const m = baseModel();
    const elements =
      '"ID","Type","Name","Documentation"\r\n' +
      '"a","BusinessActor","A",""\r\n' +
      '"b","BusinessActor","B",""\r\n' +
      '"j","Junction","",""';
    const relations =
      '"ID","Type","Name","Documentation","Source","Target"\r\n' +
      '"r1","AssociationRelationship","","","a","b"';
    const properties =
      '"ID","Key","Value"\r\n' +
      '"r1","Directed","true"\r\n' +
      '"j","Junction_Type","Or"\r\n' +
      '"a","team","platform"';
    applyCsvImport(m, { elements, relations, properties });
    expect(m.relationships.r1.directed).toBe(true);
    expect(m.elements.j.junctionType).toBe('or');
    expect(m.elements.a.properties).toEqual([{ key: 'team', value: 'platform' }]);
  });

  it('rejects ids with illegal characters', () => {
    const m = baseModel();
    expect(() =>
      applyCsvImport(m, {
        elements: '"ID","Type","Name","Documentation"\r\n"bad id!","BusinessActor","A",""',
      }),
    ).toThrow(/Illegal characters/);
  });

  it('rejects properties for unknown objects', () => {
    const m = baseModel();
    expect(() =>
      applyCsvImport(m, { properties: '"ID","Key","Value"\r\n"ghost","k","v"' }),
    ).toThrow(/missing object/);
  });
});
