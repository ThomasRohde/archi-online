import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../src/extensions/registry';
import { startExtensionEventBridge } from '../src/extensions/events';
import { runExtensionRecord } from '../src/extensions/runtime';
import { addElement, createEmptyModel } from '../src/model/ops';
import { undo } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
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

  it('binds extension command and event globals and undo to the invocation model', async () => {
    const registry = createExtensionRegistry();
    const startupId = addModelSession({
      id: 'extension-startup',
      model: createEmptyModel('Startup model'),
      fileName: null,
    });
    const startup = getModelSession(startupId)!.store;
    const actorId = addElement('BusinessActor', 'Startup actor', undefined, startup);
    startup.setState({ dirty: false, undoStack: [], redoStack: [] });

    const invocationModel = structuredClone(startup.getState().model!);
    invocationModel.info.name = 'Invocation model';
    invocationModel.elements[actorId].name = 'Invocation actor';
    const invocationId = addModelSession({
      id: 'extension-invocation',
      model: invocationModel,
      fileName: null,
    });
    const invocation = getModelSession(invocationId)!.store;
    activateModelSession(startupId);

    expect(runExtensionRecord({
      id: 'local.model-scope',
      name: 'Model scope',
      version: '0.1.0',
      enabled: true,
      source: `
        function mutate(suffix) {
          const actor = $("#${actorId}").first();
          actor.name = actor.name + suffix;
          model.name = model.name + suffix;
        }
        app.commands.register("local.model-scope.mutate", {
          title: "Mutate active model",
          run() { mutate(" command"); }
        });
        app.events.on("selection.changed", function() { mutate(" event"); });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});

    activateModelSession(invocationId);
    await registry.runCommand('local.model-scope.mutate');

    expect(startup.getState().model!.info.name).toBe('Startup model');
    expect(startup.getState().model!.elements[actorId].name).toBe('Startup actor');
    expect(startup.getState().undoStack).toHaveLength(0);
    expect(invocation.getState().model!.info.name).toBe('Invocation model command');
    expect(invocation.getState().model!.elements[actorId].name).toBe('Invocation actor command');
    expect(invocation.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Extension: Mutate active model',
    ]);

    undo(invocation);
    await registry.emitEvent('selection.changed', { source: 'view', ids: [actorId] });

    expect(startup.getState().model!.info.name).toBe('Startup model');
    expect(startup.getState().model!.elements[actorId].name).toBe('Startup actor');
    expect(startup.getState().undoStack).toHaveLength(0);
    expect(invocation.getState().model!.info.name).toBe('Invocation model event');
    expect(invocation.getState().model!.elements[actorId].name).toBe('Invocation actor event');
    expect(invocation.getState().undoStack).toHaveLength(1);
    undo(invocation);
    expect(invocation.getState().model!.info.name).toBe('Invocation model');
    expect(invocation.getState().model!.elements[actorId].name).toBe('Invocation actor');

    invocation.setState({ readOnly: true });
    await registry.runCommand('local.model-scope.mutate');
    expect(startup.getState().model!.info.name).toBe('Startup model');
    expect(invocation.getState().model!.info.name).toBe('Invocation model');
    expect(invocation.getState().model!.elements[actorId].name).toBe('Invocation actor');
    expect(invocation.getState().undoStack).toHaveLength(0);
  });

  it('runs model.closed handlers against the surviving active model', async () => {
    const registry = createExtensionRegistry();
    const closingId = addModelSession({
      id: 'extension-closing',
      model: createEmptyModel('Closing model'),
      fileName: null,
    });
    const closing = getModelSession(closingId)!.store;
    const actorId = addElement('BusinessActor', 'Closing actor', undefined, closing);
    closing.setState({ dirty: false, undoStack: [], redoStack: [] });
    const activeModel = structuredClone(closing.getState().model!);
    activeModel.info.name = 'Surviving model';
    activeModel.elements[actorId].name = 'Surviving actor';
    const survivingId = addModelSession({
      id: 'extension-surviving',
      model: activeModel,
      fileName: null,
    });
    const surviving = getModelSession(survivingId)!.store;
    activateModelSession(closingId);

    expect(runExtensionRecord({
      id: 'local.closed-scope',
      name: 'Closed scope',
      version: '0.1.0',
      enabled: true,
      source: `
        app.events.on("model.closed", function() {
          const actor = $("#${actorId}").first();
          actor.name = actor.name + " closed";
          model.name = model.name + " closed";
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const stop = startExtensionEventBridge(registry);

    activateModelSession(survivingId);
    removeModelSession(closingId);
    const deadline = Date.now() + 1000;
    while (
      surviving.getState().model!.info.name !== 'Surviving model closed'
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    stop();

    expect(closing.getState().model!.info.name).toBe('Closing model');
    expect(closing.getState().model!.elements[actorId].name).toBe('Closing actor');
    expect(closing.getState().undoStack).toHaveLength(0);
    expect(surviving.getState().model!.info.name).toBe('Surviving model closed');
    expect(surviving.getState().model!.elements[actorId].name).toBe('Surviving actor closed');
    expect(surviving.getState().undoStack).toHaveLength(1);
    expect(registry.getSnapshot().errors).toEqual([]);
  });
});

async function viWaitForEvents(events: unknown[], count: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (events.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toHaveLength(count);
}
