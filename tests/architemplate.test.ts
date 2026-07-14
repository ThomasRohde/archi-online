import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import {
  createArchiTemplate,
  createModelFromArchiTemplate,
  parseArchiTemplate,
  remapModelIds,
} from '../src/model/io/architemplate';
import { serializeArchimateDocument } from '../src/model/io/archimate-xml';

const TEMPLATE_ID = 'id-11111111111111111111111111111111';
const PNG_1X1 = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240,
  31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
]);

function richModel(): ModelState {
  const store = createModelStore({ model: createEmptyModel('Reusable model') });
  const actor = addElement('BusinessActor', 'Customer', undefined, store);
  const role = addElement('BusinessRole', 'Buyer', undefined, store);
  const assignment = addRelationship(
    'AssignmentRelationship', actor, role, 'acts as', undefined, store,
  )!;
  const view = addView('Customer journey', undefined, store);
  const actorNode = addElementNodeToView(
    view, actor, view, { x: 20, y: 30, width: 140, height: 60 }, false,
    { fillColor: '#ffcc00' }, store,
  );
  const roleNode = addElementNodeToView(
    view, role, view, { x: 260, y: 30, width: 140, height: 60 }, false, {}, store,
  );
  const firstConnection = addConnectionToView(
    view, assignment, actorNode, roleNode, store,
  );
  const model = structuredClone(store.getState().model!);
  const relationFolder = Object.values(model.folders).find(
    (folder) => folder.folderType === 'relations',
  )!;
  const higherOrderId = 'id-22222222222222222222222222222222';
  const higherOrderConnectionId = 'id-33333333333333333333333333333333';
  model.relationships[higherOrderId] = {
    id: higherOrderId,
    kind: 'relationship',
    type: 'AssociationRelationship',
    name: 'qualifies',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: relationFolder.id,
    sourceId: assignment,
    targetId: role,
    directed: true,
  };
  relationFolder.itemIds.push(higherOrderId);
  model.connections[higherOrderConnectionId] = {
    id: higherOrderConnectionId,
    viewId: view,
    connType: 'relationship',
    relationshipId: higherOrderId,
    name: '',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: firstConnection,
    targetId: roleNode,
    bendpoints: [],
  };
  model.connections[firstConnection].sourceConnectionIds.push(higherOrderConnectionId);
  model.nodes[roleNode].targetConnectionIds.push(higherOrderConnectionId);
  const profileId = 'id-44444444444444444444444444444444';
  model.profiles[profileId] = {
    id: profileId,
    name: 'Customer icon',
    conceptType: 'BusinessActor',
    specialization: true,
    imagePath: 'images/customer.png',
  };
  model.elements[actor].profileIds = [profileId];
  model.assets['images/customer.png'] = {
    path: 'images/customer.png',
    mediaType: 'image/png',
    bytes: PNG_1X1,
    renderMediaType: 'image/png',
    renderBytes: PNG_1X1,
    sha256: 'not-used-when-writing',
  };
  return model;
}

function allIds(model: ModelState): string[] {
  return [
    model.info.id,
    ...Object.keys(model.profiles),
    ...Object.keys(model.folders),
    ...Object.keys(model.elements),
    ...Object.keys(model.relationships),
    ...Object.keys(model.views),
    ...Object.keys(model.nodes),
    ...Object.keys(model.connections),
  ];
}

function expectReferencesResolve(model: ModelState): void {
  for (const folder of Object.values(model.folders)) {
    expect(folder.parentId === null || model.folders[folder.parentId]).toBeTruthy();
    folder.folderIds.forEach((id) => expect(model.folders[id]).toBeDefined());
    folder.itemIds.forEach((id) => expect(
      model.elements[id] ?? model.relationships[id] ?? model.views[id],
    ).toBeDefined());
  }
  for (const relationship of Object.values(model.relationships)) {
    expect(model.elements[relationship.sourceId] ?? model.relationships[relationship.sourceId])
      .toBeDefined();
    expect(model.elements[relationship.targetId] ?? model.relationships[relationship.targetId])
      .toBeDefined();
  }
  for (const node of Object.values(model.nodes)) {
    expect(model.views[node.viewId]).toBeDefined();
    expect(model.views[node.parentId] ?? model.nodes[node.parentId]).toBeDefined();
  }
  for (const connection of Object.values(model.connections)) {
    expect(model.views[connection.viewId]).toBeDefined();
    expect(model.nodes[connection.sourceId] ?? model.connections[connection.sourceId]).toBeDefined();
    expect(model.nodes[connection.targetId] ?? model.connections[connection.targetId]).toBeDefined();
  }
}

