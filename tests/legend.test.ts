import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LEGEND_OPTIONS,
  deriveLegendEntries,
  isLegendNote,
  legendOptimalSize,
  layoutLegendEntries,
  normalizeLegendOptions,
  parseLegendFeature,
  serializeLegendFeature,
  type LegendOptions,
} from '../src/model/legend';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import {
  addLegendToView,
  addNoteToView,
  addView,
  createElementOnView,
  createEmptyModel,
  createProfile,
  createRelationshipOnView,
  deleteViewObjects,
  setConceptProfiles,
  setLegendOptimalSize,
  setLegendOptions,
  setNodeStyle,
  setProperties,
  updateProfile,
} from '../src/model/ops';
import {
  createModelStore,
  redo,
  replaceModel,
  setActiveModelStore,
  undo,
} from '../src/model/store';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  isSettingAtDefault,
  normalizeSettings,
  persistSettings,
  type AppSettings,
} from '../src/settings/app-settings';
import { memoryKeyValueStore } from '../src/persistence/keyval';
import { useStore } from '../src/ui/store-hooks';

function model() {
  return useStore.getState().model!;
}

function legendPreferences(settings: AppSettings = DEFAULT_SETTINGS) {
  return {
    labels: settings.legendLabels,
    userColors: settings.legendUserColors,
  };
}

function fixture(options?: Partial<LegendOptions>) {
  const viewId = addView('Legend View');
  const legendId = addLegendToView(
    viewId,
    viewId,
    { x: 20, y: 20, width: 210, height: 320 },
    options,
  );
  if (!legendId) throw new Error('Legend fixture creation failed');
  return { viewId, legendId };
}

beforeEach(() => {
  setActiveModelStore(null);
  replaceModel(createEmptyModel('Legends'), null);
});

describe('native LegendOptions feature encoding', () => {
  it('uses the exact Desktop defaults and feature order', () => {
    expect(DEFAULT_LEGEND_OPTIONS).toEqual({
      displayElements: true,
      displayRelations: true,
      displaySpecializationElements: true,
      displaySpecializationRelations: true,
      rowsPerColumn: 15,
      widthOffset: 0,
      colorScheme: 1,
      sortMethod: 1,
    });
    expect(serializeLegendFeature(DEFAULT_LEGEND_OPTIONS)).toBe(
      'display=15,rows=15,offset=0,color=1,sort=1',
    );
  });

  it('encodes all four independent display bits and parses malformed fields as defaults', () => {
    const options = normalizeLegendOptions({
      displayElements: false,
      displayRelations: true,
      displaySpecializationElements: false,
      displaySpecializationRelations: true,
      rowsPerColumn: 9,
      widthOffset: -24,
      colorScheme: 2,
      sortMethod: 0,
    });
    expect(serializeLegendFeature(options)).toBe(
      'display=10,rows=9,offset=-24,color=2,sort=0',
    );
    expect(parseLegendFeature('display=10,rows=9,offset=-24,color=2,sort=0')).toEqual(options);
    expect(parseLegendFeature('bogus')).toEqual(DEFAULT_LEGEND_OPTIONS);
  });

  it('clamps rows, width, colors, and sort exactly like Desktop', () => {
    expect(normalizeLegendOptions({
      rowsPerColumn: -10,
      widthOffset: -999,
      colorScheme: -5 as LegendOptions['colorScheme'],
      sortMethod: -2 as LegendOptions['sortMethod'],
    })).toMatchObject({ rowsPerColumn: 1, widthOffset: -200, colorScheme: 0, sortMethod: 0 });
    expect(normalizeLegendOptions({
      rowsPerColumn: 999,
      widthOffset: 999,
      colorScheme: 9 as LegendOptions['colorScheme'],
      sortMethod: 9 as LegendOptions['sortMethod'],
    })).toMatchObject({ rowsPerColumn: 100, widthOffset: 200, colorScheme: 2, sortMethod: 1 });
  });

  it('uses defaults when native integer fields overflow Java int range', () => {
    expect(parseLegendFeature(
      'display=999999999999,rows=999999999999,offset=-999999999999,color=999999999999,sort=-999999999999',
    )).toEqual(DEFAULT_LEGEND_OPTIONS);
  });
});

