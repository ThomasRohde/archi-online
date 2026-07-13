import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import type {
  ArchimateElement,
  ArchimateRelationship,
  DiagramView,
  ModelState,
  Property,
} from '../src/model/types';
import {
  DEFAULT_TREE_SEARCH_CRITERIA,
  JAVA21_CASE_FOLD_DATA_SHA256,
  JAVA21_CASE_FOLD_SOURCE_SHA256,
  JAVA21_CASE_FOLD_SOURCE_URL,
  JAVA21_CASE_FOLD_UNICODE_VERSION,
  JAVA21_SIMPLE_CASE_FOLD_DATA,
  collectTreeSearchCatalog,
  compileTreeSearch,
  javaCaseInsensitiveCanonical,
  javaStringEqualsIgnoreCase,
  reconcileTreeSearchCatalog,
  resetTreeSearchCriteria,
  searchModelTree,
  treeItemLabel,
  treeSearchProfileKey,
  type TreeSearchCriteria,
  type TreeSearchProfile,
} from '../src/ui/tree-filter';

function cssBlock(css: string, selector: string): string {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 's')
    .exec(css);
  expect(match, `Expected CSS block for "${selector}"`).toBeTruthy();
  return match![1];
}

function folderFor(model: ModelState, folderType: string) {
  return Object.values(model.folders).find((folder) => folder.folderType === folderType)!;
}

function addElement(
  model: ModelState,
  input: Partial<ArchimateElement> & Pick<ArchimateElement, 'id' | 'type' | 'name'>,
): ArchimateElement {
  const folder = folderFor(model, 'business');
  const element: ArchimateElement = {
    id: input.id,
    kind: 'element',
    type: input.type,
    name: input.name,
    documentation: input.documentation ?? '',
    properties: input.properties ?? [],
    profileIds: input.profileIds ?? [],
    folderId: input.folderId ?? folder.id,
  };
  model.elements[element.id] = element;
  model.folders[element.folderId].itemIds.push(element.id);
  return element;
}

function addRelationship(
  model: ModelState,
  input: Partial<ArchimateRelationship> & Pick<ArchimateRelationship, 'id' | 'name'>,
): ArchimateRelationship {
  const folder = folderFor(model, 'relations');
  const relationship: ArchimateRelationship = {
    id: input.id,
    kind: 'relationship',
    type: input.type ?? 'AssociationRelationship',
    name: input.name,
    documentation: input.documentation ?? '',
    properties: input.properties ?? [],
    profileIds: input.profileIds ?? [],
    folderId: input.folderId ?? folder.id,
    sourceId: input.sourceId ?? 'source',
    targetId: input.targetId ?? 'target',
  };
  model.relationships[relationship.id] = relationship;
  model.folders[relationship.folderId].itemIds.push(relationship.id);
  return relationship;
}

function addView(
  model: ModelState,
  input: Partial<DiagramView> & Pick<DiagramView, 'id' | 'name'>,
): DiagramView {
  const folder = folderFor(model, 'diagrams');
  const view: DiagramView = {
    id: input.id,
    kind: 'view',
    name: input.name,
    documentation: input.documentation ?? '',
    properties: input.properties ?? [],
    folderId: input.folderId ?? folder.id,
    childIds: [],
  };
  model.views[view.id] = view;
  model.folders[view.folderId].itemIds.push(view.id);
  return view;
}

function criteria(patch: Partial<TreeSearchCriteria> = {}): TreeSearchCriteria {
  return { ...DEFAULT_TREE_SEARCH_CRITERIA, ...patch };
}

function search(model: ModelState, patch: Partial<TreeSearchCriteria>) {
  return searchModelTree(model, compileTreeSearch(criteria(patch)));
}

