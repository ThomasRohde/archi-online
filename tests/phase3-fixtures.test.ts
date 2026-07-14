import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createModelFromArchiTemplate,
  parseArchiTemplate,
} from '../src/model/io/architemplate';
import { parseArchimateDocument } from '../src/model/io/archimate-document';

const fixtureDir = join(__dirname, 'fixtures', 'phase3');
const read = (name: string) => new Uint8Array(readFileSync(join(fixtureDir, name)));
const summary = JSON.parse(readFileSync(join(fixtureDir, 'phase3-online.summary.json'), 'utf8')) as {
  model: { elements: number; relationships: number; views: number; nodes: number; connections: number };
  template: { entries: string[]; metadata: { id: string; categories: string[] } };
};

function ids(model: Awaited<ReturnType<typeof parseArchimateDocument>>): Set<string> {
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

describe('Phase 3 compatibility fixtures', () => {
  it('keeps the native model and standard template payload in sync', async () => {
    const model = await parseArchimateDocument(read('phase3-online.archimate'));
    const templateBytes = read('phase3-online.architemplate');
    const template = await parseArchiTemplate(templateBytes);
    expect({
      elements: Object.keys(model.elements).length,
      relationships: Object.keys(model.relationships).length,
      views: Object.keys(model.views).length,
      nodes: Object.keys(model.nodes).length,
      connections: Object.keys(model.connections).length,
    }).toEqual({
      elements: summary.model.elements,
      relationships: summary.model.relationships,
      views: summary.model.views,
      nodes: summary.model.nodes,
      connections: summary.model.connections,
    });
    expect(Object.keys(unzipSync(templateBytes)).sort()).toEqual(summary.template.entries);
    expect(template.manifest.keyThumbnail).toBe('Thumbnails/1.png');
    expect(Object.keys(template.thumbnails)).toEqual(['Thumbnails/1.png']);
    expect(template.metadata).toEqual({ version: 1, ...summary.template.metadata });
    expect(Object.keys(template.model.connections)).toHaveLength(summary.model.connections);
    expect(Object.values(template.model.connections).some(
      (connection) => Boolean(template.model.connections[connection.sourceId]),
    )).toBe(true);
  });

  it('creates a fully disjoint model ID space from the archived template', async () => {
    const template = await parseArchiTemplate(read('phase3-online.architemplate'));
    const created = createModelFromArchiTemplate(template);
    const archivedIds = ids(template.model);
    expect([...ids(created)].some((id) => archivedIds.has(id))).toBe(false);
  });
});
