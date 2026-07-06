import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { NodeView } from '../src/canvas/view-editor/NodeView';
import { isNodeGhosted } from '../src/canvas/view-editor/viewpoint-ghost';
import {
  addElement,
  addElementNodeToView,
  addView,
  createEmptyModel,
  setViewpoint,
} from '../src/model/ops';
import { replaceModel, useStore } from '../src/model/store';

function model() {
  const m = useStore.getState().model;
  if (!m) throw new Error('no model');
  return m;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Ghost Test'), null);
});

describe('isNodeGhosted', () => {
  it('ghosts an element disallowed by the viewpoint, not an allowed one', () => {
    const viewId = addView('V');
    const appId = addElement('ApplicationComponent');
    const bizId = addElement('BusinessActor');
    const appNode = addElementNodeToView(viewId, appId, viewId, { x: 0, y: 0, width: 120, height: 55 });
    const bizNode = addElementNodeToView(viewId, bizId, viewId, { x: 0, y: 80, width: 120, height: 55 });
    setViewpoint(viewId, 'application_structure');

    expect(isNodeGhosted(model(), appNode, 'application_structure')).toBe(false);
    expect(isNodeGhosted(model(), bizNode, 'application_structure')).toBe(true);
  });

  it('never ghosts junctions, groupings, notes, or when no viewpoint is set', () => {
    const viewId = addView('V');
    const junctionId = addElement('Junction');
    const groupingId = addElement('Grouping');
    const bizId = addElement('BusinessActor');
    const jNode = addElementNodeToView(viewId, junctionId, viewId, { x: 0, y: 0, width: 15, height: 15 });
    const gNode = addElementNodeToView(viewId, groupingId, viewId, { x: 0, y: 40, width: 120, height: 55 });
    const bizNode = addElementNodeToView(viewId, bizId, viewId, { x: 0, y: 120, width: 120, height: 55 });

    // Junction and Grouping are always allowed (Archi defaultList).
    expect(isNodeGhosted(model(), jNode, 'application_structure')).toBe(false);
    expect(isNodeGhosted(model(), gNode, 'application_structure')).toBe(false);
    // No viewpoint → nothing ghosts.
    expect(isNodeGhosted(model(), bizNode, undefined)).toBe(false);
    expect(isNodeGhosted(model(), bizNode, '')).toBe(false);
  });
});

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

describe('NodeView ghosting', () => {
  it('marks a disallowed element node figure as ghosted, allowed ones not', async () => {
    const viewId = addView('V');
    const bizId = addElement('BusinessActor');
    const bizNode = addElementNodeToView(viewId, bizId, viewId, { x: 0, y: 0, width: 120, height: 55 });
    setViewpoint(viewId, 'application_structure');

    const props = {
      model: model(),
      nodeId: bizNode,
      moveDelta: new Map(),
      resize: null,
      dropParentId: null,
      connectSource: null,
      connectHover: null,
    };

    const restricted = await render(
      createElement('svg', null, createElement(NodeView, { ...props, viewpoint: 'application_structure' })),
    );
    expect(restricted.host.querySelector('[data-ghosted="true"]')).not.toBeNull();
    await act(async () => restricted.root.unmount());

    const unrestricted = await render(
      createElement('svg', null, createElement(NodeView, { ...props, viewpoint: undefined })),
    );
    expect(unrestricted.host.querySelector('[data-ghosted="true"]')).toBeNull();
    await act(async () => unrestricted.root.unmount());
  });
});
