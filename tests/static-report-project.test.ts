import { describe, expect, it } from 'vitest';
import {
  addElement,
  addElementNodeToView,
  addFolder,
  addRelationship,
  addView,
  createEmptyModel,
  defaultFolderId,
} from '../src/model/ops';
import { projectStaticReport } from '../src/model/report/project';
import { createModelStore } from '../src/model/store';

function reportFixture() {
  const store = createModelStore({ model: createEmptyModel('Stakeholder Model') });
  const model = store.getState().model!;
  model.info.documentation = 'Architecture purpose';
  model.info.properties = [
    { key: 'Owner', value: 'Enterprise Architecture' },
    { key: 'Status', value: 'Approved' },
  ];

  const businessFolderId = defaultFolderId(model, 'business');
  const viewsFolderId = defaultFolderId(model, 'diagrams');
  const nestedViewsFolderId = addFolder(viewsFolderId, 'Published', store);
  const actorId = addElement('BusinessActor', 'Duplicate', businessFolderId, store);
  const serviceId = addElement('BusinessService', 'Duplicate', businessFolderId, store);
  const relationshipId = addRelationship(
    'AssignmentRelationship',
    actorId,
    serviceId,
    'Delivers',
    undefined,
    store,
  )!;
  const firstViewId = addView('Overview', nestedViewsFolderId, store);
  const secondViewId = addView('Overview', viewsFolderId, store);

  addElementNodeToView(
    firstViewId,
    actorId,
    firstViewId,
    { x: 10, y: 10, width: 120, height: 55 },
    false,
    {},
    store,
  );
  addElementNodeToView(
    secondViewId,
    actorId,
    secondViewId,
    { x: 20, y: 20, width: 120, height: 55 },
    false,
    {},
    store,
  );

  const current = structuredClone(store.getState().model!);
  current.profiles['profile-customer'] = {
    id: 'profile-customer',
    name: 'Customer',
    conceptType: 'BusinessActor',
    specialization: true,
  };
  current.elements[actorId].profileIds = ['profile-customer'];
  current.elements[actorId].documentation = 'Primary stakeholder';
  current.elements[actorId].properties = [{ key: 'Owner', value: 'Architecture' }];
  current.relationships[relationshipId].documentation = 'Accountable delivery';
  current.views[firstViewId].viewpoint = 'layered';
  current.views[firstViewId].documentation = 'Published overview';

  return {
    model: current,
    ids: {
      actorId,
      serviceId,
      relationshipId,
      firstViewId,
      secondViewId,
      nestedViewsFolderId,
      viewsFolderId,
    },
  };
}

describe('static report projection', () => {
  it('projects an allowlisted model, tree, concept, view, and analysis contract', () => {
    const { model, ids } = reportFixture();
    const before = structuredClone(model);

    const report = projectStaticReport(model, '1.5.0');

    expect(report.schemaVersion).toBe(1);
    expect(report.productVersion).toBe('1.5.0');
    expect(report.model).toMatchObject({
      id: model.info.id,
      kind: 'model',
      name: 'Stakeholder Model',
      documentation: 'Architecture purpose',
      properties: model.info.properties,
      rootFolderIds: model.rootFolderIds,
      counts: {
        folders: Object.keys(model.folders).length,
        elements: 2,
        relationships: 1,
        views: 2,
      },
    });
    expect(report.elements.find(({ id }) => id === ids.actorId)).toMatchObject({
      kind: 'element',
      typeLabel: 'Business Actor',
      specialization: 'Customer',
      documentation: 'Primary stakeholder',
      properties: [{ key: 'Owner', value: 'Architecture' }],
    });
    expect(report.relationships).toEqual([
      expect.objectContaining({
        id: ids.relationshipId,
        kind: 'relationship',
        typeLabel: 'Assignment',
        sourceId: ids.actorId,
        targetId: ids.serviceId,
      }),
    ]);
    expect(report.views.find(({ id }) => id === ids.firstViewId)).toMatchObject({
      viewpoint: 'Layered',
      documentation: 'Published overview',
      svgPath: 'views/view-0001.svg',
    });
    expect(report.views.find(({ id }) => id === ids.secondViewId)?.svgPath)
      .toBe('views/view-0002.svg');
    expect(report.initialViewId).toBe(ids.firstViewId);
    expect(report.analysis[ids.actorId]).toEqual({
      relationshipIds: [ids.relationshipId],
      viewIds: [ids.firstViewId, ids.secondViewId]
        .sort((left, right) => left.localeCompare(right)),
    });
    expect(report.analysis[ids.relationshipId]).toEqual({
      relationshipIds: [],
      viewIds: [],
    });
    expect(model).toEqual(before);
  });

  it('preserves tree and property order while using name and id for catalog ties', () => {
    const { model, ids } = reportFixture();
    const report = projectStaticReport(model, 'test');
    const published = report.folders.find(({ id }) => id === ids.nestedViewsFolderId)!;
    const viewsRoot = report.folders.find(({ id }) => id === ids.viewsFolderId)!;

    expect(published.itemIds).toEqual([ids.firstViewId]);
    expect(viewsRoot.folderIds).toContain(ids.nestedViewsFolderId);
    expect(report.model.properties.map(({ key }) => key)).toEqual(['Owner', 'Status']);
    expect(report.elements.map(({ id }) => id)).toEqual(
      [ids.actorId, ids.serviceId].sort((left, right) => left.localeCompare(right, 'en')),
    );
    expect(report.views.map(({ id }) => id)).toEqual([ids.firstViewId, ids.secondViewId]);
  });

  it('handles a model without views and excludes diagram and asset internals', () => {
    const model = createEmptyModel('Empty');
    model.assets['images/private.png'] = {
      path: 'images/private.png',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
      renderMediaType: 'image/png',
      renderBytes: new Uint8Array([1, 2, 3]),
      sha256: 'secret-sentinel',
    };

    const report = projectStaticReport(model, 'test');
    const serialized = JSON.stringify(report);

    expect(report.initialViewId).toBeUndefined();
    expect(report.views).toEqual([]);
    expect(serialized).not.toContain('secret-sentinel');
    expect(serialized).not.toContain('sourceConnectionIds');
    expect(serialized).not.toContain('childIds');
    expect(serialized).not.toContain('assets');
    expect(serialized).not.toContain('nodes');
    expect(serialized).not.toContain('connections');
  });

  it('uses locale-independent code-point ordering for catalogs and orphaned views', () => {
    const store = createModelStore({ model: createEmptyModel('Ordering') });
    const model = store.getState().model!;
    const businessFolderId = defaultFolderId(model, 'business');
    const viewsFolderId = defaultFolderId(model, 'diagrams');
    const zuluId = addElement('BusinessActor', 'Zulu', businessFolderId, store);
    const accentedId = addElement('BusinessActor', 'Álpha', businessFolderId, store);
    const zuluViewId = addView('Zulu view', viewsFolderId, store);
    const accentedViewId = addView('Álpha view', viewsFolderId, store);
    const current = structuredClone(store.getState().model!);
    current.folders[viewsFolderId].itemIds = current.folders[viewsFolderId].itemIds
      .filter((id) => id !== zuluViewId && id !== accentedViewId);

    const report = projectStaticReport(current, 'test');

    expect(report.elements.map(({ id }) => id)).toEqual([zuluId, accentedId]);
    expect(report.views.map(({ id }) => id)).toEqual([zuluViewId, accentedViewId]);
  });
});
