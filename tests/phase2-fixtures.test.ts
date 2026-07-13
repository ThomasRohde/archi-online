import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArchimateDocument, serializeArchimateDocument } from '../src/model/io/archimate-xml';
import { isLegendNote } from '../src/model/legend';
import {
  analyzeNestingChange,
  applyNestingChange,
  createNestedConnectionVisibilityResolver,
} from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import { DEFAULT_SETTINGS } from '../src/settings/app-settings';

const root = join(__dirname, '..');
const fixtureDir = join(__dirname, 'fixtures', 'phase2');
const fixturePath = (name: string) => join(fixtureDir, name);
const fixture = (name: string) => new Uint8Array(readFileSync(fixturePath(name)));
const jsonFixture = (name: string) => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as unknown;

interface Phase2SemanticsModule {
  canonicalizePhase2Model(model: ModelState): unknown;
  comparePhase2Semantics(expected: unknown, actual: unknown): string[];
}

interface ArchiInstallationModule {
  readConfiguredArchiEditorVersion(archiHome: string): Promise<string>;
}

interface Phase2ResourceLifecycleModule {
  settlePhase2Cleanup(actions: readonly (() => void | Promise<void>)[]): Promise<unknown[]>;
}

interface Phase2DesktopProvenanceModule {
  verifyFrozenDesktopSource(options: {
    sourcePath: string;
    goldenPath: string;
    candidatePath: string;
    saveWithDesktop(sourcePath: string, candidatePath: string): void | Promise<void>;
    verifySemantics(bytes: Uint8Array, label: string): void | Promise<void>;
  }): Promise<void>;
}

async function semantics(): Promise<Phase2SemanticsModule> {
  return import(pathToFileURL(join(root, 'tools', 'phase2-semantics.mjs')).href) as Promise<Phase2SemanticsModule>;
}

async function archiInstallation(): Promise<ArchiInstallationModule> {
  return import(pathToFileURL(join(root, 'tools', 'archi-installation.mjs')).href) as Promise<ArchiInstallationModule>;
}

async function resourceLifecycle(): Promise<Phase2ResourceLifecycleModule> {
  return import(pathToFileURL(join(root, 'tools', 'phase2-resource-lifecycle.mjs')).href) as Promise<Phase2ResourceLifecycleModule>;
}

async function desktopProvenance(): Promise<Phase2DesktopProvenanceModule> {
  return import(pathToFileURL(join(root, 'tools', 'phase2-desktop-provenance.mjs')).href) as Promise<Phase2DesktopProvenanceModule>;
}

