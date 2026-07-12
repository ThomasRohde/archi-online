import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { createEmptyModel } = await server.ssrLoadModule('/src/model/ops/concepts.ts');
  const { createModelAsset } = await server.ssrLoadModule('/src/model/assets.ts');
  const { serializeArchimateDocument } = await server.ssrLoadModule('/src/model/io/archimate-document.ts');
  const { DUBLIN_CORE_FIELDS } = await server.ssrLoadModule('/src/model/types.ts');

  const model = createEmptyModel('Phase 1 Structural Parity');
  model.info.id = 'phase1-parity-model';
  model.info.language = 'en';
  model.info.metadata = DUBLIN_CORE_FIELDS.map((name) => ({ name, value: `Phase 1 ${name}` }));
  model.info.properties = [{ key: 'owner', value: 'Archi Online' }];

  const business = Object.values(model.folders).find((folder) => folder.folderType === 'business');
  const relations = Object.values(model.folders).find((folder) => folder.folderType === 'relations');
  const diagrams = Object.values(model.folders).find((folder) => folder.folderType === 'diagrams');
  business.labelExpression = '${type}: ${name}';

  const imagePath = 'images/_phase1parityasset00001.png';
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  model.assets[imagePath] = await createModelAsset(imagePath, png);
  model.profiles['profile-element'] = { id: 'profile-element', name: 'External Party', conceptType: 'BusinessActor', specialization: true, imagePath };
  model.profiles['profile-relation'] = { id: 'profile-relation', name: 'Trusted Access', conceptType: 'AccessRelationship', specialization: true, imagePath };

  model.elements.actor = { id: 'actor', kind: 'element', type: 'BusinessActor', name: 'Customer Representative', documentation: 'Actor documentation', properties: [{ key: 'team', value: 'Customer' }, { key: 'team', value: 'Service' }], profileIds: ['profile-element'], folderId: business.id };
  model.elements.role = { id: 'role', kind: 'element', type: 'BusinessRole', name: 'Service Owner', documentation: 'Role documentation', properties: [{ key: 'tier', value: '1' }], profileIds: [], folderId: business.id };
  business.itemIds.push('actor', 'role');
  model.relationships.access = { id: 'access', kind: 'relationship', type: 'AccessRelationship', name: 'Reads', documentation: 'Access docs', properties: [], profileIds: ['profile-relation'], folderId: relations.id, sourceId: 'actor', targetId: 'role', accessType: 1 };
  model.relationships.influence = { id: 'influence', kind: 'relationship', type: 'InfluenceRelationship', name: 'Influences', documentation: '', properties: [], profileIds: [], folderId: relations.id, sourceId: 'actor', targetId: 'role', strength: '++' };
  relations.itemIds.push('access', 'influence');

  model.views.reference = { id: 'reference', kind: 'view', name: 'Referenced View', documentation: '', properties: [], folderId: diagrams.id, childIds: [] };
  model.views.main = { id: 'main', kind: 'view', name: 'Phase 1 Golden View', documentation: 'All structural parity features', properties: [], folderId: diagrams.id, viewpoint: 'business_process_cooperation', childIds: [] };
  diagrams.itemIds.push('main', 'reference');

  const expressions = [
    '${name}\\n${documentation}\\n${type}\\n${specialization}\\n${property:team}',
    '${properties}\\n${propertiesvalues}\\n${properties: / :team}',
    '${if:${property:team}:Team:${name}}\\n${nvl:${property:missing}:Fallback}',
    '${wordwrap:12:${name}}\\n${viewpoint}',
    '$model{name}|$view{name}|$mfolder{name}|$vfolder{name}',
    '$parent{name}|$access:target{name}',
    'Escaped\\: colon and slash\\\\ ${name}',
  ];
  for (let position = 0; position < 10; position++) {
    const id = `position-${position}`;
    const row = Math.floor(position / 5);
    const column = position % 5;
    model.nodes[id] = {
      id, nodeType: 'element', elementId: position % 2 === 0 ? 'actor' : 'role', viewId: 'main', parentId: 'main',
      bounds: { x: 30 + column * 180, y: 30 + row * 120, width: 150, height: 85 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [],
      imagePath: position % 2 === 0 ? undefined : imagePath, imageSource: position % 2 === 0 ? 0 : 1, imagePosition: position,
      gradient: (position % 5) - 1, lineStyle: (position % 5) - 1, lineWidth: (position % 3) + 1,
      iconVisible: position % 3, iconColor: position % 2 ? '#cc3300' : '#003399', derivedLineColor: position % 2 === 0,
      fillColor: position % 2 ? '#b5ffff' : '#ffffb5', lineColor: '#334455', fontColor: '#112233', alpha: 220, lineAlpha: 190,
      fontStyle: { family: position % 2 ? 'Arial' : 'Segoe UI', sizePt: 9 + (position % 4), bold: position % 2 === 0, italic: position % 3 === 0 },
      labelExpression: expressions[position % expressions.length],
    };
    model.views.main.childIds.push(id);
  }
  model.nodes.group = { id: 'group', nodeType: 'group', name: 'Image Group', documentation: 'Group docs', properties: [], viewId: 'main', parentId: 'main', bounds: { x: 30, y: 290, width: 250, height: 130 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [], imagePath, imagePosition: 0, gradient: 0, lineStyle: 1, lineWidth: 2, labelExpression: '${name}' };
  model.nodes.note = { id: 'note', nodeType: 'note', content: 'Image Note', properties: [{ key: 'note', value: 'value' }], viewId: 'main', parentId: 'main', bounds: { x: 310, y: 290, width: 180, height: 100 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [], imagePath, imagePosition: 4, labelExpression: '${content} ${property:note}' };
  model.nodes.ref = { id: 'ref', nodeType: 'ref', refViewId: 'reference', viewId: 'main', parentId: 'main', bounds: { x: 520, y: 290, width: 180, height: 100 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [], imagePath, imagePosition: 8, labelExpression: '${name}' };
  model.nodes.image = { id: 'image', nodeType: 'image', imagePath, viewId: 'main', parentId: 'main', bounds: { x: 730, y: 290, width: 140, height: 100 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [], imagePosition: 9 };
  model.views.main.childIds.push('group', 'note', 'ref', 'image');

  model.connections['access-connection'] = { id: 'access-connection', viewId: 'main', connType: 'relationship', relationshipId: 'access', sourceId: 'position-0', targetId: 'position-1', bendpoints: [], lineColor: '#445566', lineWidth: 3, fontStyle: { family: 'Arial', sizePt: 10, bold: true, italic: false }, labelExpression: '$source{name} -> $target{name} ${accessType}' };
  model.connections['influence-connection'] = { id: 'influence-connection', viewId: 'main', connType: 'relationship', relationshipId: 'influence', sourceId: 'position-2', targetId: 'position-3', bendpoints: [{ startX: 30, startY: 20, endX: -30, endY: -20 }], lineWidth: 2, labelExpression: '${name} ${strength}' };
  model.nodes['position-0'].sourceConnectionIds.push('access-connection');
  model.nodes['position-1'].targetConnectionIds.push('access-connection');
  model.nodes['position-2'].sourceConnectionIds.push('influence-connection');
  model.nodes['position-3'].targetConnectionIds.push('influence-connection');

  const fixtureDir = join(root, 'tests', 'fixtures', 'phase1');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(join(fixtureDir, 'phase1-online.archimate'), await serializeArchimateDocument(model));
  await writeFile(join(fixtureDir, 'phase1-online.semantics.json'), JSON.stringify(semanticSummary(model), null, 2) + '\n');
  console.log(`Generated ${fixtureDir}`);
} finally {
  await server.close();
}

function semanticSummary(model) {
  const sort = (record, map) => Object.values(record).map(map).sort((left, right) => left.id.localeCompare(right.id));
  return {
    info: { id: model.info.id, name: model.info.name, language: model.info.language, metadata: model.info.metadata },
    profiles: sort(model.profiles, (profile) => ({ ...profile })),
    elements: sort(model.elements, (element) => ({ ...element })),
    relationships: sort(model.relationships, (relationship) => ({ ...relationship })),
    views: sort(model.views, (view) => ({ ...view })),
    nodes: sort(model.nodes, (node) => ({ ...node })),
    connections: sort(model.connections, (connection) => ({ ...connection })),
    assets: sort(model.assets, (asset) => ({ id: asset.path, mediaType: asset.mediaType, sha256: asset.sha256, byteLength: asset.bytes.length })),
  };
}
