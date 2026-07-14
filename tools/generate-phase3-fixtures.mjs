import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const thumbnail = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240,
  31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
]);

function deterministicIds(namespace) {
  let counter = 0;
  return () => `id-${namespace}${(++counter).toString(16).padStart(32 - namespace.length, '0')}`;
}

function modelSummary(model) {
  return {
    name: model.info.name,
    profiles: Object.keys(model.profiles).length,
    folders: Object.keys(model.folders).length,
    elements: Object.keys(model.elements).length,
    relationships: Object.keys(model.relationships).length,
    views: Object.keys(model.views).length,
    nodes: Object.keys(model.nodes).length,
    connections: Object.keys(model.connections).length,
    elementNames: Object.values(model.elements).map((item) => item.name).sort(),
    relationshipNames: Object.values(model.relationships).map((item) => item.name).sort(),
    viewNames: Object.values(model.views).map((item) => item.name).sort(),
  };
}

export async function generatePhase3Fixtures({
  outputDir = join(root, 'tests', 'fixtures', 'phase3'),
} = {}) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const operations = await server.ssrLoadModule('/src/model/ops.ts');
    const { createModelStore } = await server.ssrLoadModule('/src/model/store.ts');
    const { buildAnalysisGraph } = await server.ssrLoadModule('/src/model/analysis-graph.ts');
    const { validateModel } = await server.ssrLoadModule('/src/model/validation.ts');
    const { createModelMergePlan } = await server.ssrLoadModule('/src/model/model-merge.ts');
    const { serializeArchimateDocument } = await server.ssrLoadModule('/src/model/io/archimate-document.ts');
    const { createArchiTemplate, remapModelIds } =
      await server.ssrLoadModule('/src/model/io/architemplate.ts');

    const store = createModelStore({ model: operations.createEmptyModel('Phase 3 Analysis and Reuse') });
    const actor = operations.addElement('BusinessActor', 'Customer', undefined, store);
    const role = operations.addElement('BusinessRole', 'Buyer', undefined, store);
    const process = operations.addElement('BusinessProcess', 'Place order', undefined, store);
    const assignment = operations.addRelationship(
      'AssignmentRelationship', actor, role, 'Customer acts as buyer', undefined, store,
    );
    const triggering = operations.addRelationship(
      'TriggeringRelationship', role, process, 'Buyer starts order', undefined, store,
    );
    const higherOrder = operations.addRelationship(
      'AssociationRelationship', assignment, process, 'Assignment context', undefined, store,
    );
    if (!assignment || !triggering || !higherOrder) {
      throw new Error('Could not construct the Phase 3 relationship topology');
    }
    const profile = operations.createProfile({
      name: 'External customer',
      conceptType: 'BusinessActor',
      specialization: true,
    }, store);
    const profiled = globalThis.structuredClone(store.getState().model);
    profiled.elements[actor].profileIds = [profile];
    store.setState({ model: profiled });

    const view = operations.addView('Customer ordering', undefined, store);
    const actorNode = operations.addElementNodeToView(
      view, actor, view, { x: 30, y: 40, width: 150, height: 60 }, false,
      { fillColor: '#f4c95d' }, store,
    );
    const roleNode = operations.addElementNodeToView(
      view, role, view, { x: 260, y: 40, width: 150, height: 60 }, false, {}, store,
    );
    const processNode = operations.addElementNodeToView(
      view, process, view, { x: 500, y: 40, width: 150, height: 60 }, false, {}, store,
    );
    const assignmentConnection = operations.addConnectionToView(
      view, assignment, actorNode, roleNode, store,
    );
    operations.addConnectionToView(view, triggering, roleNode, processNode, store);
    operations.addConnectionToView(view, higherOrder, assignmentConnection, processNode, store);

    const model = remapModelIds(store.getState().model, deterministicIds('31'));
    const focus = Object.values(model.elements).find((item) => item.name === 'Customer');
    if (!focus) throw new Error('Phase 3 focus element is missing');
    const graph = buildAnalysisGraph(model, {
      focusIds: [focus.id], depth: 2, direction: 'both',
    });
    const validation = validateModel(model);
    const mergeTarget = operations.createEmptyModel('Merge target');
    const mergePlan = createModelMergePlan(mergeTarget, model, {
      updateExisting: true,
      updateModelInfo: false,
      updateFolderStructure: true,
    });
    const templateMetadata = {
      version: 1,
      id: 'id-33333333333333333333333333333333',
      categories: ['Phase 3', 'Business'],
    };
    const templateBytes = await createArchiTemplate(model, {
      manifest: {
        name: 'Phase 3 Customer Starter',
        description: 'Analysis, higher-order topology, profile, and view compatibility fixture',
        keyThumbnail: 'Thumbnails/1.png',
      },
      metadata: templateMetadata,
      thumbnails: [thumbnail],
      timestamp: 1_720_000_000_000,
      idFactory: deterministicIds('32'),
    });
    const summary = {
      version: 1,
      model: modelSummary(model),
      analysis: {
        focusName: focus.name,
        depth: 2,
        direction: 'both',
        conceptNames: graph.conceptIds.map((id) =>
          model.elements[id]?.name ?? model.relationships[id]?.name ?? '').sort(),
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        truncated: graph.truncated,
      },
      validation: validation.map((issue) => ({
        source: issue.source,
        rule: issue.rule,
        severity: issue.severity,
        path: issue.location.modelTree.labelPath,
      })),
      merge: {
        created: mergePlan.report.created,
        updated: mergePlan.report.updated,
        moved: mergePlan.report.moved,
        unchanged: mergePlan.report.unchanged,
        skipped: mergePlan.report.skipped,
        warnings: mergePlan.report.warnings,
      },
      template: {
        manifest: {
          name: 'Phase 3 Customer Starter',
          description: 'Analysis, higher-order topology, profile, and view compatibility fixture',
          keyThumbnail: 'Thumbnails/1.png',
        },
        metadata: templateMetadata,
        entries: ['Thumbnails/1.png', 'archi-online.json', 'manifest.xml', 'model.archimate'],
      },
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'phase3-online.archimate'), await serializeArchimateDocument(model));
    await writeFile(join(outputDir, 'phase3-online.architemplate'), templateBytes);
    await writeFile(join(outputDir, 'phase3-online.summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
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
  const outputDir = option('--output-dir') ?? join(root, 'tests', 'fixtures', 'phase3');
  const generated = await generatePhase3Fixtures({ outputDir });
  console.log(`Generated deterministic Phase 3 fixtures in ${generated}`);
}