describe('.architemplate codec', () => {
  it('writes the Desktop entries and manifest, then remaps all model IDs twice', async () => {
    const source = richModel();
    const bytes = await createArchiTemplate(source, {
      manifest: {
        name: 'Customer starter',
        description: 'A reusable customer model',
        keyThumbnail: 'Thumbnails/1.png',
      },
      metadata: { version: 1, id: TEMPLATE_ID, categories: ['Business', 'Starter'] },
      thumbnails: [PNG_1X1, PNG_1X1],
      timestamp: 1_720_000_000_000,
    });
    const archive = unzipSync(bytes);
    expect(Object.keys(archive).sort()).toEqual([
      'Thumbnails/1.png',
      'Thumbnails/2.png',
      'archi-online.json',
      'manifest.xml',
      'model.archimate',
    ]);
    expect(strFromU8(archive['manifest.xml'])).toContain(
      '<manifest type="model" timestamp="1720000000000">',
    );
    expect(strFromU8(archive['manifest.xml'])).toContain('<key-thumbnail>Thumbnails/1.png</key-thumbnail>');

    const parsed = await parseArchiTemplate(bytes);
    expect(parsed.manifest).toMatchObject({
      type: 'model',
      name: 'Customer starter',
      description: 'A reusable customer model',
      keyThumbnail: 'Thumbnails/1.png',
    });
    expect(parsed.metadata).toEqual({
      version: 1,
      id: TEMPLATE_ID,
      categories: ['Business', 'Starter'],
    });
    expect(parsed.thumbnails['Thumbnails/1.png']).toEqual(PNG_1X1);
    expect(parsed.thumbnails['Thumbnails/2.png']).toEqual(PNG_1X1);
    expect(parsed.model.info.name).toBe(source.info.name);
    expect(Object.values(parsed.model.profiles)[0]).toMatchObject({
      name: 'Customer icon', imagePath: 'images/customer.png',
    });
    expect(Object.values(parsed.model.assets)[0].bytes).toEqual(PNG_1X1);
    expect(Object.values(parsed.model.nodes).some((node) => node.fillColor === '#ffcc00')).toBe(true);
    expect(Object.values(parsed.model.connections).some(
      (connection) => Boolean(parsed.model.connections[connection.sourceId]),
    )).toBe(true);
    expect(allIds(parsed.model)).not.toEqual(allIds(source));
    expectReferencesResolve(parsed.model);

    const created = createModelFromArchiTemplate(parsed);
    expect(allIds(created)).not.toEqual(allIds(parsed.model));
    expect(new Set(allIds(created)).size).toBe(allIds(created).length);
    expect(allIds(created).every((id) => /^id-[0-9a-f]{32}$/.test(id))).toBe(true);
    expectReferencesResolve(created);
  });

  it('reads a Desktop-shaped template without Online metadata', async () => {
    const model = remapModelIds(createEmptyModel('Desktop template'));
    const modelBytes = await serializeArchimateDocument(model);
    const bytes = zipSync({
      'manifest.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<manifest type="model" timestamp="1720000000000">' +
        '<name>Desktop starter</name><description>Made in Archi</description>' +
        '</manifest>',
      ),
      'model.archimate': modelBytes,
    });
    const parsed = await parseArchiTemplate(bytes);
    expect(parsed.manifest.name).toBe('Desktop starter');
    expect(parsed.metadata.categories).toEqual([]);
    expect(parsed.metadata.id).toMatch(/^id-[0-9a-f]{32}$/);
  });

  it('rejects unsafe or malformed archives before model mutation or storage', async () => {
    const validModel = await serializeArchimateDocument(remapModelIds(createEmptyModel('Valid')));
    const manifest = strToU8('<manifest type="model"><name>Valid</name><description/></manifest>');
    await expect(parseArchiTemplate(zipSync({
      '../manifest.xml': manifest,
      'model.archimate': validModel,
    }))).rejects.toThrow(/unsafe/i);
    await expect(parseArchiTemplate(zipSync({
      'manifest.xml': manifest,
    }))).rejects.toThrow(/model\.archimate/i);
    await expect(parseArchiTemplate(zipSync({
      'manifest.xml': strToU8('<manifest type="canvas"><name>Wrong</name></manifest>'),
      'model.archimate': validModel,
    }))).rejects.toThrow(/type.*model/i);

    const crossTypedStore = createModelStore({ model: createEmptyModel('Cross typed') });
    const crossActor = addElement('BusinessActor', 'Actor', undefined, crossTypedStore);
    const crossRole = addElement('BusinessRole', 'Role', undefined, crossTypedStore);
    addRelationship(
      'AssignmentRelationship', crossActor, crossRole, '', undefined, crossTypedStore,
    );
    addView('Unrelated view', undefined, crossTypedStore);
    const crossTypedReference = remapModelIds(crossTypedStore.getState().model!);
    Object.values(crossTypedReference.relationships)[0].targetId =
      Object.keys(crossTypedReference.views)[0];
    await expect(parseArchiTemplate(zipSync({
      'manifest.xml': manifest,
      'model.archimate': await serializeArchimateDocument(crossTypedReference),
    }))).rejects.toThrow(/relationship target/i);

    const invalidModel = createEmptyModel('Invalid IDs');
    invalidModel.info.id = 'not-an-archi-id';
    await expect(parseArchiTemplate(zipSync({
      'manifest.xml': manifest,
      'model.archimate': await serializeArchimateDocument(invalidModel),
    }))).rejects.toThrow(/invalid model id/i);

    const tooMany: Record<string, Uint8Array> = {
      'manifest.xml': manifest,
      'model.archimate': validModel,
    };
    for (let index = 1; index <= 51; index++) tooMany[`Thumbnails/${index}.png`] = PNG_1X1;
    await expect(parseArchiTemplate(zipSync(tooMany))).rejects.toThrow(/50 thumbnails/i);

    const oversizedDimensions = PNG_1X1.slice();
    new DataView(oversizedDimensions.buffer).setUint32(16, 513, false);
    await expect(parseArchiTemplate(zipSync({
      'manifest.xml': manifest,
      'model.archimate': validModel,
      'Thumbnails/1.png': oversizedDimensions,
    }))).rejects.toThrow(/512.*512/i);
  });
});