describe('structured model-tree search', () => {
  it('is inactive until a query-backed field or a typed/dynamic filter is selected', () => {
    const model = createEmptyModel('Model');
    expect(search(model, {}).active).toBe(false);
    expect(search(model, { query: 'text', searchName: false }).active).toBe(false);
    expect(search(model, { showAllFolders: true }).active).toBe(false);
    expect(search(model, { propertyKeys: ['Owner'] }).active).toBe(true);
    expect(search(model, { conceptTypes: ['BusinessActor'] }).active).toBe(true);
  });

  it('ORs type, specialization, and View filters then ANDs that group with text fields', () => {
    const model = createEmptyModel('Model');
    model.profiles.external = {
      id: 'external',
      name: 'External Party',
      conceptType: 'BusinessActor',
      specialization: true,
    };
    const typed = addElement(model, {
      id: 'typed', type: 'BusinessActor', name: 'Needle actor', profileIds: ['external'],
    });
    const wrongText = addElement(model, {
      id: 'wrong-text', type: 'BusinessActor', name: 'Other actor', profileIds: ['external'],
    });
    const wrongType = addElement(model, {
      id: 'wrong-type', type: 'BusinessObject', name: 'Needle object',
    });
    const view = addView(model, { id: 'view', name: 'Needle view' });

    const result = search(model, {
      query: 'Needle',
      conceptTypes: ['BusinessActor'],
      specializations: [{ name: 'external party', conceptType: 'BusinessActor' }],
      includeViews: true,
    });

    expect(result.matchedIds).toEqual(new Set([typed.id, view.id]));
    expect(result.matchedIds.has(wrongText.id)).toBe(false);
    expect(result.matchedIds.has(wrongType.id)).toBe(false);
  });

  it('ORs raw name, documentation, and property-value matches', () => {
    const model = createEmptyModel('Model');
    const byName = addElement(model, { id: 'name', type: 'BusinessActor', name: 'needle' });
    const byDocs = addElement(model, {
      id: 'docs', type: 'BusinessActor', name: 'plain', documentation: 'needle docs',
    });
    const byProperty = addElement(model, {
      id: 'property', type: 'BusinessActor', name: 'plain',
      properties: [{ key: 'Status', value: 'needle value' }],
    });
    const result = search(model, {
      query: 'needle', searchDocumentation: true, searchPropertyValues: true,
    });

    expect(result.matchedIds).toEqual(new Set([byName.id, byDocs.id, byProperty.id]));
  });

  it('searches raw names, documentation, and properties on every model-tree owner kind', () => {
    const model = createEmptyModel('Root raw name');
    model.info.documentation = 'root documentation token';
    model.info.properties = [{ key: 'Root key', value: 'root property token' }];
    const folder = folderFor(model, 'business');
    folder.name = 'Folder raw name';
    folder.documentation = 'folder documentation token';
    folder.properties = [{ key: 'Folder key', value: 'folder property token' }];
    const relationship = addRelationship(model, {
      id: 'relationship-owner',
      name: 'Relationship raw name',
      documentation: 'relationship documentation token',
      properties: [{ key: 'Relationship key', value: 'relationship property token' }],
    });
    const view = addView(model, {
      id: 'view-owner',
      name: 'View raw name',
      documentation: 'view documentation token',
      properties: [{ key: 'View key', value: 'view property token' }],
    });

    for (const [query, id] of [
      ['Root raw name', model.info.id],
      ['Folder raw name', folder.id],
      ['Relationship raw name', relationship.id],
      ['View raw name', view.id],
    ] as const) {
      expect(search(model, { query }).matchedIds.has(id)).toBe(true);
    }
    for (const [query, id] of [
      ['root documentation token', model.info.id],
      ['folder documentation token', folder.id],
      ['relationship documentation token', relationship.id],
      ['view documentation token', view.id],
    ] as const) {
      expect(search(model, {
        query, searchName: false, searchDocumentation: true,
      }).matchedIds.has(id)).toBe(true);
    }
    for (const [query, id] of [
      ['root property token', model.info.id],
      ['folder property token', folder.id],
      ['relationship property token', relationship.id],
      ['view property token', view.id],
    ] as const) {
      expect(search(model, {
        query, searchName: false, searchPropertyValues: true,
      }).matchedIds.has(id)).toBe(true);
    }
  });

  it('treats whitespace as query text and honors Match Case', () => {
    const model = createEmptyModel('Model');
    const actor = addElement(model, { id: 'case', type: 'BusinessActor', name: 'Case Sensitive' });

    expect(search(model, { query: ' ' }).active).toBe(true);
    expect(search(model, { query: 'case sensitive' }).matchedIds.has(actor.id)).toBe(true);
    expect(search(model, { query: 'case sensitive', matchCase: true }).matchedIds.has(actor.id))
      .toBe(false);
  });

  it('searches raw stored names but not label expressions or synthesized relationship labels', () => {
    const model = createEmptyModel('Model');
    const source = addElement(model, { id: 'source', type: 'BusinessActor', name: 'Synth source' });
    const target = addElement(model, { id: 'target', type: 'BusinessActor', name: 'Synth target' });
    const relationship = addRelationship(model, {
      id: 'relation', name: '', sourceId: source.id, targetId: target.id,
    });
    const folder = folderFor(model, 'business');
    folder.labelExpression = 'Synth folder expression';

    expect(treeItemLabel(model, relationship.id)).toContain('Synth source');
    expect(search(model, { query: 'Synth source' }).matchedIds.has(relationship.id)).toBe(false);
    expect(search(model, { query: 'Synth folder expression' }).matchedIds.has(folder.id)).toBe(false);
  });

  it('uses selected property keys as exact key-presence filters and scopes value matching to them', () => {
    const model = createEmptyModel('Model');
    const owner = addElement(model, {
      id: 'owner', type: 'BusinessActor', name: 'Owner',
      properties: [{ key: 'Owner', value: 'Alice' }, { key: 'Status', value: 'needle' }],
    });
    const other = addElement(model, {
      id: 'other', type: 'BusinessActor', name: 'Other',
      properties: [{ key: 'owner', value: 'needle' }],
    });

    expect(search(model, { query: '', propertyKeys: ['Owner'] }).matchedIds)
      .toEqual(new Set([owner.id]));
    expect(search(model, {
      query: 'needle', searchName: false, searchPropertyValues: true, propertyKeys: ['Owner'],
    }).matchedIds.size).toBe(0);
    expect(search(model, {
      query: 'Alice', searchName: false, searchPropertyValues: true, propertyKeys: ['Owner'],
    }).matchedIds).toEqual(new Set([owner.id]));
    expect(search(model, {
      query: 'needle', searchName: false, searchPropertyValues: true,
    }).matchedIds).toEqual(new Set([owner.id, other.id]));
  });

  it('mirrors Desktop property order when the first selected-key value does not match', () => {
    const model = createEmptyModel('Model');
    const owner = addElement(model, {
      id: 'ordered-properties', type: 'BusinessActor', name: 'Owner',
      properties: [
        { key: 'Owner', value: 'first mismatch' },
        { key: 'Status', value: 'needle later' },
      ],
    });

    const result = search(model, {
      query: 'needle',
      searchName: false,
      searchPropertyValues: true,
      propertyKeys: ['Owner', 'Status'],
    });

    expect(result.matchedIds.has(owner.id)).toBe(false);
  });

  it('supports multiple concept types and profile descriptors across differing model-local ids', () => {
    const first = createEmptyModel('First');
    const second = createEmptyModel('Second');
    const descriptor: TreeSearchProfile = { name: 'external party', conceptType: 'BusinessActor' };
    first.profiles['profile-a'] = {
      id: 'profile-a', name: 'External Party', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles['profile-b'] = {
      id: 'profile-b', name: 'EXTERNAL PARTY', conceptType: 'BusinessActor', specialization: true,
    };
    const firstActor = addElement(first, {
      id: 'shared', type: 'BusinessActor', name: 'First', profileIds: ['profile-a'],
    });
    const secondActor = addElement(second, {
      id: 'shared', type: 'BusinessActor', name: 'Second', profileIds: ['missing', 'profile-b'],
    });
    const object = addElement(second, { id: 'object', type: 'BusinessObject', name: 'Object' });
    const component = addElement(second, {
      id: 'component', type: 'ApplicationComponent', name: 'Component',
    });
    const compiled = compileTreeSearch(criteria({
      searchName: false,
      conceptTypes: ['BusinessObject', 'ApplicationComponent'],
      specializations: [descriptor],
    }));

    expect(searchModelTree(first, compiled).matchedIds).toEqual(new Set([firstActor.id]));
    expect(searchModelTree(second, compiled).matchedIds)
      .toEqual(new Set([secondActor.id, object.id, component.id]));
    expect(search(first, {
      searchName: false,
      specializations: [{ name: 'External Party', conceptType: 'BusinessObject' }],
    }).matchedIds.size).toBe(0);
  });

  it('canonicalizes profile names with Java equalsIgnoreCase semantics', () => {
    for (const [left, right] of [
      ['IDENTITY', 'identity'],
      ['Ångström', 'ångström'],
      ['İ', 'i'],
      ['Σ', 'ς'],
      ['ПРОФИЛЬ', 'профиль'],
      ['東京', '東京'],
      ['𐐀', '𐐨'],
    ]) {
      expect(javaStringEqualsIgnoreCase(left, right), `${left} should equal ${right}`).toBe(true);
      expect(javaCaseInsensitiveCanonical(left)).toBe(javaCaseInsensitiveCanonical(right));
    }

    expect(javaStringEqualsIgnoreCase('Straße', 'STRASSE')).toBe(false);
    expect(javaCaseInsensitiveCanonical('Straße')).not.toBe(
      javaCaseInsensitiveCanonical('STRASSE'),
    );
    expect(treeSearchProfileKey({ name: 'İ', conceptType: 'BusinessActor' })).toBe(
      treeSearchProfileKey({ name: 'i', conceptType: 'BusinessActor' }),
    );
    expect(treeSearchProfileKey({ name: 'Σ', conceptType: 'BusinessActor' })).toBe(
      treeSearchProfileKey({ name: 'ς', conceptType: 'BusinessActor' }),
    );
    expect(treeSearchProfileKey({ name: 'Σ', conceptType: 'BusinessActor' })).not.toBe(
      treeSearchProfileKey({ name: 'ς', conceptType: 'BusinessObject' }),
    );
    expect(javaStringEqualsIgnoreCase('\u1c89', '\u1c8a')).toBe(false);
    expect(javaCaseInsensitiveCanonical('\u1c89')).not.toBe(
      javaCaseInsensitiveCanonical('\u1c8a'),
    );
  });

  it('pins the Java 21 Unicode 15 fold data version and deterministic hashes', () => {
    expect(JAVA21_CASE_FOLD_UNICODE_VERSION).toBe('15.0.0');
    expect(JAVA21_CASE_FOLD_SOURCE_URL).toBe(
      'https://www.unicode.org/Public/15.0.0/ucd/UnicodeData.txt',
    );
    expect(JAVA21_CASE_FOLD_SOURCE_SHA256)
      .toBe('806e9aed65037197f1ec85e12be6e8cd870fc5608b4de0fffd990f689f376a73');
    expect(JAVA21_SIMPLE_CASE_FOLD_DATA).toHaveLength(2_912);
    expect(createHash('sha256').update(JAVA21_SIMPLE_CASE_FOLD_DATA.join(',')).digest('hex'))
      .toBe(JAVA21_CASE_FOLD_DATA_SHA256);
    expect(JAVA21_CASE_FOLD_DATA_SHA256)
      .toBe('b52509337e3f5ef5091d4aecae61e272600f62d6fc232025cc314af8f14b3805');
  });

  it('uses every pinned simple fold pair and covers reference edge mappings', () => {
    let previous = -1;
    for (let index = 0; index < JAVA21_SIMPLE_CASE_FOLD_DATA.length; index += 2) {
      const source = JAVA21_SIMPLE_CASE_FOLD_DATA[index];
      const target = JAVA21_SIMPLE_CASE_FOLD_DATA[index + 1];
      expect(source).toBeGreaterThan(previous);
      expect(target).not.toBe(source);
      expect(javaCaseInsensitiveCanonical(String.fromCodePoint(source)))
        .toBe(String.fromCodePoint(target));
      previous = source;
    }

    for (const [source, target] of [
      [0x0041, 0x0061],
      [0x0130, 0x0069],
      [0x03a3, 0x03c3],
      [0x03c2, 0x03c3],
      [0x212a, 0x006b],
      [0x1e9e, 0x00df],
      [0x10400, 0x10428],
      [0x10428, 0x10428],
      [0x1c89, 0x1c89],
      [0x1c8a, 0x1c8a],
    ]) {
      expect(javaCaseInsensitiveCanonical(String.fromCodePoint(source)))
        .toBe(String.fromCodePoint(target));
    }
  });

  it('deduplicates Java-equivalent profile descriptors without merging different base types', () => {
    const first = createEmptyModel('First');
    const second = createEmptyModel('Second');
    first.profiles.a = {
      id: 'a', name: 'İ', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.b = {
      id: 'b', name: 'i', conceptType: 'BusinessActor', specialization: true,
    };
    first.profiles.c = {
      id: 'c', name: 'Σ', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.d = {
      id: 'd', name: 'ς', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.e = {
      id: 'e', name: 'i', conceptType: 'BusinessObject', specialization: true,
    };

    const catalog = collectTreeSearchCatalog([first, second]);
    expect(catalog.specializations).toHaveLength(3);
    expect(new Set(catalog.specializations.map(treeSearchProfileKey))).toEqual(new Set([
      treeSearchProfileKey({ name: 'i', conceptType: 'BusinessActor' }),
      treeSearchProfileKey({ name: 'Σ', conceptType: 'BusinessActor' }),
      treeSearchProfileKey({ name: 'i', conceptType: 'BusinessObject' }),
    ]));
  });

  it('matches Java-equivalent selected profiles across models and keeps base types exact', () => {
    const first = createEmptyModel('First');
    const second = createEmptyModel('Second');
    first.profiles.dotted = {
      id: 'dotted', name: 'İ', conceptType: 'BusinessActor', specialization: true,
    };
    first.profiles.sigma = {
      id: 'sigma', name: 'Σ', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.i = {
      id: 'i', name: 'i', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.finalSigma = {
      id: 'finalSigma', name: 'ς', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.object = {
      id: 'object', name: 'i', conceptType: 'BusinessObject', specialization: true,
    };
    const dotted = addElement(second, {
      id: 'dotted-actor', type: 'BusinessActor', name: 'Dotted', profileIds: ['i'],
    });
    const sigma = addElement(second, {
      id: 'sigma-actor', type: 'BusinessActor', name: 'Sigma', profileIds: ['finalSigma'],
    });
    addElement(second, {
      id: 'object', type: 'BusinessObject', name: 'Object', profileIds: ['object'],
    });

    const dottedResult = search(second, {
      searchName: false,
      specializations: [{ name: 'İ', conceptType: 'BusinessActor' }],
    });
    const sigmaResult = search(second, {
      searchName: false,
      specializations: [{ name: 'Σ', conceptType: 'BusinessActor' }],
    });

    expect(dottedResult.matchedIds).toEqual(new Set([dotted.id]));
    expect(sigmaResult.matchedIds).toEqual(new Set([sigma.id]));
    expect(collectTreeSearchCatalog([first, second]).specializations).toHaveLength(3);
  });

  it('matches views through the typed OR group and controls unmatched folder visibility', () => {
    const model = createEmptyModel('Model');
    const view = addView(model, { id: 'view', name: 'Any view' });
    const hiddenFolder = folderFor(model, 'strategy');

    const normal = search(model, { searchName: false, includeViews: true });
    expect(normal.matchedIds).toEqual(new Set([view.id]));
    expect(normal.visibleIds.has(hiddenFolder.id)).toBe(false);

    const allFolders = search(model, {
      searchName: false, includeViews: true, showAllFolders: true,
    });
    expect(allFolders.visibleIds.has(hiddenFolder.id)).toBe(true);
  });

  it('compiles one Unicode matcher and reports invalid regular expressions without throwing', () => {
    const model = createEmptyModel('Model');
    const actor = addElement(model, { id: 'actor', type: 'BusinessActor', name: 'Ångström 😀' });
    const unicode = compileTreeSearch(criteria({ query: 'ångström 😀' }));
    expect(unicode.matcher).toBeInstanceOf(RegExp);
    expect(unicode.matcher?.flags).toContain('u');
    expect(searchModelTree(model, unicode).matchedIds).toEqual(new Set([actor.id]));

    const invalid = compileTreeSearch(criteria({ query: '[', useRegex: true }));
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toMatch(/regular expression/i);
    expect(searchModelTree(model, invalid).matchedIds.size).toBe(0);
  });

  it('resets filter selections and core field preferences while retaining query and search modifiers', () => {
    const reset = resetTreeSearchCriteria(criteria({
      query: 'keep me',
      searchName: false,
      searchDocumentation: true,
      searchPropertyValues: true,
      includeViews: true,
      showAllFolders: true,
      matchCase: true,
      useRegex: true,
      propertyKeys: ['Owner'],
      conceptTypes: ['BusinessActor'],
      specializations: [{ name: 'Person', conceptType: 'BusinessActor' }],
    }));

    expect(reset).toEqual({
      ...DEFAULT_TREE_SEARCH_CRITERIA,
      query: 'keep me',
      showAllFolders: true,
      matchCase: true,
      useRegex: true,
    });
  });

  it('aggregates dynamic catalogs and clears keys/profiles on change while retaining concept types', () => {
    const first = createEmptyModel('First');
    const second = createEmptyModel('Second');
    first.info.properties = [{ key: 'Owner', value: 'Alice' }];
    addView(second, { id: 'view', name: 'View', properties: [{ key: 'Status', value: 'Draft' }] });
    first.profiles.a = {
      id: 'a', name: 'External Party', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.b = {
      id: 'b', name: 'external party', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.c = {
      id: 'c', name: 'External Party', conceptType: 'BusinessObject', specialization: true,
    };
    first.profiles.d = {
      id: 'd', name: 'Zulu Element', conceptType: 'BusinessActor', specialization: true,
    };
    second.profiles.e = {
      id: 'e', name: 'Alpha Relation', conceptType: 'AssociationRelationship', specialization: true,
    };

    const catalog = collectTreeSearchCatalog([first, second]);
    expect(catalog.propertyKeys).toEqual(['Owner', 'Status']);
    expect(catalog.specializations).toEqual([
      { name: 'External Party', conceptType: 'BusinessActor' },
      { name: 'External Party', conceptType: 'BusinessObject' },
      { name: 'Zulu Element', conceptType: 'BusinessActor' },
      { name: 'Alpha Relation', conceptType: 'AssociationRelationship' },
    ]);

    const previous = collectTreeSearchCatalog([first]);
    const reconciled = reconcileTreeSearchCatalog(criteria({
      propertyKeys: ['Owner'],
      conceptTypes: ['BusinessActor'],
      specializations: [{ name: 'External Party', conceptType: 'BusinessActor' }],
    }), previous, catalog);
    expect(reconciled.propertyKeys).toEqual([]);
    expect(reconciled.specializations).toEqual([]);
    expect(reconciled.conceptTypes).toEqual(['BusinessActor']);
    expect(treeSearchProfileKey({ name: 'IDENTITY', conceptType: 'BusinessActor' }))
      .toBe('BusinessActor\u0000identity');
  });

  it('filters a 20,000-concept model within a responsive interaction budget', () => {
    const model = createEmptyModel('Large');
    const folder = folderFor(model, 'business');
    for (let index = 0; index < 20_000; index += 1) {
      const id = `element-${index}`;
      model.elements[id] = {
        id,
        kind: 'element',
        type: index % 2 === 0 ? 'BusinessActor' : 'BusinessObject',
        name: index === 19_999 ? 'Unique responsive needle' : `Element ${index}`,
        documentation: '',
        properties: [] as Property[],
        profileIds: [],
        folderId: folder.id,
      };
      folder.itemIds.push(id);
    }

    const started = performance.now();
    const result = search(model, { query: 'unique responsive needle' });
    const elapsed = performance.now() - started;

    expect(result.matchedIds).toEqual(new Set(['element-19999']));
    expect(elapsed).toBeLessThan(750);
  });
});

describe('model tree search layout', () => {
  it('keeps the controls compact, responsive, and keyboard-visible', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const menu = cssBlock(css, '.tree-search-menu');

    expect(cssBlock(css, '.tree-filter')).toMatch(/display:\s*grid;/);
    expect(cssBlock(css, '.tree-filter-input')).toMatch(/min-width:\s*0;/);
    expect(css).toMatch(/\.tree-search-menu\s*\{/);
    expect(css).toMatch(/@container\s*\(max-width:\s*220px\)/);
    expect(css).toMatch(/\.tree-search-menu[^}]*max-height:/s);
    expect(menu).toMatch(/box-sizing:\s*border-box;/);
    expect(menu).toMatch(/right:\s*-78px;/);
    expect(menu).not.toMatch(/right:\s*-94px;/);
    expect(css).toMatch(/\.tree-filter[^}]*:focus-visible/s);
  });
});
