import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../src/extensions/registry';
import { startExtensionEventBridge } from '../src/extensions/events';
import { useExtensionStore } from '../src/extensions/extension-store';
import { reloadEnabledExtensions, runExtensionRecord } from '../src/extensions/runtime';
import { addElement, createEmptyModel } from '../src/model/ops';
import { replaceModel, undo } from '../src/model/store';
import { createExtensionJArchiGlobals } from '../src/scripting/jarchi/globals';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  removeModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';

beforeEach(() => resetWorkspaceForTests());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function asyncExtensionSessions() {
  const firstId = addModelSession({
    id: 'async-extension-a',
    model: createEmptyModel('Async A'),
    fileName: null,
  });
  const first = getModelSession(firstId)!.store;
  const actorId = addElement('BusinessActor', 'Actor A', undefined, first);
  first.setState({ dirty: false, undoStack: [], redoStack: [] });
  const secondModel = structuredClone(first.getState().model!);
  secondModel.info.name = 'Async B';
  secondModel.elements[actorId].name = 'Actor B';
  const secondId = addModelSession({
    id: 'async-extension-b',
    model: secondModel,
    fileName: null,
  });
  const second = getModelSession(secondId)!.store;
  return { firstId, first, secondId, second, actorId };
}

function installAsyncScopeExtension(
  registry: ReturnType<typeof createExtensionRegistry>,
  actorId: string,
) {
  return runExtensionRecord({
    id: 'local.async-scope',
    name: 'Async scope',
    version: '0.1.0',
    enabled: true,
    source: `
      async function mutate(label, control) {
        model.purpose = model.purpose + label + " before;";
        control.started();
        await control.gate;
        const actor = $("#${actorId}").first();
        actor.name = actor.name + " " + label;
        model.name = app.model.current().info.name + " " + label;
      }
      app.commands.register("local.async-scope.mutate", {
        title: "Async mutate",
        async run(_context, args) { await mutate(args.label, args); }
      });
      app.events.on("view.contextMenu", async function(payload) {
        await mutate(payload.label, payload);
      });
    `,
    createdAt: 1,
    updatedAt: 1,
  }, registry);
}

