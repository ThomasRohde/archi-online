import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { createServer } from 'vite';
import { canonicalizePhase2Model } from './phase2-semantics.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function buildPhase2OnlineFixtureModel() {
  const origin = 'online';
  const prefix = 'p2o';
  const id = (suffix) => `${prefix}-${suffix}`;
  const folderDefinitions = [
    ['strategy', 'Strategy'],
    ['business', 'Business'],
    ['application', 'Application'],
    ['technology', 'Technology & Physical'],
    ['motivation', 'Motivation'],
    ['implementation_migration', 'Implementation & Migration'],
    ['other', 'Other'],
    ['relations', 'Relations'],
    ['diagrams', 'Views'],
  ];
  const folders = Object.fromEntries(folderDefinitions.map(([folderType, name]) => {
    const folderId = id(`folder-${folderType}`);
    return [folderId, {
      id: folderId,
      kind: 'folder',
      name,
      folderType,
      documentation: folderType === 'business' ? 'Phase 2 folder documentation probe' : '',
      properties: folderType === 'business'
        ? [{ key: 'probe', value: `${origin}:folder` }, { key: '', value: 'blank-key' }]
        : [],
      parentId: null,
      folderIds: folderType === 'business' ? [id('folder-business-nested')] : [],
      itemIds: [],
    }];
  }));
  folders[id('folder-business-nested')] = {
    id: id('folder-business-nested'),
    kind: 'folder',
    name: 'Nested Modeling Probes',
    documentation: 'Searchable nested folder',
    properties: [{ key: 'probe', value: `${origin}:nested-folder` }],
    parentId: id('folder-business'),
    folderIds: [],
    itemIds: [id('element-actor'), id('element-role'), id('element-process')],
  };
  folders[id('folder-application')].itemIds = [
    id('element-arm-parent'),
    id('element-arm-child'),
  ];
  folders[id('folder-relations')].itemIds = [
    id('relationship-assignment'),
    id('relationship-arm-composition'),
    id('relationship-node-to-relationship'),
    id('relationship-relationship-to-node'),
    id('relationship-chain'),
  ];
  folders[id('folder-diagrams')].itemIds = [id('view-manual'), id('view-manhattan')];

  const elements = {
    [id('element-actor')]: {
      id: id('element-actor'), kind: 'element', type: 'BusinessActor',
      name: `${origin} Phase 2 Actor`, documentation: 'Search replace actor documentation',
      properties: [{ key: 'probe', value: `${origin}:element` }, { key: 'duplicate', value: 'one' }],
      profileIds: [], folderId: id('folder-business-nested'),
    },
    [id('element-role')]: {
      id: id('element-role'), kind: 'element', type: 'BusinessRole',
      name: `${origin} Phase 2 Role`, documentation: 'Magic Connector reuse target',
      properties: [{ key: 'probe', value: `${origin}:role` }, { key: 'duplicate', value: 'two' }],
      profileIds: [], folderId: id('folder-business-nested'),
    },
    [id('element-process')]: {
      id: id('element-process'), kind: 'element', type: 'BusinessProcess',
      name: `${origin} Phase 2 Process`, documentation: 'Nested ARM child and transform probe',
      properties: [{ key: 'probe', value: `${origin}:process` }],
      profileIds: [], folderId: id('folder-business-nested'),
    },
    [id('element-arm-parent')]: {
      id: id('element-arm-parent'), kind: 'element', type: 'ApplicationComponent',
      name: 'Online ARM Container', documentation: 'Online direct element nesting parent',
      properties: [
        { key: 'probe', value: `${origin}:arm-parent` },
        { key: 'origin-order', value: 'parent-first' },
      ],
      profileIds: [], folderId: id('folder-application'),
    },
    [id('element-arm-child')]: {
      id: id('element-arm-child'), kind: 'element', type: 'ApplicationComponent',
      name: 'Online ARM Nested Component', documentation: 'Online direct element nesting child',
      properties: [{ key: 'probe', value: `${origin}:arm-child` }],
      profileIds: [], folderId: id('folder-application'),
    },
  };

  const relationship = (suffix, sourceId, targetId, name) => ({
    id: id(`relationship-${suffix}`), kind: 'relationship', type: suffix === 'assignment' ? 'AssignmentRelationship' : 'AssociationRelationship',
    name, documentation: `Phase 2 ${name} documentation`,
    properties: [{ key: 'probe', value: `${origin}:relationship:${suffix}` }],
    profileIds: [], folderId: id('folder-relations'), sourceId, targetId,
  });
  const relationships = {
    [id('relationship-assignment')]: relationship(
      'assignment', id('element-actor'), id('element-role'), 'Assignment',
    ),
    [id('relationship-arm-composition')]: {
      id: id('relationship-arm-composition'), kind: 'relationship',
      type: 'CompositionRelationship', name: 'Online ARM Composition',
      documentation: 'Stored relationship hidden only while its occurrences are directly nested',
      properties: [{ key: 'probe', value: `${origin}:relationship:arm-composition` }],
      profileIds: [], folderId: id('folder-relations'),
      sourceId: id('element-arm-parent'), targetId: id('element-arm-child'),
    },
    [id('relationship-node-to-relationship')]: relationship(
      'node-to-relationship', id('element-process'), id('relationship-assignment'), 'Node to relationship',
    ),
    [id('relationship-relationship-to-node')]: relationship(
      'relationship-to-node', id('relationship-assignment'), id('element-process'), 'Relationship to node',
    ),
    [id('relationship-chain')]: relationship(
      'chain', id('relationship-relationship-to-node'), id('element-actor'), 'Recursive chain',
    ),
  };

  const connectable = (base) => ({ ...base, sourceConnectionIds: [], targetConnectionIds: [] });
  const bounds = (x, y, width = 150, height = 70) => ({ x, y, width, height });
  const nodes = {
    [id('node-group')]: connectable({
      id: id('node-group'), nodeType: 'group', name: `${origin} Probe Group`,
      documentation: 'Search replace group documentation', properties: [{ key: 'probe', value: `${origin}:group` }],
      viewId: id('view-manual'), parentId: id('view-manual'), bounds: bounds(20, 20, 520, 240),
      childIds: [id('node-actor'), id('node-process')], borderType: 1,
    }),
    [id('node-actor')]: connectable({
      id: id('node-actor'), nodeType: 'element', elementId: id('element-actor'),
      viewId: id('view-manual'), parentId: id('node-group'), bounds: bounds(25, 50), childIds: [],
    }),
    [id('node-process')]: connectable({
      id: id('node-process'), nodeType: 'element', elementId: id('element-process'),
      viewId: id('view-manual'), parentId: id('node-group'), bounds: bounds(300, 50), childIds: [],
    }),
    [id('node-role')]: connectable({
      id: id('node-role'), nodeType: 'element', elementId: id('element-role'),
      viewId: id('view-manual'), parentId: id('view-manual'), bounds: bounds(650, 75), childIds: [],
    }),
    [id('node-note')]: connectable({
      id: id('node-note'), nodeType: 'note', name: 'Phase 2 Note', content: `${origin} searchable note`,
      properties: [{ key: 'probe', value: `${origin}:note` }],
      viewId: id('view-manual'), parentId: id('view-manual'), bounds: bounds(650, 210, 190, 90), childIds: [],
    }),
    [id('node-legend')]: connectable({
      id: id('node-legend'), nodeType: 'note', name: 'Legend', content: '',
      properties: [{ key: 'probe', value: `${origin}:legend` }],
      legendOptions: {
        displayElements: true,
        displayRelations: true,
        displaySpecializationElements: false,
        displaySpecializationRelations: true,
        rowsPerColumn: 4,
        widthOffset: 12,
        colorScheme: 2,
        sortMethod: 0,
      },
      viewId: id('view-manual'), parentId: id('view-manual'), bounds: bounds(875, 20, 240, 300), childIds: [],
    }),
    [id('node-arm-parent')]: connectable({
      id: id('node-arm-parent'), nodeType: 'element', elementId: id('element-arm-parent'),
      viewId: id('view-manual'), parentId: id('view-manual'), bounds: bounds(20, 300, 400, 220),
      childIds: [id('node-arm-child')],
    }),
    [id('node-arm-child')]: connectable({
      id: id('node-arm-child'), nodeType: 'element', elementId: id('element-arm-child'),
      viewId: id('view-manual'), parentId: id('node-arm-parent'), bounds: bounds(35, 80), childIds: [],
    }),
    [id('node-manhattan-actor')]: connectable({
      id: id('node-manhattan-actor'), nodeType: 'element', elementId: id('element-actor'),
      viewId: id('view-manhattan'), parentId: id('view-manhattan'), bounds: bounds(80, 100), childIds: [],
    }),
    [id('node-manhattan-role')]: connectable({
      id: id('node-manhattan-role'), nodeType: 'element', elementId: id('element-role'),
      viewId: id('view-manhattan'), parentId: id('view-manhattan'), bounds: bounds(520, 280), childIds: [],
    }),
  };

  const connection = (suffix, fields) => connectable({
    id: id(`connection-${suffix}`),
    viewId: id('view-manual'),
    name: '',
    documentation: '',
    properties: [],
    nameVisible: true,
    bendpoints: [],
    ...fields,
  });
  const connections = {
    [id('connection-assignment')]: connection('assignment', {
      connType: 'relationship', relationshipId: id('relationship-assignment'),
      sourceId: id('node-actor'), targetId: id('node-role'),
      bendpoints: [{ startX: 30, startY: 20, endX: -20, endY: -15 }],
    }),
    [id('connection-arm-composition')]: connection('arm-composition', {
      connType: 'relationship', relationshipId: id('relationship-arm-composition'),
      sourceId: id('node-arm-parent'), targetId: id('node-arm-child'),
    }),
    [id('connection-node-to-relationship')]: connection('node-to-relationship', {
      connType: 'relationship', relationshipId: id('relationship-node-to-relationship'),
      sourceId: id('node-process'), targetId: id('connection-assignment'),
    }),
    [id('connection-relationship-to-node')]: connection('relationship-to-node', {
      connType: 'relationship', relationshipId: id('relationship-relationship-to-node'),
      sourceId: id('connection-assignment'), targetId: id('node-process'),
    }),
    [id('connection-chain')]: connection('chain', {
      connType: 'relationship', relationshipId: id('relationship-chain'),
      sourceId: id('connection-relationship-to-node'), targetId: id('node-actor'),
    }),
    [id('connection-plain-note')]: connection('plain-note', {
      connType: 'plain', sourceId: id('node-note'), targetId: id('connection-assignment'),
      name: `${origin} Plain Note Connection`, documentation: 'Phase 2 named documented plain connection',
      properties: [{ key: 'probe', value: `${origin}:plain-connection` }, { key: 'ordered', value: 'first' }],
      connectionType: 82, lineStyle: 3, lineWidth: 2, lineColor: '#445566', fontColor: '#112233',
      labelExpression: '${name} ${property:probe}', textPosition: 2,
      bendpoints: [{ startX: -10, startY: 15, endX: 20, endY: -25 }],
    }),
    [id('connection-plain-chain')]: connection('plain-chain', {
      connType: 'plain', sourceId: id('connection-plain-note'), targetId: id('node-role'),
      name: 'Plain recursive child', documentation: 'Phase 2 recursive plain dependency',
      properties: [{ key: 'probe', value: `${origin}:plain-chain` }], connectionType: 128,
    }),
    [id('connection-manhattan')]: connectable({
      id: id('connection-manhattan'), viewId: id('view-manhattan'), connType: 'relationship',
      relationshipId: id('relationship-assignment'), name: '', documentation: '', properties: [],
      sourceId: id('node-manhattan-actor'), targetId: id('node-manhattan-role'), nameVisible: true,
      bendpoints: [
        { startX: 120, startY: 40, endX: -280, endY: -140 },
        { startX: 260, startY: 160, endX: -140, endY: -20 },
      ], sourceConnectionIds: [], targetConnectionIds: [],
    }),
  };

  // Pin source and target adjacency independently of record insertion order.
  nodes[id('node-actor')].sourceConnectionIds = [id('connection-assignment')];
  nodes[id('node-actor')].targetConnectionIds = [id('connection-chain')];
  nodes[id('node-process')].sourceConnectionIds = [id('connection-node-to-relationship')];
  nodes[id('node-process')].targetConnectionIds = [id('connection-relationship-to-node')];
  nodes[id('node-role')].targetConnectionIds = [id('connection-assignment'), id('connection-plain-chain')];
  nodes[id('node-note')].sourceConnectionIds = [id('connection-plain-note')];
  nodes[id('node-arm-parent')].sourceConnectionIds = [id('connection-arm-composition')];
  nodes[id('node-arm-child')].targetConnectionIds = [id('connection-arm-composition')];
  connections[id('connection-assignment')].sourceConnectionIds = [id('connection-relationship-to-node')];
  connections[id('connection-assignment')].targetConnectionIds = [
    id('connection-node-to-relationship'),
    id('connection-plain-note'),
  ];
  connections[id('connection-relationship-to-node')].sourceConnectionIds = [id('connection-chain')];
  connections[id('connection-plain-note')].sourceConnectionIds = [id('connection-plain-chain')];
  nodes[id('node-manhattan-actor')].sourceConnectionIds = [id('connection-manhattan')];
  nodes[id('node-manhattan-role')].targetConnectionIds = [id('connection-manhattan')];

  const views = {
    [id('view-manual')]: {
      id: id('view-manual'), kind: 'view', name: `${origin} Phase 2 Manual`,
      documentation: 'Manual router, topology, annotation, legend, and productivity probes',
      properties: [{ key: 'probe', value: `${origin}:view:manual` }], folderId: id('folder-diagrams'),
      viewpoint: 'business_process_cooperation',
      childIds: [
        id('node-group'), id('node-role'), id('node-note'), id('node-legend'), id('node-arm-parent'),
      ],
      connectionRouterType: 0,
    },
    [id('view-manhattan')]: {
      id: id('view-manhattan'), kind: 'view', name: `${origin} Phase 2 Manhattan`,
      documentation: 'Manhattan routing with preserved dormant manual bendpoints',
      properties: [{ key: 'probe', value: `${origin}:view:manhattan` }], folderId: id('folder-diagrams'),
      childIds: [id('node-manhattan-actor'), id('node-manhattan-role')], connectionRouterType: 2,
    },
  };

  return {
    info: {
      id: id('model'), name: 'Online Phase 2 Daily Modeling Parity',
      documentation: 'Phase 2 model purpose and search replace probe',
      properties: [{ key: 'probe', value: `${origin}:model` }, { key: 'rename-me', value: 'manager-preview' }],
      metadata: [], language: 'en', version: '5.0.0',
    },
    profiles: {},
    assets: {},
    folders,
    rootFolderIds: folderDefinitions.map(([folderType]) => id(`folder-${folderType}`)),
    elements,
    relationships,
    views,
    nodes,
    connections,
  };
}

