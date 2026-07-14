import { describe, expect, it } from 'vitest';
import {
  layoutElkGraph,
  layoutElkGraphWithRunner,
} from '../src/model/layout/elk-graph';

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

  it('passes fixed ports, labels, and advanced options to ELK and normalizes label bounds', async () => {
    const graph = {
      nodes: [
        {
          id: 'a',
          width: 120,
          height: 55,
          portConstraints: 'fixed-side',
          ports: [{ id: 'a:e:out', side: 'east', width: 1, height: 1 }],
        },
        {
          id: 'b',
          width: 120,
          height: 55,
          portConstraints: 'fixed-side',
          ports: [{ id: 'b:e:in', side: 'west', width: 1, height: 1 }],
        },
      ],
      edges: [{
        id: 'e',
        sourceId: 'a',
        targetId: 'b',
        sourcePortId: 'a:e:out',
        targetPortId: 'b:e:in',
        labels: [{ id: 'e:label', text: 'Assigned to', width: 72, height: 18 }],
      }],
    } as const;
    const before = structuredClone(graph);
    let received: unknown;

    const result = await layoutElkGraphWithRunner(graph, {
      direction: 'right',
      origin: { x: 10, y: 20 },
      layoutOptions: {
        'elk.edgeLabels.inline': false,
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.spacing.edgeLabel': 6,
      },
    }, async (input) => {
      received = input;
      return {
        children: [
          { id: 'a', x: 30, y: 40, width: 120, height: 55 },
          { id: 'b', x: 250, y: 40, width: 120, height: 55 },
        ],
        edges: [{
          id: 'e',
          sections: [{
            startPoint: { x: 150, y: 67.5 },
            endPoint: { x: 250, y: 67.5 },
          }],
          labels: [{ id: 'e:label', x: 164, y: 58, width: 72, height: 18 }],
        }],
      };
    });

    expect(graph).toEqual(before);
    expect(received).toMatchObject({
      layoutOptions: {
        'elk.edgeLabels.inline': 'false',
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.spacing.edgeLabel': '6',
      },
      children: expect.arrayContaining([expect.objectContaining({
        id: 'a',
        layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
        ports: [{
          id: 'a:e:out',
          width: 1,
          height: 1,
          layoutOptions: { 'elk.port.side': 'EAST' },
        }],
      })]),
      edges: [expect.objectContaining({
        id: 'e',
        sources: ['a:e:out'],
        targets: ['b:e:in'],
        labels: [{ id: 'e:label', text: 'Assigned to', width: 72, height: 18 }],
      })],
    });
    expect(result.edges.e).toEqual({
      points: [{ x: 130, y: 47.5 }, { x: 230, y: 47.5 }],
      labels: [{ id: 'e:label', x: 144, y: 38, width: 72, height: 18 }],
    });
  });

  it('lays out a labelled fixed-port route with the real ELK engine', async () => {
    const result = await layoutElkGraph({
      nodes: [
        {
          id: 'a', width: 120, height: 55, portConstraints: 'fixed-side',
          ports: [{ id: 'e:source-port', side: 'east' }],
        },
        {
          id: 'b', width: 120, height: 55, portConstraints: 'fixed-side',
          ports: [{ id: 'e:target-port', side: 'west' }],
        },
      ],
      edges: [{
        id: 'e', sourceId: 'a', targetId: 'b',
        sourcePortId: 'e:source-port', targetPortId: 'e:target-port',
        labels: [{ id: 'e:label', text: 'Assigned', width: 58, height: 22 }],
      }],
    }, {
      direction: 'right',
      nodeSpacing: 56,
      layerSpacing: 112,
      layoutOptions: {
        'elk.edgeLabels.inline': false,
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'SPACE_EFFICIENT_LAYER',
      },
    });

    expect(result.edges.e.points.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.e.labels).toEqual([
      expect.objectContaining({ id: 'e:label', width: 58, height: 22 }),
    ]);
    expect(result.edges.e.points[0].x).toBeGreaterThanOrEqual(result.nodes.a.x + 119);
    expect(result.edges.e.points.at(-1)!.x).toBeLessThanOrEqual(result.nodes.b.x + 1);
  });
});
