import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceModel, setSelection } from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { connectionEndpointModel } from './helpers/connection-endpoints';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  replaceModel(connectionEndpointModel(), null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('view route resolver reuse', () => {
  it('does not rebuild route resolvers for selection-only renders', async () => {
    const geometry = await import('../src/canvas/geometry');
    const createResolver = vi.spyOn(geometry, 'createConnectionRouteResolver');
    const { ViewEditor } = await import('../src/canvas/ViewEditor');

    await act(async () => root.render(createElement(ViewEditor, { viewId: 'view' })));
    const initialCalls = createResolver.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    await act(async () => setSelection('view', ['node-a']));
    await act(async () => setSelection('view', ['node-b']));

    expect(createResolver).toHaveBeenCalledTimes(initialCalls);
  });
});