function installQueuedScopeExtension(
  registry: ReturnType<typeof createExtensionRegistry>,
) {
  return runExtensionRecord({
    id: 'local.queued-scope',
    name: 'Queued scope',
    version: '0.1.0',
    enabled: true,
    source: `
      app.commands.register("local.queued-scope.wait", {
        title: "Wait",
        async run(_context, args) {
          args.started();
          await args.gate;
        }
      });
      app.commands.register("local.queued-scope.mutate", {
        title: "Queued mutate",
        run(_context, args) {
          args.started();
          model.name = model.name + " queued";
        }
      });
    `,
    createdAt: 1,
    updatedAt: 1,
  }, registry);
}

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

  it('keeps an async command bound with chronological undo on its captured model', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second, actorId } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installAsyncScopeExtension(registry, actorId)).toEqual({});
    const gate = deferred();
    let started = false;

    const pending = registry.runCommand('local.async-scope.mutate', {
      label: 'command',
      gate: gate.promise,
      started() { started = true; },
    });
    expect(started).toBe(true);
    activateModelSession(secondId);
    gate.resolve();
    await pending;

    expect(first.getState().model!.info.documentation).toBe('command before;');
    expect(first.getState().model!.info.name).toBe('Async A command');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A command');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Extension: Async mutate',
      'Rename',
      'Rename',
    ]);
    expect(second.getState().model!.info.name).toBe('Async B');
    expect(second.getState().model!.elements[actorId].name).toBe('Actor B');
    expect(second.getState().undoStack).toHaveLength(0);
    undo(first);
    undo(first);
    undo(first);
    expect(first.getState().model!.info.documentation).toBe('');
    expect(first.getState().model!.info.name).toBe('Async A');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A');
  });

  it('keeps an async event bound with chronological undo on its captured model', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second, actorId } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installAsyncScopeExtension(registry, actorId)).toEqual({});
    const gate = deferred();
    let started = false;

    const pending = registry.emitEvent('view.contextMenu', {
      label: 'event',
      gate: gate.promise,
      started() { started = true; },
    });
    expect(started).toBe(true);
    activateModelSession(secondId);
    gate.resolve();
    await pending;

    expect(first.getState().model!.info.documentation).toBe('event before;');
    expect(first.getState().model!.info.name).toBe('Async A event');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A event');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Extension event: view.contextMenu',
      'Rename',
      'Rename',
    ]);
    expect(second.getState().model!.info.name).toBe('Async B');
    expect(second.getState().model!.elements[actorId].name).toBe('Actor B');
    expect(second.getState().undoStack).toHaveLength(0);
  });

  it('keeps rejected invocations scoped until pre-yield async children settle', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.async-child-scope',
      name: 'Async child scope',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.async-child-scope.child", {
          title: "Child mutate",
          async run(_context, args) {
            args.childStarted();
            await args.gate;
            model.name = model.name + " child";
          }
        });
        app.commands.register("local.async-child-scope.parent", {
          title: "Parent mutate",
          async run(_context, args) {
            void app.commands.run("local.async-child-scope.child", args);
            await Promise.resolve();
            args.parentRejected();
            throw new Error("parent failed");
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const gate = deferred();
    let childStarted = false;
    let parentRejected = false;
    let invocationSettled = false;

    const pending = registry.runCommand('local.async-child-scope.parent', {
      gate: gate.promise,
      childStarted() { childStarted = true; },
      parentRejected() { parentRejected = true; },
    });
    void pending.then(() => { invocationSettled = true; });
    expect(childStarted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parentRejected).toBe(true);
    expect(invocationSettled).toBe(false);
    activateModelSession(secondId);
    gate.resolve();
    await pending;

    expect(first.getState().model!.info.name).toBe('Async A child');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
    ]);
    expect(second.getState().model!.info.name).toBe('Async B');
    expect(second.getState().undoStack).toHaveLength(0);
    expect(registry.getSnapshot().errors.map((error) => error.message)).toEqual([
      'Error: parent failed',
    ]);
  });

  it('waits for every pre-yield child after one child rejects', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.multiple-children',
      name: 'Multiple children',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.multiple-children.fail", {
          title: "Failing child",
          async run() {
            await Promise.resolve();
            throw new Error("child failed");
          }
        });
        app.commands.register("local.multiple-children.pending", {
          title: "Pending child",
          async run(_context, args) {
            args.pendingStarted();
            await args.gate;
            model.name = model.name + " pending";
            args.pendingDone();
          }
        });
        app.commands.register("local.multiple-children.parent", {
          title: "Multiple-child parent",
          run(_context, args) {
            void app.commands.run("local.multiple-children.fail");
            void app.commands.run("local.multiple-children.pending", args);
            return "parent result";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const gate = deferred();
    const childDone = deferred();
    let pendingStarted = false;
    let invocationSettled = false;

    const pending = registry.runCommand('local.multiple-children.parent', {
      gate: gate.promise,
      pendingStarted() { pendingStarted = true; },
      pendingDone() { childDone.resolve(); },
    });
    void pending.then(() => { invocationSettled = true; });
    expect(pendingStarted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const settledBeforeGate = invocationSettled;
    activateModelSession(secondId);
    gate.resolve();
    const [result] = await Promise.all([pending, childDone.promise]);

    expect(settledBeforeGate).toBe(false);
    expect(result).toBe('parent result');
    expect(first.getState().model!.info.name).toBe('Async A pending');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
    ]);
    expect(second.getState().model!.info.name).toBe('Async B');
    expect(second.getState().undoStack).toHaveLength(0);
    expect(registry.getSnapshot().errors.map((error) => error.message)).toEqual([
      'Error: child failed',
    ]);
  });

  it('serializes overlapping async invocations across different model stores', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second, actorId } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installAsyncScopeExtension(registry, actorId)).toEqual({});
    const firstGate = deferred();
    const secondGate = deferred();
    let firstStarted = false;
    let secondStarted = false;

    const firstPending = registry.runCommand('local.async-scope.mutate', {
      label: 'first',
      gate: firstGate.promise,
      started() { firstStarted = true; },
    });
    expect(firstStarted).toBe(true);
    activateModelSession(secondId);
    const secondPending = registry.runCommand('local.async-scope.mutate', {
      label: 'second',
      gate: secondGate.promise,
      started() { secondStarted = true; },
    });
    expect(secondStarted).toBe(false);

    firstGate.resolve();
    await firstPending;
    expect(secondStarted).toBe(true);
    secondGate.resolve();
    await secondPending;

    expect(first.getState().model!.info.name).toBe('Async A first');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A first');
    expect(first.getState().undoStack).toHaveLength(3);
    expect(second.getState().model!.info.name).toBe('Async B second');
    expect(second.getState().model!.elements[actorId].name).toBe('Actor B second');
    expect(second.getState().undoStack).toHaveLength(3);
  });

  it('preserves global contributions when reload all sees work on a non-active store', async () => {
    const registry = createExtensionRegistry();
    const { firstId, secondId } = asyncExtensionSessions();
    activateModelSession(firstId);
    const loadedRecord = {
      id: 'local.multimodel-reload',
      name: 'Multi-model reload',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.multimodel-reload.wait", {
          title: "Wait",
          async run(_context, args) {
            args.started();
            await args.gate;
          }
        });
        app.commands.register("local.multimodel-reload.stable", {
          title: "Stable",
          run() { return "old contribution"; }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    };
    const replacementRecord = {
      ...loadedRecord,
      source: `
        app.commands.register("local.multimodel-reload.replacement", {
          title: "Replacement",
          run() { return "new contribution"; }
        });
      `,
      updatedAt: 2,
    };
    expect(runExtensionRecord(loadedRecord, registry)).toEqual({});
    useExtensionStore.setState({ extensions: [replacementRecord] });
    const gate = deferred();
    let started = false;
    const blocker = registry.runCommand('local.multimodel-reload.wait', {
      gate: gate.promise,
      started() { started = true; },
    });
    expect(started).toBe(true);
    activateModelSession(secondId);

    reloadEnabledExtensions(registry);
    const commandIdsWhileBusy = registry.getSnapshot().commands.map((command) => command.id);
    gate.resolve();
    await blocker;

    try {
      expect(commandIdsWhileBusy).toEqual([
        'local.multimodel-reload.wait',
        'local.multimodel-reload.stable',
      ]);
      await expect(registry.runCommand('local.multimodel-reload.stable'))
        .resolves.toBe('old contribution');
      expect(registry.getSnapshot().commands.map((command) => command.id))
        .not.toContain('local.multimodel-reload.replacement');
      expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
        extensionId: 'extensions.reload',
        message: expect.stringMatching(/busy/i),
      });
    } finally {
      useExtensionStore.setState({ extensions: [] });
    }
  });

  it('serializes overlapping async invocations on one store into separate undo entries', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, actorId } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installAsyncScopeExtension(registry, actorId)).toEqual({});
    const firstGate = deferred();
    const secondGate = deferred();
    let secondStarted = false;

    const firstPending = registry.runCommand('local.async-scope.mutate', {
      label: 'first',
      gate: firstGate.promise,
      started() {},
    });
    const secondPending = registry.runCommand('local.async-scope.mutate', {
      label: 'second',
      gate: secondGate.promise,
      started() { secondStarted = true; },
    });
    expect(secondStarted).toBe(false);

    firstGate.resolve();
    await firstPending;
    expect(secondStarted).toBe(true);
    secondGate.resolve();
    await secondPending;

    expect(first.getState().model!.info.name).toBe('Async A first second');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A first second');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Extension: Async mutate',
      'Rename',
      'Rename',
      'Extension: Async mutate',
      'Rename',
      'Rename',
    ]);
    undo(first);
    undo(first);
    undo(first);
    expect(first.getState().model!.info.name).toBe('Async A first');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A first');
    undo(first);
    undo(first);
    undo(first);
    expect(first.getState().model!.info.name).toBe('Async A');
    expect(first.getState().model!.elements[actorId].name).toBe('Actor A');
  });

  it('rejects queued work when its workspace lease closes before start', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installQueuedScopeExtension(registry)).toEqual({});
    const gate = deferred();
    let blockerStarted = false;
    let queuedStarted = false;

    const blocker = registry.runCommand('local.queued-scope.wait', {
      gate: gate.promise,
      started() { blockerStarted = true; },
    });
    expect(blockerStarted).toBe(true);
    const queued = registry.runCommand('local.queued-scope.mutate', {
      started() { queuedStarted = true; },
    });
    removeModelSession(firstId);
    gate.resolve();
    await Promise.all([blocker, queued]);

    expect(queuedStarted).toBe(false);
    expect(first.getState().model!.info.name).toBe('Async A');
    expect(first.getState().undoStack).toHaveLength(0);
    expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
      extensionId: 'local.queued-scope',
      message: expect.stringMatching(/no longer available/i),
    });
  });

  it('rejects queued work when the store model epoch changes before start', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(installQueuedScopeExtension(registry)).toEqual({});
    const gate = deferred();
    let queuedStarted = false;

    const blocker = registry.runCommand('local.queued-scope.wait', {
      gate: gate.promise,
      started() {},
    });
    const queued = registry.runCommand('local.queued-scope.mutate', {
      started() { queuedStarted = true; },
    });
    replaceModel(createEmptyModel('Replacement'), null, false, {}, first);
    gate.resolve();
    await Promise.all([blocker, queued]);

    expect(queuedStarted).toBe(false);
    expect(first.getState().model!.info.name).toBe('Replacement');
    expect(first.getState().undoStack).toHaveLength(0);
    expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
      extensionId: 'local.queued-scope',
      message: expect.stringMatching(/model context changed/i),
    });
  });

  it('serializes overlapping async invocations from different extensions on one store', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    for (const extension of [
      { id: 'local.async-first', title: 'First mutate' },
      { id: 'local.async-second', title: 'Second mutate' },
    ]) {
      expect(runExtensionRecord({
        id: extension.id,
        name: extension.title,
        version: '0.1.0',
        enabled: true,
        source: `
          app.commands.register("${extension.id}.mutate", {
            title: "${extension.title}",
            async run(_context, args) {
              args.started();
              model.purpose = model.purpose + args.label + " before;";
              await args.gate;
              model.name = model.name + " " + args.label;
            }
          });
        `,
        createdAt: 1,
        updatedAt: 1,
      }, registry)).toEqual({});
    }
    const firstGate = deferred();
    const secondGate = deferred();
    let firstStarted = false;
    let secondStarted = false;

    const firstPending = registry.runCommand('local.async-first.mutate', {
      label: 'first',
      gate: firstGate.promise,
      started() { firstStarted = true; },
    });
    expect(firstStarted).toBe(true);
    const secondPending = registry.runCommand('local.async-second.mutate', {
      label: 'second',
      gate: secondGate.promise,
      started() { secondStarted = true; },
    });
    expect(secondStarted).toBe(false);

    firstGate.resolve();
    await firstPending;
    expect(secondStarted).toBe(true);
    secondGate.resolve();
    await secondPending;

    expect(first.getState().model!.info.documentation).toBe('first before;second before;');
    expect(first.getState().model!.info.name).toBe('Async A first second');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Extension: First mutate',
      'Rename',
      'Extension: Second mutate',
      'Rename',
    ]);
    undo(first);
    expect(first.getState().model!.info.name).toBe('Async A first');
    undo(first);
    expect(first.getState().model!.info.documentation).toBe('first before;');
    undo(first);
    expect(first.getState().model!.info.name).toBe('Async A');
    undo(first);
    expect(first.getState().model!.info.documentation).toBe('');
  });

  it('inlines cross-extension same-store calls only during synchronous reentrancy', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.nested-child',
      name: 'Nested child',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.nested-child.mutate", {
          title: "Nested child mutate",
          async run(_context, args) {
            args.childStarted();
            await args.gate;
            model.name = model.name + " child";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    expect(runExtensionRecord({
      id: 'local.nested-parent',
      name: 'Nested parent',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.nested-parent.mutate", {
          title: "Nested parent mutate",
          async run(_context, args) {
            await app.commands.run("local.nested-child.mutate", args);
            model.name = model.name + " parent";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const gate = deferred();
    let childStarted = false;

    const pending = registry.runCommand('local.nested-parent.mutate', {
      gate: gate.promise,
      childStarted() { childStarted = true; },
    });
    expect(childStarted).toBe(true);
    gate.resolve();
    await pending;

    expect(first.getState().model!.info.name).toBe('Async A child parent');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
      'Rename',
    ]);
    undo(first);
    undo(first);
    expect(first.getState().model!.info.name).toBe('Async A');
  });

  it('preserves a parent result and records only the nested command error', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.failed-child',
      name: 'Failed child',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.failed-child.run", {
          title: "Failed child",
          async run() {
            await Promise.resolve();
            throw new Error("nested child failed");
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    expect(runExtensionRecord({
      id: 'local.successful-parent',
      name: 'Successful parent',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.successful-parent.run", {
          title: "Successful parent",
          async run() {
            await app.commands.run("local.failed-child.run");
            model.name = model.name + " parent";
            return "parent result";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});

    const result = await registry.runCommand('local.successful-parent.run');

    expect(result).toBe('parent result');
    expect(first.getState().model!.info.name).toBe('Async A parent');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
    ]);
    expect(registry.getSnapshot().errors).toHaveLength(1);
    expect(registry.getSnapshot().errors[0]).toMatchObject({
      extensionId: 'local.failed-child',
      message: 'Error: nested child failed',
    });
  });

  it('routes an awaited cross-extension command through its parent lease after yield', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.post-yield-child',
      name: 'Post-yield child',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.post-yield-child.run", {
          title: "Post-yield child",
          async run(_context, args) {
            args.childStarted();
            await Promise.resolve();
            model.name = model.name + " child";
            return "child result";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    expect(runExtensionRecord({
      id: 'local.post-yield-parent',
      name: 'Post-yield parent',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.post-yield-parent.run", {
          title: "Post-yield parent",
          async run(_context, args) {
            await Promise.resolve();
            const winner = await Promise.race([
              app.commands.run("local.post-yield-child.run", args).then(() => "child"),
              args.escape.then(() => "escape")
            ]);
            args.finished(winner);
            model.name = model.name + " parent";
            return winner;
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const escape = deferred();
    let childStarted = false;
    let winner = '';

    const pending = registry.runCommand('local.post-yield-parent.run', {
      escape: escape.promise,
      childStarted() { childStarted = true; },
      finished(value: string) { winner = value; },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const childStartedBeforeEscape = childStarted;
    escape.resolve();
    const result = await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(childStartedBeforeEscape).toBe(true);
    expect(winner).toBe('child');
    expect(result).toBe('child');
    expect(first.getState().model!.info.name).toBe('Async A child parent');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
      'Rename',
    ]);
    expect(registry.getSnapshot().errors).toEqual([]);
  });

  it('rejects a cross-extension runtime cycle instead of deadlocking', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.cycle-a',
      name: 'Cycle A',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.cycle-a.leaf", {
          title: "Cycle leaf",
          run(_context, args) { args.leafStarted(); }
        });
        app.commands.register("local.cycle-a.parent", {
          title: "Cycle parent",
          async run(_context, args) {
            await app.commands.run("local.cycle-b.child", args);
            model.name = model.name + " a";
            return "parent result";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    expect(runExtensionRecord({
      id: 'local.cycle-b',
      name: 'Cycle B',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.cycle-b.child", {
          title: "Cycle child",
          async run(_context, args) {
            await app.commands.run("local.cycle-a.leaf", args);
            model.name = model.name + " b";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    let leafStarted = false;

    const result = await registry.runCommand('local.cycle-a.parent', {
      leafStarted() { leafStarted = true; },
    });

    expect(result).toBe('parent result');
    expect(leafStarted).toBe(false);
    expect(first.getState().model!.info.name).toBe('Async A b a');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Rename',
      'Rename',
    ]);
    expect(registry.getSnapshot().errors).toHaveLength(1);
    expect(registry.getSnapshot().errors[0]).toMatchObject({
      extensionId: 'local.cycle-a',
      message: 'Error: Extension invocation cycle detected on the current model.',
    });
  });

  it('holds a parent lease for a post-yield fire-and-forget child', async () => {
    const registry = createExtensionRegistry();
    const { firstId, first, secondId, second } = asyncExtensionSessions();
    activateModelSession(firstId);
    expect(runExtensionRecord({
      id: 'local.fire-child',
      name: 'Fire child',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.fire-child.run", {
          title: "Fire child",
          async run(_context, args) {
            args.childStarted();
            await args.childGate;
            model.name = model.name + " child";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    expect(runExtensionRecord({
      id: 'local.fire-parent',
      name: 'Fire parent',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.fire-parent.run", {
          title: "Fire parent",
          async run(_context, args) {
            await Promise.resolve();
            void app.commands.run("local.fire-child.run", args);
            model.purpose = model.purpose + "parent;";
            return "parent result";
          }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const childGate = deferred();
    let childStarted = false;
    let parentSettled = false;

    const pending = registry.runCommand('local.fire-parent.run', {
      childGate: childGate.promise,
      childStarted() { childStarted = true; },
    });
    void pending.then(() => { parentSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const childStartedBeforeGate = childStarted;
    const parentSettledBeforeGate = parentSettled;
    activateModelSession(secondId);
    childGate.resolve();
    const result = await pending;

    expect(childStartedBeforeGate).toBe(true);
    expect(parentSettledBeforeGate).toBe(false);
    expect(result).toBe('parent result');
    expect(first.getState().model!.info.documentation).toBe('parent;');
    expect(first.getState().model!.info.name).toBe('Async A child');
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Edit Documentation',
      'Rename',
    ]);
    expect(second.getState().model!.info.name).toBe('Async B');
    expect(second.getState().undoStack).toHaveLength(0);
  });

  it('reads a custom invocation then getter only once', async () => {
    const { first } = asyncExtensionSessions();
    const { invoke } = createExtensionJArchiGlobals();
    let thenReads = 0;
    const statefulThenable = Object.defineProperty({}, 'then', {
      get() {
        thenReads += 1;
        if (thenReads > 1) throw new Error('then getter read twice');
        return (resolve: (value: string) => void) => resolve('read once');
      },
    }) as PromiseLike<string>;

    const result = invoke(first, () => statefulThenable);

    expect(result).toBeInstanceOf(Promise);
    await expect(Promise.resolve(result)).resolves.toBe('read once');
    expect(thenReads).toBe(1);
  });

  it('releases runtime and store leases when a then getter throws', async () => {
    const { first, second } = asyncExtensionSessions();
    const { invoke } = createExtensionJArchiGlobals();
    const throwingThen = Object.defineProperty({}, 'then', {
      get() { throw new Error('then getter failed'); },
    });

    expect(() => invoke(first, () => throwingThen)).toThrow('then getter failed');
    const { invoke: probeStore } = createExtensionJArchiGlobals();
    let sameStoreStarted = false;
    const sameStore = probeStore(first, () => {
      sameStoreStarted = true;
      return 'same store';
    });
    let nextStarted = false;
    const next = invoke(second, () => {
      nextStarted = true;
      return 'next result';
    });

    expect(sameStoreStarted).toBe(true);
    expect(nextStarted).toBe(true);
    await expect(Promise.resolve(sameStore)).resolves.toBe('same store');
    await expect(Promise.resolve(next)).resolves.toBe('next result');
  });
});

async function viWaitForEvents(events: unknown[], count: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (events.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toHaveLength(count);
}