export async function generatePhase2Fixtures({
  outputDir = join(root, 'tests', 'fixtures', 'phase2'),
} = {}) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { serializeArchimateDocument } = await server.ssrLoadModule('/src/model/io/archimate-document.ts');
    const online = buildPhase2OnlineFixtureModel();
    const onlineSemantics = canonicalizePhase2Model(online);
    const onlineBytes = await serializeArchimateDocument(online);
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'phase2-online.archimate'), onlineBytes);
    await writeFile(
      join(outputDir, 'phase2-online.semantics.json'),
      `${JSON.stringify(onlineSemantics, null, 2)}\n`,
    );

    const onlineXml = new TextDecoder().decode(onlineBytes);
    const assignmentId = 'p2o-connection-assignment';
    const assignmentTag = new RegExp(`(<sourceConnection[^>]*id="${assignmentId}"[^>]*)(/?>)`);
    const missing = onlineXml.replace(assignmentTag, (tag) => tag.replace('target="p2o-node-role"', 'target="p2o-node-missing"'));
    const cycle = onlineXml.replace(assignmentTag, (tag) => tag.replace('source="p2o-node-actor"', 'source="p2o-connection-chain"'));
    if (missing === onlineXml || cycle === onlineXml) throw new Error('Could not construct malformed Phase 2 fixtures');
    await writeFile(join(outputDir, 'phase2-malformed-missing-endpoint.archimate'), missing);
    await writeFile(join(outputDir, 'phase2-malformed-endpoint-cycle.archimate'), cycle);
  } finally {
    await server.close();
  }
  return outputDir;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = option('--output-dir') ?? join(root, 'tests', 'fixtures', 'phase2');
  const generated = await generatePhase2Fixtures({ outputDir });
  console.log(`Generated deterministic Phase 2 fixtures in ${generated}`);
}
