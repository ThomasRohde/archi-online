import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAnalysisGraph } from '../src/model/analysis-graph';
import { addElement, addRelationship, createEmptyModel } from '../src/model/ops';
import { replaceModel, setSelection } from '../src/model/store';
import {
  DEFAULT_ANALYSIS_PREFERENCES,
  useAnalysisPreferences,
} from '../src/settings/analysis-preferences';
import { useStore } from '../src/ui/store-hooks';
import {
  createLayoutRequestGate,
  renderAnalysisGraphSvg,
  VisualiserPanel,
} from '../src/ui/VisualiserPanel';
import type { ElkGraph, ElkGraphLayoutOptions } from '../src/model/layout/elk-graph';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index++) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  expect(predicate()).toBe(true);
}

async function simpleLayout(graph: ElkGraph) {
  return {
    nodes: Object.fromEntries(graph.nodes.map((node, index) => [node.id, {
      x: index * 180, y: 0, width: node.width, height: node.height,
    }])),
    edges: {},
  };
}

beforeEach(() => {
  replaceModel(createEmptyModel('Visualiser'), null);
  useAnalysisPreferences.setState({
    preferences: { ...DEFAULT_ANALYSIS_PREFERENCES },
  });
});

describe('Visualiser', () => {
  it('follows selection, keeps graph clicks as tree selection, and can pin its focus', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const process = addElement('BusinessProcess', 'Process');
    addRelationship('AssignmentRelationship', actor, role)!;
    setSelection('tree', [actor]);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(createElement(VisualiserPanel, { layoutGraph: simpleLayout })); });
    await waitFor(() => Boolean(host.querySelector(`[data-concept-id="${role}"]`)));

    expect(host.querySelector('.visualiser-panel')?.getAttribute('data-focus-id')).toBe(actor);
    await act(async () => {
      host.querySelector(`[data-concept-id="${role}"]`)!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [role] });
    expect(host.querySelector('.visualiser-panel')?.getAttribute('data-focus-id')).toBe(actor);

    const pin = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Pin')!;
    await act(async () => { pin.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { setSelection('tree', [process]); });
    expect(host.querySelector('.visualiser-panel')?.getAttribute('data-focus-id')).toBe(actor);
    await act(async () => { root.unmount(); });
  });

  it('suppresses stale asynchronous layout results', () => {
    const gate = createLayoutRequestGate();
    const first = gate.next();
    const second = gate.next();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it('does not render or export a new graph with the previous graph layout', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const process = addElement('BusinessProcess', 'Process');
    addRelationship('AssignmentRelationship', actor, role)!;
    setSelection('tree', [actor]);
    let calls = 0;
    let resolvePending: (() => void) | undefined;
    const deferredLayout = async (graph: ElkGraph) => {
      calls++;
      if (calls === 1) return simpleLayout(graph);
      return new Promise<Awaited<ReturnType<typeof simpleLayout>>>((resolve) => {
        resolvePending = () => { void simpleLayout(graph).then(resolve); };
      });
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(VisualiserPanel, { layoutGraph: deferredLayout }));
    });
    await waitFor(() => Boolean(host.querySelector('svg')));

    await act(async () => { setSelection('tree', [process]); });
    await waitFor(() => calls === 2);
    expect(host.querySelector('svg')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'SVG',
    )?.disabled).toBe(true);

    await act(async () => { resolvePending?.(); });
    await waitFor(() => Boolean(host.querySelector(`[data-concept-id="${process}"]`)));
    await act(async () => { root.unmount(); });
  });

  it('renders a standalone SVG without export-only relationship labels', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    const graph = buildAnalysisGraph(useStore.getState().model!, {
      focusIds: [actor], depth: 1, direction: 'both',
    });
    const svg = renderAnalysisGraphSvg(graph, {
      nodes: {
        [actor]: { x: 0, y: 0, width: 120, height: 55 },
        [role]: { x: 200, y: 0, width: 120, height: 55 },
      },
      edges: {
        [graph.edges[0].id]: { points: [{ x: 120, y: 27 }, { x: 200, y: 27 }] },
      },
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('Actor');
    expect(svg).toContain('Role');
    expect(svg).not.toContain('Assigned');
  });

  it('wraps long node labels consistently in the live graph and exported SVG', async () => {
    const process = addElement('BusinessProcess', 'Document Processing SSC');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', role, process)!;
    const graph = buildAnalysisGraph(useStore.getState().model!, {
      focusIds: [process], depth: 1, direction: 'both',
    });
    const layout = await simpleLayout({
      nodes: graph.nodes.map((node) => ({ id: node.id, width: 120, height: 55 })),
      edges: graph.edges.map((edge) => ({
        id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
      })),
    });
    const svg = renderAnalysisGraphSvg(graph, layout);

    expect(svg).toMatch(/<tspan[^>]*>Document<\/tspan><tspan[^>]*>Processing SSC<\/tspan>/);

    setSelection('tree', [process]);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(VisualiserPanel, { layoutGraph: simpleLayout }));
    });
    await waitFor(() => Boolean(host.querySelector(`[data-concept-id="${process}"]`)));

    expect(Array.from(host.querySelectorAll(
      `[data-concept-id="${process}"] tspan`,
    )).map((line) => line.textContent)).toEqual(['Document', 'Processing SSC']);
    await act(async () => { root.unmount(); });
  });

  it('renders only stored relationship names at the routed half-length when enabled', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const process = addElement('BusinessProcess', 'Process');
    const assigned = addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    const unnamed = addRelationship('AssociationRelationship', actor, process)!;
    const graph = buildAnalysisGraph(useStore.getState().model!, {
      focusIds: [actor], depth: 1, direction: 'both',
    });
    const svg = renderAnalysisGraphSvg(graph, {
      nodes: {
        [actor]: { x: 0, y: 0, width: 120, height: 55 },
        [role]: { x: 200, y: 0, width: 120, height: 55 },
        [process]: { x: 200, y: 100, width: 120, height: 55 },
      },
      edges: {
        [assigned]: {
          points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 80 }],
        },
        [unnamed]: { points: [{ x: 120, y: 27 }, { x: 200, y: 127 }] },
      },
    }, { showRelationshipNames: true });

    expect(svg.match(/class="visualiser-edge-label"/g)).toHaveLength(1);
    expect(svg).toContain('data-label-source="fallback"');
    expect(svg).toContain('transform="translate(-9 2)"');
    expect(svg).toContain('>Assigned</tspan>');
    expect(svg).not.toContain('>Association</tspan>');
  });

  it('uses authoritative ELK label bounds for route placards in export', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const assigned = addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    const graph = buildAnalysisGraph(useStore.getState().model!, {
      focusIds: [actor], depth: 1, direction: 'both',
    });
    const svg = renderAnalysisGraphSvg(graph, {
      nodes: {
        [actor]: { x: 0, y: 0, width: 120, height: 55 },
        [role]: { x: 240, y: 0, width: 120, height: 55 },
      },
      edges: {
        [assigned]: {
          points: [{ x: 120, y: 27.5 }, { x: 240, y: 27.5 }],
          labels: [{ id: `${assigned}:label`, x: 142, y: 42, width: 76, height: 24 }],
        },
      },
    }, { showRelationshipNames: true });

    expect(svg).toContain('class="visualiser-edge-label"');
    expect(svg).toContain('data-label-source="elk"');
    expect(svg).toContain('transform="translate(142 42)"');
    expect(svg).toContain('<rect width="76" height="24" rx="4"');
    expect(svg).toContain('>Assigned</tspan>');
  });

  it('renders one edge label for a relationship split around a relationship node', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const process = addElement('BusinessProcess', 'Process');
    const assigned = addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    addRelationship('AssociationRelationship', assigned, process, 'Context')!;
    const graph = buildAnalysisGraph(useStore.getState().model!, {
      focusIds: [assigned], depth: 1, direction: 'both',
    });
    const svg = renderAnalysisGraphSvg(
      graph,
      await simpleLayout({
        nodes: graph.nodes.map((node) => ({ id: node.id, width: 120, height: 55 })),
        edges: graph.edges.map((edge) => ({
          id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
        })),
      }),
      { showRelationshipNames: true },
    );

    const assignedLabels = (svg.match(/<g class="visualiser-edge-label"[\s\S]*?<\/g>/g) ?? [])
      .filter((markup) => markup.includes('>Assigned</tspan>'));
    expect(assignedLabels).toHaveLength(1);
  });

  it('toggles relationship names in the live graph and preferences', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    setSelection('tree', [actor]);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(VisualiserPanel, { layoutGraph: simpleLayout }));
    });
    await waitFor(() => Boolean(host.querySelector(`[data-concept-id="${role}"]`)));

    expect(host.querySelector('.visualiser-edge-label')).toBeNull();
    const toggle = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent?.trim() === 'Relationship names')
      ?.querySelector<HTMLInputElement>('input');
    expect(toggle?.checked).toBe(false);
    await act(async () => { toggle?.click(); });

    expect(host.querySelector('.visualiser-edge-label')?.textContent).toBe('Assigned');
    expect(useAnalysisPreferences.getState().preferences.showRelationshipNames).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it('relayouts with label-aware ELK options and labelled port routes when names are enabled', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', actor, role, 'Assigned')!;
    setSelection('tree', [actor]);
    const requests: Array<{ graph: ElkGraph; options: ElkGraphLayoutOptions | undefined }> = [];
    const layoutGraph = async (graph: ElkGraph, options?: ElkGraphLayoutOptions) => {
      requests.push({ graph, options });
      return simpleLayout(graph);
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(VisualiserPanel, { layoutGraph }));
    });
    await waitFor(() => requests.length === 1);

    expect(requests[0].options).toMatchObject({ nodeSpacing: 40, layerSpacing: 80 });
    expect(requests[0].graph.edges[0].labels).toBeUndefined();
    const toggle = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent?.trim() === 'Relationship names')
      ?.querySelector<HTMLInputElement>('input');
    await act(async () => { toggle?.click(); });
    await waitFor(() => requests.length === 2);

    expect(requests[1].options).toMatchObject({
      nodeSpacing: 56,
      layerSpacing: 112,
      layoutOptions: {
        'elk.edgeLabels.inline': false,
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'SPACE_EFFICIENT_LAYER',
      },
    });
    expect(requests[1].graph.edges[0]).toMatchObject({
      sourcePortId: expect.stringContaining(':source-port'),
      targetPortId: expect.stringContaining(':target-port'),
      labels: [expect.objectContaining({ text: 'Assigned' })],
    });
    await act(async () => { root.unmount(); });
  });
});
