import { describe, expect, it } from 'vitest';
import { layoutElkGraph } from '../src/model/layout/elk-graph';

describe('generic ELK graph layout', () => {
  it('lays out arbitrary nodes deterministically without mutating the input', async () => {
    const graph = {
      nodes: [
        { id: 'a', width: 120, height: 55 },
        { id: 'b', width: 120, height: 55 },
      ],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    } as const;
    const before = structuredClone(graph);

    const first = await layoutElkGraph(graph, { direction: 'right' });
    const second = await layoutElkGraph(graph, { direction: 'right' });

    expect(graph).toEqual(before);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.nodes.b.x).toBeGreaterThan(first.nodes.a.x);
    expect(first.edges.e).toBeDefined();
  });
});
