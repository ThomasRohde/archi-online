import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimateDocument } from '../src/model/io/archimate-xml';
import type { ModelState } from '../src/model/types';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'phase1', name)));

describe('Phase 1 reciprocal Archi 5.9 fixtures', () => {
  it('compares source semantics and archive assets after the Desktop CLI round-trip', async () => {
    const online = await parseArchimateDocument(fixture('phase1-online.archimate'));
    const desktop = await parseArchimateDocument(fixture('phase1-desktop.archimate'));
    expect(summary(desktop)).toEqual(summary(online));
  });

  it('covers Phase 1 specializations, images, appearance, expressions, and metadata', async () => {
    const model = await parseArchimateDocument(fixture('phase1-desktop.archimate'));
    expect(Object.keys(model.profiles)).toHaveLength(2);
    expect(Object.keys(model.assets)).toHaveLength(1);
    expect(new Set(Object.values(model.nodes).map((node) => node.imagePosition ?? (node.nodeType === 'image' ? 9 : 2))))
      .toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect([...new Set(Object.values(model.nodes).map((node) => node.gradient).filter((value) => value !== undefined))]).toEqual(expect.arrayContaining([-1, 0, 1, 2, 3]));
    expect([...new Set(Object.values(model.nodes).map((node) => node.lineStyle).filter((value) => value !== undefined))]).toEqual(expect.arrayContaining([-1, 0, 1, 2, 3]));
    expect(new Set(Object.values(model.nodes).map((node) => node.lineWidth ?? 1))).toEqual(new Set([1, 2, 3]));
    expect(Object.values(model.nodes).some((node) => node.nodeType === 'group' && node.imagePath)).toBe(true);
    expect(Object.values(model.nodes).some((node) => node.nodeType === 'note' && node.imagePath)).toBe(true);
    expect(Object.values(model.nodes).some((node) => node.nodeType === 'ref' && node.imagePath)).toBe(true);
    expect(Object.values(model.nodes).some((node) => node.nodeType === 'image')).toBe(true);
    expect(Object.values(model.nodes).map((node) => node.labelExpression ?? '').join('\n')).toContain('$access:target{name}');
    expect(model.info.metadata).toHaveLength(15);
  });
});

function summary(model: ModelState) {
  const sort = <T extends { id: string }, R>(record: Record<string, T>, map: (item: T) => R & { id: string }) =>
    Object.values(record).map(map).sort((left, right) => left.id.localeCompare(right.id));
  return JSON.parse(JSON.stringify({
    info: { id: model.info.id, name: model.info.name, language: model.info.language, metadata: model.info.metadata },
    profiles: sort(model.profiles, (profile) => ({ ...profile })),
    elements: sort(model.elements, (element) => ({ ...element })),
    relationships: sort(model.relationships, (relationship) => ({ ...relationship })),
    views: sort(model.views, (view) => ({ id: view.id, name: view.name, viewpoint: view.viewpoint, childIds: view.childIds })),
    nodes: sort(model.nodes, (node) => ({ ...node, lineWidth: node.lineWidth ?? 1, imagePosition: node.imagePosition ?? (node.nodeType === 'image' ? 9 : 2) })),
    connections: sort(model.connections, (connection) => ({ ...connection })),
    assets: Object.values(model.assets).map((asset) => ({ id: asset.path, mediaType: asset.mediaType, sha256: asset.sha256, byteLength: asset.bytes.length })).sort((left, right) => left.id.localeCompare(right.id)),
  }));
}
