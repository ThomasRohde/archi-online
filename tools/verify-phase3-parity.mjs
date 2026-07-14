import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureDir = join(root, 'tests', 'fixtures', 'phase3');
const fixturePaths = [
  join(fixtureDir, 'phase3-online.archimate'),
  join(fixtureDir, 'phase3-online.architemplate'),
  join(fixtureDir, 'phase3-online.summary.json'),
];

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

function modelIds(model) {
  return new Set([
    model.info.id,
    ...Object.keys(model.profiles),
    ...Object.keys(model.folders),
    ...Object.keys(model.elements),
    ...Object.keys(model.relationships),
    ...Object.keys(model.views),
    ...Object.keys(model.nodes),
    ...Object.keys(model.connections),
  ]);
}

export async function verifyPhase3Parity() {
  const before = await hashes(fixturePaths);
  const dom = new JSDOM('');
  const previousDOMParser = globalThis.DOMParser;
  const hadDOMParser = Object.hasOwn(globalThis, 'DOMParser');
  globalThis.DOMParser = dom.window.DOMParser;
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const expected = JSON.parse(await readFile(fixturePaths[2], 'utf8'));
    const { parseArchimateDocument, serializeArchimateDocument } =
      await server.ssrLoadModule('/src/model/io/archimate-document.ts');
    const { parseArchiTemplate, createModelFromArchiTemplate } =
      await server.ssrLoadModule('/src/model/io/architemplate.ts');
    const { buildAnalysisGraph } = await server.ssrLoadModule('/src/model/analysis-graph.ts');
    const { validateModel } = await server.ssrLoadModule('/src/model/validation.ts');
    const { createModelMergePlan } = await server.ssrLoadModule('/src/model/model-merge.ts');
    const { createEmptyModel } = await server.ssrLoadModule('/src/model/ops/concepts.ts');

    const modelBytes = new Uint8Array(await readFile(fixturePaths[0]));
    const model = await parseArchimateDocument(modelBytes);
    assert.deepEqual(modelSummary(model), expected.model, 'Phase 3 model summary drifted');
    const reparsed = await parseArchimateDocument(await serializeArchimateDocument(model));
    assert.deepEqual(modelSummary(reparsed), expected.model, 'Phase 3 native round-trip drifted');

    const focus = Object.values(model.elements).find((item) => item.name === expected.analysis.focusName);
    assert.ok(focus, 'Phase 3 analysis focus is missing');
    const graph = buildAnalysisGraph(model, {
      focusIds: [focus.id],
      depth: expected.analysis.depth,
      direction: expected.analysis.direction,
    });
    assert.deepEqual({
      conceptNames: graph.conceptIds.map((id) =>
        model.elements[id]?.name ?? model.relationships[id]?.name ?? '').sort(),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      truncated: graph.truncated,
    }, {
      conceptNames: expected.analysis.conceptNames,
      nodeCount: expected.analysis.nodeCount,
      edgeCount: expected.analysis.edgeCount,
      truncated: expected.analysis.truncated,
    }, 'Phase 3 analysis graph drifted');

    assert.deepEqual(validateModel(model).map((issue) => ({
      source: issue.source,
      rule: issue.rule,
      severity: issue.severity,
      path: issue.location.modelTree.labelPath,
    })), expected.validation, 'Phase 3 validator findings drifted');

    const merge = createModelMergePlan(createEmptyModel('Merge target'), model, {
      updateExisting: true,
      updateModelInfo: false,
      updateFolderStructure: true,
    });
    assert.deepEqual({
      created: merge.report.created,
      updated: merge.report.updated,
      moved: merge.report.moved,
      unchanged: merge.report.unchanged,
      skipped: merge.report.skipped,
      warnings: merge.report.warnings,
    }, expected.merge, 'Phase 3 merge preview drifted');

    const templateBytes = new Uint8Array(await readFile(fixturePaths[1]));
    assert.deepEqual(Object.keys(unzipSync(templateBytes)).sort(), expected.template.entries);
    const template = await parseArchiTemplate(templateBytes);
    assert.deepEqual({
      name: template.manifest.name,
      description: template.manifest.description,
      keyThumbnail: template.manifest.keyThumbnail,
    }, expected.template.manifest);
    assert.deepEqual(Object.keys(template.thumbnails), ['Thumbnails/1.png']);
    assert.deepEqual(template.metadata, expected.template.metadata);
    assert.deepEqual(modelSummary(template.model), expected.model);
    const created = createModelFromArchiTemplate(template);
    const templateIds = modelIds(template.model);
    assert.equal([...modelIds(created)].some((id) => templateIds.has(id)), false,
      'Creating from a template reused an archived ID');
    assert.deepEqual(modelSummary(created), expected.model);
  } finally {
    await server.close();
    dom.window.close();
    if (hadDOMParser) globalThis.DOMParser = previousDOMParser;
    else delete globalThis.DOMParser;
  }
  const after = await hashes(fixturePaths);
  assert.deepEqual(after, before, 'Phase 3 verification modified a committed fixture');
  console.log('Phase 3 Online analysis, validation, merge, template, and native round-trip verification passed.');
}

async function hashes(paths) {
  return Promise.all(paths.map(async (path) =>
    createHash('sha256').update(await readFile(path)).digest('hex')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyPhase3Parity();
}
