import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addView, createEmptyModel } from '../src/model/ops';
import { openView } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import {
  clearCanvasStatus,
  setCanvasStatus,
  useCanvasStatus,
} from '../src/ui/canvas-status';
import { ModelStoreProvider, useWorkspaceStore } from '../src/ui/store-hooks';
import { StatusBar } from '../src/ui/StatusBar';

let host: HTMLDivElement;
let root: Root;

function ActiveStatusBar() {
  const activeSessionId = useWorkspaceStore((state) => state.activeSessionId);
  const session = activeSessionId ? getModelSession(activeSessionId) : undefined;
  if (!session) return null;
  return createElement(
    ModelStoreProvider,
    { store: session.store, children: createElement(StatusBar) },
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceForTests();
  useCanvasStatus.setState({ entries: {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  resetWorkspaceForTests();
  useCanvasStatus.setState({ entries: {} });
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('canvas status bar', () => {
  it('shows only the active session and view status after tab switching', async () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null });
    const first = getModelSession(firstId)!;
    const firstViewId = addView('First view', undefined, first.store);
    openView(firstViewId, first.store);
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: null });
    const second = getModelSession(secondId)!;
    const secondViewId = addView('Second view', undefined, second.store);
    openView(secondViewId, second.store);

    setCanvasStatus(firstId, firstViewId, { zoom: 0.5, x: 11, y: 22 });
    setCanvasStatus(secondId, secondViewId, { zoom: 1.25, x: 33, y: 44 });
    await act(async () => root.render(createElement(ActiveStatusBar)));

    expect(host.textContent).toContain('x 33 y 44');
    expect(host.textContent).toContain('125%');

    await act(async () => activateModelSession(firstId));
    expect(host.textContent).toContain('x 11 y 22');
    expect(host.textContent).toContain('50%');
    expect(host.textContent).not.toContain('x 33 y 44');
  });

  it('removes a view entry when its editor unmounts', () => {
    setCanvasStatus('session', 'view', { zoom: 1, x: 1, y: 2 });
    expect(Object.keys(useCanvasStatus.getState().entries)).toHaveLength(1);

    clearCanvasStatus('session', 'view');

    expect(useCanvasStatus.getState().entries).toEqual({});
  });
});
