import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  commitMove,
  createEmptyModel,
  setConnectionBendpoints,
} from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import { replaceModel, setSelection, transact } from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { useStore } from '../src/ui/store-hooks';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('ARM rendering'), null);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('nested connection render projection', () => {
  it('hides nested and dependent connections in editor, viewer, and static export, then reveals them', async () => {
    const viewId = addView('View');
    const parentElementId = addElement('ApplicationComponent', 'Parent');
    const childElementId = addElement('ApplicationComponent', 'Child');
    const otherElementId = addElement('ApplicationComponent', 'Other');
    const relationshipId = addRelationship(
      'CompositionRelationship',
      parentElementId,
      childElementId,
    )!;
    const parentNodeId = addElementNodeToView(
      viewId,
      parentElementId,
      viewId,
      { x: 0, y: 0, width: 320, height: 240 },
      false,
    );
    const childNodeId = addElementNodeToView(
      viewId,
      childElementId,
      parentNodeId,
      { x: 20, y: 20, width: 120, height: 55 },
      false,
    );
    const otherNodeId = addElementNodeToView(
      viewId,
      otherElementId,
      viewId,
      { x: 440, y: 20, width: 120, height: 55 },
      false,
    );
    const baseConnectionId = addConnectionToView(
      viewId,
      relationshipId,
      parentNodeId,
      childNodeId,
    );
    setConnectionBendpoints(baseConnectionId, [
      { startX: 10, startY: 10, endX: -10, endY: -10 },
    ]);
    setSelection('view', [baseConnectionId]);
    transact('Add dependent', (draft) => {
      attachConnection(draft, {
        id: 'dependent',
        viewId,
        connType: 'plain',
        name: '',
        documentation: '',
        properties: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        sourceId: baseConnectionId,
        targetId: otherNodeId,
        connectionType: 0,
        bendpoints: [],
      });
    });

    const renderAll = async () => {
      await act(async () => {
        root.render(
          createElement(
            Fragment,
            null,
            createElement(ViewEditor, { viewId }),
            createElement(ViewEditor, { viewId, readOnly: true }),
            createElement(
              'svg',
              { 'data-static': true },
              createElement(StaticViewContent, { model: useStore.getState().model!, viewId }),
            ),
          ),
        );
      });
    };
    await renderAll();

    expect(host.querySelectorAll(`[data-conn-id="${baseConnectionId}"]`)).toHaveLength(0);
    expect(host.querySelectorAll(`[data-bendpoint^="${baseConnectionId}@"]`)).toHaveLength(0);
    expect(host.querySelectorAll('[data-conn-id="dependent"]')).toHaveLength(0);
    expect(useStore.getState().model!.connections[baseConnectionId]).toBeDefined();

    commitMove([
      {
        id: childNodeId,
        parentId: viewId,
        bounds: { x: 300, y: 100, width: 120, height: 55 },
      },
    ]);
    await renderAll();

    expect(host.querySelectorAll(`[data-conn-id="${baseConnectionId}"]`)).toHaveLength(3);
    expect(host.querySelectorAll('[data-conn-id="dependent"]')).toHaveLength(3);
  });
});
