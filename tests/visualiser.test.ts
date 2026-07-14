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
import type { ElkGraph } from '../src/model/layout/elk-graph';

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

  it('renders a standalone SVG suitable for SVG and PNG export', () => {
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
    expect(svg).toContain('Assigned');
  });
});