describe('native legend model and XML', () => {
  it('creates an undoable Note with the native fallback name and typed options', () => {
    const { legendId } = fixture({ rowsPerColumn: 8, widthOffset: 12 });
    const note = model().nodes[legendId];
    expect(note).toMatchObject({
      nodeType: 'note',
      name: 'Legend',
      content: '',
      borderType: 1,
      bounds: { width: 210, height: 320 },
      legendOptions: { rowsPerColumn: 8, widthOffset: 12 },
    });
    expect(isLegendNote(note)).toBe(true);

    undo();
    expect(model().nodes[legendId]).toBeUndefined();
    redo();
    expect(isLegendNote(model().nodes[legendId])).toBe(true);
  });

  it('round-trips the exact native feature while preserving an older-Archi Note fallback', () => {
    const { legendId } = fixture({
      displayElements: false,
      rowsPerColumn: 23,
      widthOffset: -7,
      colorScheme: 2,
      sortMethod: 0,
    });
    const xml = serializeArchimate(model());
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const legend = doc.querySelector(`child[id="${legendId}"]`)!;
    expect(legend.getAttribute('xsi:type')).toBe('archimate:Note');
    expect(legend.getAttribute('name')).toBe('Legend');
    expect(legend.getAttribute('borderType')).toBe('1');
    expect(legend.querySelector('content')).toBeNull();
    expect(legend.querySelector('feature[name="legend"]')?.getAttribute('value')).toBe(
      'display=14,rows=23,offset=-7,color=2,sort=0',
    );

    const parsed = parseArchimate(xml);
    expect(parsed.nodes[legendId]).toMatchObject({
      nodeType: 'note',
      name: 'Legend',
      content: '',
      legendOptions: {
        displayElements: false,
        rowsPerColumn: 23,
        widthOffset: -7,
        colorScheme: 2,
        sortMethod: 0,
      },
    });
  });

  it('treats a malformed present legend feature as a legend with defaults', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Legend" id="model" version="5.0.0">
  <folder name="Views" id="views" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" name="View" id="view">
      <child xsi:type="archimate:Note" id="legend" name="Legend"><feature name="legend" value="bogus"/></child>
    </element>
  </folder>
</archimate:model>`;
    const parsed = parseArchimate(xml);
    expect(isLegendNote(parsed.nodes.legend)).toBe(true);
    expect(parsed.nodes.legend).toMatchObject({
      bounds: { x: 0, y: 0, width: 210, height: 320 },
      legendOptions: DEFAULT_LEGEND_OPTIONS,
    });
  });

  it('never conflates the current C4 legend property with the native legend feature', () => {
    const { viewId } = fixture();
    const c4NoteId = addNoteToView(
      viewId,
      viewId,
      { x: 10, y: 400, width: 220, height: 120 },
      'C4 legend text',
    );
    setProperties(c4NoteId, [{ key: 'c4.legend', value: 'true' }]);

    expect(isLegendNote(model().nodes[c4NoteId])).toBe(false);
    expect(serializeArchimate(model())).not.toMatch(
      new RegExp(`id="${c4NoteId}"[\\s\\S]*?feature name="legend"`),
    );
  });
});

describe('live legend entries and Desktop ordering', () => {
  it('updates live for recursively nested elements and relationship occurrences', () => {
    const { viewId, legendId } = fixture();
    const actor = createElementOnView(
      'BusinessActor', viewId, viewId, { x: 300, y: 20, width: 120, height: 100 }, 'Parent',
    );
    const role = createElementOnView(
      'BusinessRole', viewId, actor.nodeId, { x: 10, y: 30, width: 90, height: 50 }, 'Nested',
    );
    createRelationshipOnView('AssignmentRelationship', viewId, actor.nodeId, role.nodeId);

    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.type))
      .toEqual(['BusinessActor', 'BusinessRole', 'AssignmentRelationship']);

    deleteViewObjects([role.nodeId]);
    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.type))
      .toEqual(['BusinessActor']);
  });

  it('ignores orphan records that are not reachable from the view contents', () => {
    const { viewId, legendId } = fixture();
    createElementOnView(
      'BusinessActor', viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, 'Visible',
    );
    const orphan = createElementOnView(
      'ApplicationComponent', viewId, viewId, { x: 420, y: 20, width: 120, height: 55 }, 'Orphan',
    );
    const next = structuredClone(model());
    next.views[viewId].childIds = next.views[viewId].childIds.filter((id) => id !== orphan.nodeId);
    replaceModel(next, null);

    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.type))
      .toEqual(['BusinessActor']);
  });

  it('deduplicates core concepts by type and specializations by primary profile', () => {
    const { viewId, legendId } = fixture();
    const first = createElementOnView(
      'BusinessActor', viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, 'One',
    );
    createElementOnView(
      'BusinessActor', viewId, viewId, { x: 420, y: 20, width: 120, height: 55 }, 'Two',
    );
    const profileId = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    setConceptProfiles(first.elementId, [profileId]);
    const third = createElementOnView(
      'BusinessActor', viewId, viewId, { x: 580, y: 20, width: 120, height: 55 }, 'Three',
    );
    setConceptProfiles(third.elementId, [profileId]);

    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => [
      entry.profileId ?? entry.type,
      entry.label,
    ])).toEqual([
      ['BusinessActor', 'Business Actor'],
      [profileId, 'External party'],
    ]);

    updateProfile(profileId, { name: 'Customer' });
    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.label))
      .toEqual(['Business Actor', 'Customer']);
  });

  it('uses independent core/specialization element/relation scopes', () => {
    const { viewId, legendId } = fixture();
    const actor = createElementOnView(
      'BusinessActor', viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, 'Actor',
    );
    const role = createElementOnView(
      'BusinessRole', viewId, viewId, { x: 460, y: 20, width: 120, height: 55 }, 'Role',
    );
    const rel = createRelationshipOnView('AssignmentRelationship', viewId, actor.nodeId, role.nodeId)!;
    const elementProfile = createProfile({ name: 'Person', conceptType: 'BusinessActor' });
    const relProfile = createProfile({ name: 'Delegation', conceptType: 'AssignmentRelationship' });
    setConceptProfiles(actor.elementId, [elementProfile]);
    setConceptProfiles(rel.relationshipId, [relProfile]);

    setLegendOptions(legendId, {
      displayElements: false,
      displayRelations: false,
      displaySpecializationElements: true,
      displaySpecializationRelations: true,
    });
    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.label))
      .toEqual(['Person', 'Delegation']);

    setLegendOptions(legendId, {
      displaySpecializationElements: false,
      displaySpecializationRelations: false,
      displayElements: true,
      displayRelations: true,
    });
    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.label))
      .toEqual(['Business Role']);
  });

  it('uses custom core labels, profile icons, core/user/none colors, and Desktop fallbacks', () => {
    const { viewId, legendId } = fixture();
    const core = createElementOnView(
      'BusinessActor', viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, 'Actor',
    );
    const specialized = createElementOnView(
      'ApplicationComponent', viewId, viewId, { x: 460, y: 20, width: 120, height: 55 }, 'App',
    );
    const imagePath = 'images/profile.png';
    const bytes = new Uint8Array([1, 2, 3]);
    replaceModel({
      ...model(),
      assets: {
        ...model().assets,
        [imagePath]: {
          path: imagePath,
          mediaType: 'image/png',
          bytes,
          renderMediaType: 'image/png',
          renderBytes: bytes,
          sha256: 'profile',
        },
      },
    }, null);
    const profileId = createProfile({
      name: 'Web app',
      conceptType: 'ApplicationComponent',
      imagePath,
    });
    setConceptProfiles(specialized.elementId, [profileId]);
    const prefs = {
      labels: { BusinessActor: 'Person' },
      userColors: { BusinessActor: '#123456' },
    };

    expect(core.elementId).toBeTruthy();
    expect(deriveLegendEntries(model(), legendId, prefs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'BusinessActor', label: 'Person', color: '#ffffb5' }),
      expect.objectContaining({ profileId, label: 'Web app', iconPath: imagePath, color: '#b5ffff' }),
    ]));

    setLegendOptions(legendId, { colorScheme: 2 });
    expect(deriveLegendEntries(model(), legendId, prefs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'BusinessActor', color: '#123456' }),
      expect.objectContaining({ type: 'ApplicationComponent', color: '#b5ffff' }),
    ]));
    setLegendOptions(legendId, { colorScheme: 0 });
    expect(deriveLegendEntries(model(), legendId, prefs).every((entry) => entry.color === undefined))
      .toBe(true);
  });

  it('sorts by Desktop category buckets or element/relation name groups', () => {
    const { viewId, legendId } = fixture();
    const types = [
      'Location',
      'WorkPackage',
      'Goal',
      'Facility',
      'Node',
      'ApplicationComponent',
      'BusinessActor',
      'BusinessRole',
      'Capability',
    ] as const;
    const created = types.map((type, index) => createElementOnView(
      type,
      viewId,
      viewId,
      { x: 250 + index * 20, y: 20 + index * 20, width: 120, height: 55 },
      type,
    ));
    const actorIndex = types.indexOf('BusinessActor');
    const roleIndex = types.indexOf('BusinessRole');
    createRelationshipOnView(
      'AssignmentRelationship', viewId, created[actorIndex].nodeId, created[roleIndex].nodeId,
    );
    createRelationshipOnView(
      'AssociationRelationship', viewId, created[actorIndex].nodeId, created[roleIndex].nodeId,
    );

    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.label))
      .toEqual([
        'Capability',
        'Business Actor',
        'Business Role',
        'Application Component',
        'Node',
        'Facility',
        'Goal',
        'Work Package',
        'Location',
        'Assignment relation',
        'Association relation',
      ]);

    setLegendOptions(legendId, { sortMethod: 0 });
    expect(deriveLegendEntries(model(), legendId, legendPreferences()).map((entry) => entry.label))
      .toEqual([
        'Application Component',
        'Business Actor',
        'Business Role',
        'Capability',
        'Facility',
        'Goal',
        'Location',
        'Node',
        'Work Package',
        'Assignment relation',
        'Association relation',
      ]);
  });

  it('lays out columns, offset, and applies optimal size as one undoable action', () => {
    const { viewId, legendId } = fixture({ rowsPerColumn: 2, widthOffset: 10 });
    for (const type of ['Capability', 'BusinessActor', 'ApplicationComponent'] as const) {
      createElementOnView(type, viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, type);
    }
    const size = legendOptimalSize(model(), legendId, legendPreferences(), (label) => label.length * 5);
    expect(size.columns).toBe(2);
    expect(size.height).toBe(54);
    expect(size.width).toBeGreaterThan(80);

    const before = { ...model().nodes[legendId].bounds };
    setLegendOptimalSize(legendId, legendPreferences(), (label) => label.length * 5);
    expect(model().nodes[legendId].bounds).toEqual({ ...before, width: size.width, height: size.height });
    undo();
    expect(model().nodes[legendId].bounds).toEqual(before);
  });

  it('uses actual font height for row pitch while preserving Desktop margins', () => {
    const entries = [
      { key: 'one', kind: 'element', type: 'Capability', label: 'One', category: 0 },
      { key: 'two', kind: 'element', type: 'BusinessActor', label: 'Two', category: 1 },
    ] as const;
    const layout = layoutLegendEntries([...entries], { rowsPerColumn: 15 }, () => 20, 30);
    expect(layout.entries.map((entry) => entry.y)).toEqual([5, 35]);
    expect(layout.height).toBe(70);
    expect(layout.width).toBe(56);
  });

  it('uses the legend font metrics when applying optimal size', () => {
    const { viewId, legendId } = fixture();
    for (const type of ['BusinessActor', 'BusinessRole'] as const) {
      createElementOnView(type, viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, type);
    }
    setNodeStyle([legendId], {
      fontStyle: { family: 'Aptos', sizePt: 30, bold: false, italic: false },
    });

    setLegendOptimalSize(legendId, legendPreferences());

    expect(model().nodes[legendId].bounds.height).toBe(106);
  });

  it('applies Desktop optimal width without clamping extreme negative column offsets', () => {
    const { viewId, legendId } = fixture({ rowsPerColumn: 1, widthOffset: -200 });
    for (const type of ['BusinessActor', 'BusinessRole'] as const) {
      createElementOnView(type, viewId, viewId, { x: 260, y: 20, width: 120, height: 55 }, type);
    }
    const expected = legendOptimalSize(model(), legendId, legendPreferences(), () => 0);
    expect(expected.width).toBe(-133);

    setLegendOptimalSize(legendId, legendPreferences(), () => 0);

    expect(model().nodes[legendId].bounds.width).toBe(-133);
  });
});

describe('legend settings and store safety', () => {
  it('uses exact Desktop local defaults and persists custom labels/colors only in IndexedDB settings', async () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      legendRowsPerColumn: 15,
      legendColorScheme: 1,
      legendSortMethod: 1,
      legendLabels: {},
      legendUserColors: {},
    });
    const storage = memoryKeyValueStore();
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      legendLabels: { BusinessActor: 'Person' },
      legendUserColors: { BusinessActor: '#123456' },
    };
    await persistSettings(settings, storage);
    await expect(loadSettings(storage)).resolves.toEqual(settings);
    expect(storage.data.get(SETTINGS_STORAGE_KEY)).toEqual(settings);

    const { legendId } = fixture();
    const xml = serializeArchimate(model());
    expect(xml).not.toContain('Person');
    expect(xml).not.toContain('#123456');
    expect(model().nodes[legendId]).not.toHaveProperty('legendLabels');
  });

  it('does not report normalized empty legend preference maps as changed', () => {
    const normalized = normalizeSettings({});
    expect(isSettingAtDefault(normalized, 'legendLabels')).toBe(true);
    expect(isSettingAtDefault(normalized, 'legendUserColors')).toBe(true);
  });

  it('sanitizes invalid local legend maps and colors', async () => {
    const storage = memoryKeyValueStore([[
      SETTINGS_STORAGE_KEY,
      {
        legendRowsPerColumn: 500,
        legendColorScheme: 9,
        legendSortMethod: -1,
        legendLabels: { BusinessActor: '  Person  ', Unknown: 'No' },
        legendUserColors: { BusinessActor: '#12abEF', BusinessRole: 'red', Unknown: '#ffffff' },
      },
    ]]);
    await expect(loadSettings(storage)).resolves.toMatchObject({
      legendRowsPerColumn: 100,
      legendColorScheme: 1,
      legendSortMethod: 1,
      legendLabels: { BusinessActor: 'Person' },
      legendUserColors: { BusinessActor: '#12abef' },
    });
  });

  it('honors read-only and explicit-store isolation for create/options/optimal size', () => {
    const local = createModelStore({ model: createEmptyModel('Local'), readOnly: true });
    const global = createModelStore({ model: createEmptyModel('Global') });
    setActiveModelStore(global);
    const viewId = Object.values(local.getState().model!.views)[0]?.id ?? 'missing';
    expect(addLegendToView(
      viewId, viewId, { x: 0, y: 0, width: 210, height: 320 }, undefined, undefined, local,
    )).toBeNull();
    expect(Object.keys(local.getState().model!.nodes)).toHaveLength(0);
    expect(Object.keys(global.getState().model!.nodes)).toHaveLength(0);

    local.setState({ readOnly: false });
    const writableViewId = addView('Local View', undefined, local);
    const legendId = addLegendToView(
      writableViewId,
      writableViewId,
      { x: 0, y: 0, width: 210, height: 320 },
      undefined,
      undefined,
      local,
    )!;
    local.setState({ readOnly: true });
    setLegendOptions(legendId, { rowsPerColumn: 2 }, local);
    setLegendOptimalSize(legendId, legendPreferences(), undefined, local);
    expect((local.getState().model!.nodes[legendId] as { legendOptions?: LegendOptions })
      .legendOptions?.rowsPerColumn).toBe(15);
    expect(Object.keys(global.getState().model!.nodes)).toHaveLength(0);
  });
});
