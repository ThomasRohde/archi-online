import { describe, expect, it } from 'vitest';
import type { AnalysisGraphResult } from '../src/model/analysis-graph';
import type { ElkGraphLayoutResult } from '../src/model/layout/elk-graph';
import {
  buildVisualiserLayoutRequest,
  edgePoints,
  graphContentBounds,
  nodeLabelLayout,
  relationshipLabelLayout,
  resolveRelationshipLabel,
  visualiserNodeSize,
} from '../src/ui/visualiser/presentation';

function graphFixture(): AnalysisGraphResult {
  return {
    focusIds: ['a'],
    conceptIds: ['a', 'b', 'e'],
    elementIds: ['a', 'b'],
    relationshipIds: ['e'],
    nodes: [
      {
        id: 'a',
        name: 'Document Processing SSC',
        focus: true,
        compact: false,
        kind: 'element',
        type: 'BusinessActor',
      },
      {
        id: 'b',
        name: 'Back Office',
        focus: false,
        compact: false,
        kind: 'element',
        type: 'BusinessActor',
      },
    ],
    edges: [{
      id: 'e',
      relationshipId: 'e',
      sourceId: 'a',
      targetId: 'b',
      type: 'AssignmentRelationship',
      name: 'electronic contract approval with a deliberately long route name',
    }],
    truncated: false,
    maxConcepts: 1_000,
  };
}

describe('Visualiser presentation model', () => {
  it('wraps node labels and expands node height deterministically', () => {
    const node = graphFixture().nodes[0];
    const size = visualiserNodeSize(node);
    const label = nodeLabelLayout(node, size.width, size.height);

    expect(label.lines).toEqual(['Document', 'Processing SSC']);
    expect(size.height).toBeGreaterThanOrEqual(label.lines.length * label.lineHeight + 12);
  });

  it('builds compact and label-aware ELK profiles with deterministic endpoint ports', () => {
    const graph = graphFixture();
    const compact = buildVisualiserLayoutRequest(graph, false);
    const labelled = buildVisualiserLayoutRequest(graph, true);

    expect(compact.options).toMatchObject({
      direction: 'right',
      edgeRouting: 'orthogonal',
      nodeSpacing: 40,
      layerSpacing: 80,
    });
    expect(compact.graph.edges[0].labels).toBeUndefined();
    expect(labelled.options).toMatchObject({
      direction: 'right',
      edgeRouting: 'orthogonal',
      nodeSpacing: 56,
      layerSpacing: 112,
      layoutOptions: {
        'elk.spacing.edgeEdge': 18,
        'elk.spacing.edgeNode': 20,
        'elk.layered.spacing.edgeEdgeBetweenLayers': 16,
        'elk.layered.spacing.edgeNodeBetweenLayers': 20,
        'elk.spacing.edgeLabel': 6,
        'elk.spacing.labelNode': 12,
        'elk.edgeLabels.inline': false,
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'SPACE_EFFICIENT_LAYER',
        'elk.layered.mergeEdges': false,
      },
    });
    expect(labelled.graph.edges[0]).toMatchObject({
      sourcePortId: 'e:source-port',
      targetPortId: 'e:target-port',
      labels: [expect.objectContaining({ id: 'e:label' })],
    });
    expect(labelled.graph.nodes[0].ports).toContainEqual({
      id: 'e:source-port', side: 'east', width: 1, height: 1,
    });
    expect(labelled.graph.nodes[1].ports).toContainEqual({
      id: 'e:target-port', side: 'west', width: 1, height: 1,
    });
  });

  it('wraps relationship labels to a 160 pixel text measure and labels one split segment', () => {
    const edge = graphFixture().edges[0];
    const label = relationshipLabelLayout(edge, true);
    expect(label).not.toBeNull();
    expect(label!.lines.length).toBeGreaterThan(1);
    expect(label!.textWidth).toBeLessThanOrEqual(160);

    expect(relationshipLabelLayout({ ...edge, id: 'e:source', segment: 'source' }, true)).toBeNull();
    expect(relationshipLabelLayout({ ...edge, id: 'e:target', segment: 'target' }, true)).not.toBeNull();
    expect(relationshipLabelLayout({ ...edge, name: '   ' }, true)).toBeNull();
    expect(relationshipLabelLayout(edge, false)).toBeNull();
  });

  it('prefers ELK label bounds and falls back safely to the routed midpoint', () => {
    const edge = { ...graphFixture().edges[0], name: 'Assigned' };
    const layout: ElkGraphLayoutResult = {
      nodes: {
        a: { x: 0, y: 0, width: 120, height: 55 },
        b: { x: 240, y: 0, width: 120, height: 55 },
      },
      edges: {
        e: {
          points: [{ x: 120, y: 27.5 }, { x: 180, y: 27.5 }, { x: 240, y: 27.5 }],
          labels: [{ id: 'e:label', x: 146, y: 44, width: 68, height: 22 }],
        },
      },
    };

    expect(resolveRelationshipLabel(edge, layout, true)).toMatchObject({
      x: 146, y: 44, width: 68, height: 22, source: 'elk',
    });

    const fallback = resolveRelationshipLabel(edge, {
      ...layout,
      edges: { e: { points: layout.edges.e.points } },
    }, true);
    expect(fallback).toMatchObject({ source: 'fallback' });
    expect(fallback!.x + fallback!.width / 2).toBe(180);
    expect(fallback!.y + fallback!.height / 2).toBeLessThan(27.5);
  });

  it('includes nodes, routes, and label plates in content bounds', () => {
    const graph = graphFixture();
    const layout: ElkGraphLayoutResult = {
      nodes: {
        a: { x: 10, y: 20, width: 120, height: 55 },
        b: { x: 240, y: 20, width: 120, height: 55 },
      },
      edges: {
        e: {
          points: [{ x: 130, y: 47 }, { x: 420, y: 47 }],
          labels: [{ id: 'e:label', x: 160, y: -10, width: 80, height: 24 }],
        },
      },
    };

    expect(edgePoints(graph.edges[0], layout)).toEqual(layout.edges.e.points);
    expect(graphContentBounds(graph, layout, true)).toEqual({
      x: 10, y: -10, width: 410, height: 85,
    });
  });
});
