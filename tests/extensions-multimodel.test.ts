import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../src/extensions/registry';
import { startExtensionEventBridge } from '../src/extensions/events';
import { createEmptyModel } from '../src/model/ops';
import {
  activateModelSession,
  addModelSession,
  removeModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';

beforeEach(() => resetWorkspaceForTests());

describe('multi-model extension integration', () => {
  it('emits identified model lifecycle events', async () => {
    const registry = createExtensionRegistry();
    const events: { name: string; payload: unknown }[] = [];
    for (const name of ['model.opened', 'model.activated', 'model.closed'] as const) {
      registry.onEvent('local.audit', name, (payload) => events.push({ name, payload }));
    }
    const stop = startExtensionEventBridge(registry);

    const sessionId = addModelSession({ model: createEmptyModel('Lifecycle'), fileName: 'life.archimate' });
    activateModelSession(sessionId);
    removeModelSession(sessionId);
    await viWaitForEvents(events, 3);
    stop();

    expect(events.map((event) => event.name)).toEqual([
      'model.opened',
      'model.activated',
      'model.closed',
    ]);
    expect(events[0].payload).toMatchObject({
      sessionId,
      fileName: 'life.archimate',
    });
    expect(events[0].payload).toHaveProperty('modelId');
  });

  it('adds active model identity to extension command context', async () => {
    const registry = createExtensionRegistry();
    const sessionId = addModelSession({ model: createEmptyModel('Commands'), fileName: null });
    let context: unknown;
    registry.registerCommand('local.audit', {
      id: 'local.audit.capture',
      title: 'Capture',
      run(received) {
        context = received;
      },
    });

    await registry.runCommand('local.audit.capture');

    expect(context).toMatchObject({
      modelSessionId: sessionId,
      modelId: expect.any(String),
    });
  });
});

async function viWaitForEvents(events: unknown[], count: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (events.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toHaveLength(count);
}