describe('Phase 2 reciprocal Archi 5.9 fixtures', () => {
  it.each(['online', 'desktop'])('matches the independent %s source semantics and Online round-trip', async (origin) => {
    const { canonicalizePhase2Model, comparePhase2Semantics } = await semantics();
    const expected = jsonFixture(`phase2-${origin}.semantics.json`);
    const source = await parseArchimateDocument(fixture(`phase2-${origin}.archimate`));
    const reparsed = await parseArchimateDocument(await serializeArchimateDocument(source));

    expect(comparePhase2Semantics(expected, canonicalizePhase2Model(source))).toEqual([]);
    expect(comparePhase2Semantics(expected, canonicalizePhase2Model(reparsed))).toEqual([]);
  });

  it('matches the hand-authored Desktop-native source and frozen golden to the independent baseline', async () => {
    const { canonicalizePhase2Model, comparePhase2Semantics } = await semantics();
    const expected = jsonFixture('phase2-desktop.semantics.json');
    const authored = await parseArchimateDocument(fixture('source/phase2-desktop-authored.archimate'));
    const frozen = await parseArchimateDocument(fixture('phase2-desktop.archimate'));

    expect(comparePhase2Semantics(expected, canonicalizePhase2Model(authored))).toEqual([]);
    expect(comparePhase2Semantics(expected, canonicalizePhase2Model(frozen))).toEqual([]);
  });

  it.each(['online', 'desktop'])('pins exact Phase 2 structure, ordering, routers, legends, and property owners in %s', async (origin) => {
    const model = await parseArchimateDocument(fixture(`phase2-${origin}.archimate`));
    const prefix = origin === 'online' ? 'p2o' : 'p2d';
    const id = (suffix: string) => `${prefix}-${suffix}`;
    const desktop = origin === 'desktop';
    const prop = (key: string, value: string) => ({ key, value });

    expect(model.rootFolderIds).toEqual([
      'strategy', 'business', 'application', 'technology', 'motivation',
      'implementation_migration', 'other', 'relations', 'diagrams',
    ].map((suffix) => id(`folder-${suffix}`)));
    expect(model.folders[id('folder-business')]).toMatchObject({
      folderIds: [id('folder-business-nested')],
      itemIds: [],
    });
    expect(model.folders[id('folder-business-nested')].itemIds).toEqual([
      id(desktop ? 'element-process' : 'element-actor'),
      id('element-role'),
      id(desktop ? 'element-actor' : 'element-process'),
    ]);
    expect(model.folders[id('folder-application')].itemIds).toEqual((desktop
      ? ['element-arm-service', 'element-arm-platform']
      : ['element-arm-parent', 'element-arm-child'])
      .map(id));
    expect(model.folders[id('folder-relations')].itemIds).toEqual((desktop
      ? ['relationship-chain', 'relationship-arm-composition', 'relationship-assignment', 'relationship-relationship-to-node', 'relationship-node-to-relationship']
      : ['relationship-assignment', 'relationship-arm-composition', 'relationship-node-to-relationship', 'relationship-relationship-to-node', 'relationship-chain'])
      .map(id));
    expect(model.folders[id('folder-diagrams')].itemIds).toEqual((desktop
      ? ['view-manhattan', 'view-manual']
      : ['view-manual', 'view-manhattan'])
      .map(id));

    expect(model.views[id('view-manual')].childIds).toEqual((desktop
      ? ['node-note', 'node-arm-platform', 'node-group', 'node-legend', 'node-role']
      : ['node-group', 'node-role', 'node-note', 'node-legend', 'node-arm-parent'])
      .map(id));
    expect(model.nodes[id('node-group')]).toMatchObject({
      childIds: (desktop ? ['node-process', 'node-actor'] : ['node-actor', 'node-process']).map(id),
      bounds: desktop
        ? { x: 40, y: 30, width: 560, height: 280 }
        : { x: 20, y: 20, width: 520, height: 240 },
    });

    expect(Object.fromEntries([
      'assignment', 'node-to-relationship', 'relationship-to-node', 'chain',
    ].map((suffix) => {
      const relationship = model.relationships[id(`relationship-${suffix}`)];
      return [suffix, [relationship.sourceId, relationship.targetId]];
    }))).toEqual(desktop ? {
      assignment: [id('element-actor'), id('element-role')],
      'node-to-relationship': [id('element-process'), id('relationship-assignment')],
      'relationship-to-node': [id('relationship-assignment'), id('element-process')],
      chain: [id('relationship-node-to-relationship'), id('element-role')],
    } : {
      assignment: [id('element-actor'), id('element-role')],
      'node-to-relationship': [id('element-process'), id('relationship-assignment')],
      'relationship-to-node': [id('relationship-assignment'), id('element-process')],
      chain: [id('relationship-relationship-to-node'), id('element-actor')],
    });

    expect(Object.fromEntries([
      'assignment', 'node-to-relationship', 'relationship-to-node', 'chain', 'plain-note', 'plain-chain',
    ].map((suffix) => {
      const connection = model.connections[id(`connection-${suffix}`)];
      return [suffix, {
        endpoints: [connection.sourceId, connection.targetId],
        sourceOrder: connection.sourceConnectionIds,
        targetOrder: connection.targetConnectionIds,
      }];
    }))).toEqual(desktop ? {
      assignment: {
        endpoints: [id('node-actor'), id('node-role')],
        sourceOrder: [id('connection-relationship-to-node')],
        targetOrder: [id('connection-node-to-relationship'), id('connection-plain-note')],
      },
      'node-to-relationship': {
        endpoints: [id('node-process'), id('connection-assignment')],
        sourceOrder: [id('connection-chain')], targetOrder: [],
      },
      'relationship-to-node': {
        endpoints: [id('connection-assignment'), id('node-process')], sourceOrder: [], targetOrder: [],
      },
      chain: {
        endpoints: [id('connection-node-to-relationship'), id('node-role')], sourceOrder: [], targetOrder: [],
      },
      'plain-note': {
        endpoints: [id('node-note'), id('connection-assignment')],
        sourceOrder: [id('connection-plain-chain')], targetOrder: [],
      },
      'plain-chain': {
        endpoints: [id('connection-plain-note'), id('node-actor')], sourceOrder: [], targetOrder: [],
      },
    } : {
      assignment: {
        endpoints: [id('node-actor'), id('node-role')],
        sourceOrder: [id('connection-relationship-to-node')],
        targetOrder: [id('connection-node-to-relationship'), id('connection-plain-note')],
      },
      'node-to-relationship': {
        endpoints: [id('node-process'), id('connection-assignment')], sourceOrder: [], targetOrder: [],
      },
      'relationship-to-node': {
        endpoints: [id('connection-assignment'), id('node-process')],
        sourceOrder: [id('connection-chain')], targetOrder: [],
      },
      chain: {
        endpoints: [id('connection-relationship-to-node'), id('node-actor')], sourceOrder: [], targetOrder: [],
      },
      'plain-note': {
        endpoints: [id('node-note'), id('connection-assignment')],
        sourceOrder: [id('connection-plain-chain')], targetOrder: [],
      },
      'plain-chain': {
        endpoints: [id('connection-plain-note'), id('node-role')], sourceOrder: [], targetOrder: [],
      },
    });

    expect(model.nodes[id('node-actor')]).toMatchObject(desktop ? {
      sourceConnectionIds: [id('connection-assignment')],
      targetConnectionIds: [id('connection-plain-chain')],
    } : {
      sourceConnectionIds: [id('connection-assignment')],
      targetConnectionIds: [id('connection-chain')],
    });
    expect(model.nodes[id('node-process')]).toMatchObject({
      sourceConnectionIds: [id('connection-node-to-relationship')],
      targetConnectionIds: [id('connection-relationship-to-node')],
    });
    expect(model.nodes[id('node-role')]).toMatchObject({
      sourceConnectionIds: [],
      targetConnectionIds: desktop
        ? [id('connection-assignment'), id('connection-chain')]
        : [id('connection-assignment'), id('connection-plain-chain')],
    });

    expect(model.views[id('view-manual')].connectionRouterType ?? 0).toBe(0);
    expect(model.views[id('view-manhattan')].connectionRouterType).toBe(2);
    expect(model.connections[id('connection-manhattan')].bendpoints).toEqual(desktop ? [
      { startX: 95, startY: 55, endX: -310, endY: -155 },
      { startX: 285, startY: 175, endX: -120, endY: -35 },
    ] : [
      { startX: 120, startY: 40, endX: -280, endY: -140 },
      { startX: 260, startY: 160, endX: -140, endY: -20 },
    ]);
    expect(model.connections[id('connection-assignment')].bendpoints).toEqual(desktop ? [
      { startX: 45, startY: -10, endX: -35, endY: 25 },
      { startX: 180, startY: 35, endX: -170, endY: -15 },
    ] : [{ startX: 30, startY: 20, endX: -20, endY: -15 }]);

    const legend = model.nodes[id('node-legend')];
    expect(isLegendNote(legend)).toBe(true);
    expect(isLegendNote(legend) ? legend.legendOptions : undefined).toEqual(desktop ? {
      displayElements: true,
      displayRelations: true,
      displaySpecializationElements: true,
      displaySpecializationRelations: false,
      rowsPerColumn: 6,
      widthOffset: 18,
      colorScheme: 1,
      sortMethod: 1,
    } : {
      displayElements: true,
      displayRelations: true,
      displaySpecializationElements: false,
      displaySpecializationRelations: true,
      rowsPerColumn: 4,
      widthOffset: 12,
      colorScheme: 2,
      sortMethod: 0,
    });

    const originValue = desktop ? 'desktop' : 'online';
    const group = model.nodes[id('node-group')];
    const note = model.nodes[id('node-note')];
    expect([
      model.info.properties,
      model.folders[id('folder-business')].properties,
      model.elements[id('element-actor')].properties,
      model.relationships[id('relationship-assignment')].properties,
      model.views[id('view-manual')].properties,
      group.nodeType === 'group' ? group.properties : [],
      note.nodeType === 'note' ? note.properties : [],
      model.connections[id('connection-plain-note')].connType === 'plain'
        ? model.connections[id('connection-plain-note')].properties : [],
    ]).toEqual(desktop ? [
      [prop('rename-me', 'manager-preview'), prop('probe', 'desktop:model')],
      [prop('', 'blank-key'), prop('probe', 'desktop:folder')],
      [prop('duplicate', 'one'), prop('probe', 'desktop:element')],
      [prop('probe', 'desktop:relationship:assignment')],
      [prop('probe', 'desktop:view:manual')],
      [prop('probe', 'desktop:group')],
      [prop('probe', 'desktop:note')],
      [prop('ordered', 'first'), prop('probe', 'desktop:plain-connection')],
    ] : [
      [prop('probe', `${originValue}:model`), prop('rename-me', 'manager-preview')],
      [prop('probe', `${originValue}:folder`), prop('', 'blank-key')],
      [prop('probe', `${originValue}:element`), prop('duplicate', 'one')],
      [prop('probe', `${originValue}:relationship:assignment`)],
      [prop('probe', `${originValue}:view:manual`)],
      [prop('probe', `${originValue}:group`)],
      [prop('probe', `${originValue}:note`)],
      [prop('probe', `${originValue}:plain-connection`), prop('ordered', 'first')],
    ]);
  });

  it.each(['online', 'desktop'])('pins an ARM element nesting relationship and derived hide/reveal behavior in %s', async (origin) => {
    const model = await parseArchimateDocument(fixture(`phase2-${origin}.archimate`));
    const desktop = origin === 'desktop';
    const ids = desktop ? {
      view: 'p2d-view-manual',
      parentElement: 'p2d-element-arm-platform',
      childElement: 'p2d-element-arm-service',
      relationship: 'p2d-relationship-arm-composition',
      parentNode: 'p2d-node-arm-platform',
      childNode: 'p2d-node-arm-service',
      connection: 'p2d-connection-arm-composition',
    } : {
      view: 'p2o-view-manual',
      parentElement: 'p2o-element-arm-parent',
      childElement: 'p2o-element-arm-child',
      relationship: 'p2o-relationship-arm-composition',
      parentNode: 'p2o-node-arm-parent',
      childNode: 'p2o-node-arm-child',
      connection: 'p2o-connection-arm-composition',
    };

    expect(model.elements[ids.parentElement]).toMatchObject({ type: 'ApplicationComponent' });
    expect(model.elements[ids.childElement]).toMatchObject({ type: 'ApplicationComponent' });
    expect(model.nodes[ids.parentNode]).toMatchObject({
      nodeType: 'element',
      elementId: ids.parentElement,
      parentId: ids.view,
      childIds: [ids.childNode],
    });
    expect(model.nodes[ids.childNode]).toMatchObject({
      nodeType: 'element',
      elementId: ids.childElement,
      parentId: ids.parentNode,
      childIds: [],
    });
    expect(model.relationships[ids.relationship]).toMatchObject({
      type: 'CompositionRelationship',
      sourceId: ids.parentElement,
      targetId: ids.childElement,
    });
    expect(model.connections[ids.connection]).toMatchObject({
      viewId: ids.view,
      connType: 'relationship',
      relationshipId: ids.relationship,
      sourceId: ids.parentNode,
      targetId: ids.childNode,
    });
    expect(model.nodes[ids.parentNode].sourceConnectionIds).toContain(ids.connection);
    expect(model.nodes[ids.childNode].targetConnectionIds).toContain(ids.connection);

    const nestedVisibility = createNestedConnectionVisibilityResolver(model, DEFAULT_SETTINGS);
    expect(nestedVisibility(ids.connection)).toBe(false);

    const store = createModelStore({ model });
    const unnestPlan = analyzeNestingChange(model, {
      viewId: ids.view,
      trigger: 'move',
      entries: [{
        kind: 'move',
        nodeId: ids.childNode,
        parentId: ids.view,
        bounds: desktop
          ? { x: 1120, y: 520, width: 155, height: 65 }
          : { x: 470, y: 410, width: 150, height: 70 },
      }],
    }, DEFAULT_SETTINGS);
    expect(unnestPlan.visibilityChanges).toContainEqual({
      connectionId: ids.connection,
      before: false,
      after: true,
    });

    applyNestingChange(unnestPlan, {}, store);
    const unnested = store.getState().model!;
    expect(unnested.nodes[ids.childNode].parentId).toBe(ids.view);
    expect(unnested.nodes[ids.parentNode].childIds).not.toContain(ids.childNode);
    expect(unnested.connections[ids.connection]).toBeDefined();
    expect(createNestedConnectionVisibilityResolver(unnested, DEFAULT_SETTINGS)(ids.connection))
      .toBe(true);
  });

  it.each([
    ['phase2-malformed-missing-endpoint.archimate', /endpoint missing/i],
    ['phase2-malformed-endpoint-cycle.archimate', /endpoint cycle/i],
  ])('rejects %s atomically', async (name, message) => {
    await expect(parseArchimateDocument(fixture(name))).rejects.toThrow(message);
  });

  it('generates Online candidates in a temporary directory without touching any Desktop artifact', () => {
    const onlineOutputs = [
      'phase2-online.archimate',
      'phase2-online.semantics.json',
      'phase2-malformed-missing-endpoint.archimate',
      'phase2-malformed-endpoint-cycle.archimate',
    ];
    const desktopArtifacts = [
      'source/phase2-desktop-authored.archimate',
      'phase2-desktop.archimate',
      'phase2-desktop.semantics.json',
    ];
    const digest = (names: string[]) => names.map((name) =>
      createHash('sha256').update(readFileSync(fixturePath(name))).digest('hex'));
    const desktopBefore = digest(desktopArtifacts);
    const generator = readFileSync(join(root, 'tools', 'generate-phase2-fixtures.mjs'), 'utf8');
    expect(generator).not.toMatch(/desktop|--desktop-seed|--desktop-semantics/i);
    const captureIndex = generator.indexOf('const onlineSemantics = canonicalizePhase2Model(online);');
    const serializeIndex = generator.indexOf('await serializeArchimateDocument(online)');
    expect(captureIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeLessThan(serializeIndex);
    expect(generator).toContain('JSON.stringify(onlineSemantics, null, 2)');

    const temporaryOutput = mkdtempSync(join(tmpdir(), 'archi-online-phase2-generation-'));
    try {
      execFileSync(process.execPath, [
        join(root, 'tools', 'generate-phase2-fixtures.mjs'),
        '--output-dir', temporaryOutput,
      ], { cwd: root, stdio: 'pipe' });
      for (const name of onlineOutputs) {
        expect(readFileSync(join(temporaryOutput, name))).toEqual(readFileSync(fixturePath(name)));
      }
      expect(existsSync(join(temporaryOutput, 'phase2-desktop.archimate'))).toBe(false);
      expect(existsSync(join(temporaryOutput, 'phase2-desktop.semantics.json'))).toBe(false);
      expect(readFileSync(fixturePath('source/phase2-desktop-authored.archimate')))
        .not.toEqual(readFileSync(fixturePath('phase2-desktop.archimate')));
      const prospectiveBlob = (path: string) => execFileSync('git', [
        'hash-object', `--path=${path}`, path,
      ], { cwd: root, encoding: 'utf8' }).trim();
      expect(prospectiveBlob('tests/fixtures/phase2/source/phase2-desktop-authored.archimate'))
        .not.toBe(prospectiveBlob('tests/fixtures/phase2/phase2-desktop.archimate'));
      expect(digest(desktopArtifacts)).toEqual(desktopBefore);
    } finally {
      rmSync(temporaryOutput, { recursive: true, force: true });
    }
  }, 30_000);

  it('reads the single configured Archi editor bundle version from product metadata', async () => {
    const home = mkdtempSync(join(tmpdir(), 'archi-online-archi-home-'));
    try {
      const configuration = join(home, 'configuration', 'org.eclipse.equinox.simpleconfigurator');
      mkdirSync(configuration, { recursive: true });
      writeFileSync(join(configuration, 'bundles.info'), [
        '#encoding=UTF-8',
        '#version=1',
        'com.archimatetool.commandline,5.9.0.example,plugins/commandline.jar,4,false',
        'com.archimatetool.editor,5.9.0.202604140726,plugins/editor/,4,false',
        '',
      ].join('\n'));
      const { readConfiguredArchiEditorVersion } = await archiInstallation();
      await expect(readConfiguredArchiEditorVersion(home)).resolves.toBe('5.9.0.202604140726');
      writeFileSync(join(configuration, 'bundles.info'), [
        'com.archimatetool.editor,5.9.0.one,plugins/editor-one/,4,false',
        'com.archimatetool.editor,5.9.0.two,plugins/editor-two/,4,false',
      ].join('\n'));
      await expect(readConfiguredArchiEditorVersion(home)).rejects.toThrow('exactly one configured');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('settles every independent verifier cleanup even when an earlier cleanup fails', async () => {
    const { settlePhase2Cleanup } = await resourceLifecycle();
    const settled: string[] = [];
    const errors = await settlePhase2Cleanup([
      () => {
        settled.push('server');
        throw new Error('server close failed');
      },
      () => {
        settled.push('dom');
      },
      async () => {
        settled.push('temporary directory');
        throw new Error('temporary cleanup failed');
      },
    ]);
    expect(settled).toEqual(['server', 'dom', 'temporary directory']);
    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error instanceof Error ? error.message : String(error)))
      .toEqual(['server close failed', 'temporary cleanup failed']);
  });

  it('fails when Desktop output from the authored source drifts from the frozen golden', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'archi-online-desktop-provenance-'));
    try {
      const sourcePath = join(temporaryRoot, 'authored-source.archimate');
      const goldenPath = join(temporaryRoot, 'frozen-golden.archimate');
      const candidatePath = join(temporaryRoot, 'desktop-candidate.archimate');
      writeFileSync(sourcePath, 'authored source');
      writeFileSync(goldenPath, 'frozen Desktop output');
      const consumed: string[] = [];
      const { verifyFrozenDesktopSource } = await desktopProvenance();
      await expect(verifyFrozenDesktopSource({
        sourcePath,
        goldenPath,
        candidatePath,
        saveWithDesktop(input, output) {
          consumed.push(input);
          writeFileSync(output, 'drifted Desktop output');
        },
        verifySemantics(_bytes, label) {
          consumed.push(label);
        },
      })).rejects.toThrow('differs from the frozen Desktop golden');
      expect(consumed).toEqual([sourcePath]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
