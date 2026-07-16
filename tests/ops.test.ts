import { beforeEach, describe, expect, it } from 'vitest';
import {
  addElement,
  addRelationship,
  addView,
  addElementNodeToView,
  createEmptyModel,
  createRelationshipOnView,
  deleteItems,
  renameItem,
  setNodeStyle,
} from '../src/model/ops';
import {
  createModelStore,
  getActiveModelStore,
  markModelSaved,
  redo,
  replaceModel,
  runBatch,
  setSelection,
  undo,
} from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Test'), null);
});

describe('model ops + undo/redo', () => {
  it('derives dirty state from the saved history revision across undo and redo', () => {
    const store = getActiveModelStore();
    expect(store.getState()).toMatchObject({
      historyRevision: 0,
      savedRevision: 0,
      dirty: false,
    });

    addElement('BusinessActor', 'Actor');
    const edited = store.getState();
    expect(edited.historyRevision).not.toBe(edited.savedRevision);
    expect(edited.dirty).toBe(true);

    undo();
    expect(store.getState()).toMatchObject({
      historyRevision: 0,
      savedRevision: 0,
      dirty: false,
    });

    redo();
    expect(store.getState().dirty).toBe(true);
  });

  it('restores a save point when redo returns to the saved revision', () => {
    const store = getActiveModelStore();
    addElement('BusinessActor', 'Saved actor');
    const savedRevision = store.getState().historyRevision;
    markModelSaved(savedRevision, 'saved.archimate', store);

    expect(store.getState()).toMatchObject({
      historyRevision: savedRevision,
      savedRevision,
      fileName: 'saved.archimate',
      dirty: false,
    });

    undo(store);
    expect(store.getState().dirty).toBe(true);
    redo(store);
    expect(store.getState()).toMatchObject({
      historyRevision: savedRevision,
      savedRevision,
      dirty: false,
    });
  });

  it('keeps divergent same-depth edits dirty with unique transaction revisions', () => {
    const store = getActiveModelStore();
    addElement('BusinessActor', 'Saved branch');
    const savedRevision = store.getState().historyRevision;
    markModelSaved(savedRevision, 'saved.archimate', store);

    undo(store);
    addElement('BusinessRole', 'Divergent branch');

    const state = store.getState();
    expect(state.undoStack).toHaveLength(1);
    expect(state.historyRevision).not.toBe(savedRevision);
    expect(state.savedRevision).toBe(savedRevision);
    expect(state.dirty).toBe(true);
  });

  it('allocates one revision for a completed batch', () => {
    const store = getActiveModelStore();

    runBatch('script', () => {
      addElement('BusinessActor');
      addElement('BusinessRole');
      addElement('BusinessProcess');
    });

    const state = store.getState();
    expect(state.undoStack).toHaveLength(1);
    expect(state.undoStack[0]).toMatchObject({
      beforeRevision: 0,
      afterRevision: state.historyRevision,
    });
    expect(state.historyRevision).toBeGreaterThan(0);
  });

  it('always derives dirty state from explicit revision overrides', () => {
    const store = createModelStore({
      model: createEmptyModel('Explicit revisions'),
      historyRevision: 4,
      savedRevision: 4,
      dirty: true,
    });

    expect(store.getState().dirty).toBe(false);
  });

  it('initializes imported dirty models without a save point', () => {
    const dirtyStore = createModelStore({
      model: createEmptyModel('Imported'),
      dirty: true,
    });
    const cleanStore = createModelStore({
      model: createEmptyModel('Opened'),
      dirty: false,
    });

    expect(dirtyStore.getState()).toMatchObject({
      historyRevision: 0,
      savedRevision: null,
      dirty: true,
    });
    expect(cleanStore.getState()).toMatchObject({
      historyRevision: 0,
      savedRevision: 0,
      dirty: false,
    });
  });

  it('creates elements in the right default folder', () => {
    const id = addElement('BusinessActor');
    const m = model();
    const folder = m.folders[m.elements[id].folderId];
    expect(folder.folderType).toBe('business');
    expect(folder.itemIds).toContain(id);
    const nid = addElement('Node');
    expect(m.folders[model().elements[nid].folderId].folderType).toBe('technology');
  });

  it('creates valid relationships and rejects invalid ones', () => {
    const a = addElement('BusinessActor');
    const b = addElement('BusinessRole');
    const rel = addRelationship('AssignmentRelationship', a, b);
    expect(rel).not.toBeNull();
    expect(model().relationships[rel!].sourceId).toBe(a);
    const bad = addRelationship('AssignmentRelationship', b, a);
    expect(bad).toBeNull();
  });

  it('undo/redo restores state exactly', () => {
    const before = model();
    const id = addElement('Capability', 'Cap 1');
    expect(model().elements[id]).toBeDefined();
    undo();
    expect(model()).toEqual(before);
    redo();
    expect(model().elements[id].name).toBe('Cap 1');
    renameItem(id, 'Cap 2');
    expect(model().elements[id].name).toBe('Cap 2');
    undo();
    expect(model().elements[id].name).toBe('Cap 1');
  });

  it('keeps ordinary transaction selection behavior unchanged during undo and redo', () => {
    const firstId = addElement('BusinessActor', 'First');
    const secondId = addElement('BusinessRole', 'Second');
    setSelection('tree', [firstId]);
    renameItem(secondId, 'Changed');
    setSelection('tree', [secondId]);

    undo();
    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [secondId] });

    redo();
    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [secondId] });
  });

  it('deleting an element cascades to relationships and view objects', () => {
    const a = addElement('ApplicationComponent');
    const b = addElement('ApplicationService');
    const rel = addRelationship('RealizationRelationship', a, b)!;
    const viewId = addView('V');
    const na = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 });
    const nb = addElementNodeToView(viewId, b, viewId, { x: 200, y: 0, width: 120, height: 55 });
    // adding the second node should have auto-created the connection
    const conns = Object.values(model().connections);
    expect(conns).toHaveLength(1);
    expect(conns[0].relationshipId).toBe(rel);

    deleteItems([a]);
    const m = model();
    expect(m.elements[a]).toBeUndefined();
    expect(m.relationships[rel]).toBeUndefined();
    expect(m.nodes[na]).toBeUndefined();
    expect(m.nodes[nb]).toBeDefined();
    expect(Object.keys(m.connections)).toHaveLength(0);
    expect(m.views[viewId].childIds).toEqual([nb]);

    undo();
    const m2 = model();
    expect(m2.elements[a]).toBeDefined();
    expect(m2.relationships[rel]).toBeDefined();
    expect(m2.nodes[na]).toBeDefined();
    expect(Object.keys(m2.connections)).toHaveLength(1);
  });

  it('creating a relationship on a view creates both concept and connection', () => {
    const viewId = addView('V');
    const a = addElement('BusinessProcess');
    const b = addElement('BusinessObject');
    const na = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 });
    const nb = addElementNodeToView(viewId, b, viewId, { x: 200, y: 0, width: 120, height: 55 });
    const res = createRelationshipOnView('AccessRelationship', viewId, na, nb);
    expect(res).not.toBeNull();
    expect(model().relationships[res!.relationshipId].type).toBe('AccessRelationship');
    expect(model().connections[res!.connectionId].sourceId).toBe(na);
    // invalid direction rejected
    expect(createRelationshipOnView('AccessRelationship', viewId, nb, na)).toBeNull();
  });

  it('runBatch groups multiple ops into one undo step', () => {
    runBatch('script', () => {
      addElement('BusinessActor');
      addElement('BusinessRole');
      addElement('BusinessProcess');
    });
    expect(Object.keys(model().elements)).toHaveLength(3);
    expect(useStore.getState().undoStack).toHaveLength(1);
    undo();
    expect(Object.keys(model().elements)).toHaveLength(0);
  });

  it('batches only the synchronous prefix of an asynchronous callback', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = runBatch('async script', async () => {
      addElement('BusinessActor', 'Before await');
      await gate;
      addElement('BusinessRole', 'After await');
    });

    expect(Object.values(model().elements).map((element) => element.name))
      .toEqual(['Before await']);
    expect(useStore.getState().undoStack.map((entry) => entry.label)).toEqual([
      'async script',
    ]);
    release();
    await pending;

    expect(Object.values(model().elements).map((element) => element.name))
      .toEqual(['Before await', 'After await']);
    expect(useStore.getState().undoStack.map((entry) => entry.label)).toEqual([
      'async script',
      'Create Business Role',
    ]);
    undo();
    expect(Object.values(model().elements).map((element) => element.name))
      .toEqual(['Before await']);
    undo();
    expect(Object.keys(model().elements)).toHaveLength(0);
  });

  it('keeps external edits immediately undoable outside a pending async batch', async () => {
    const store = getActiveModelStore();
    const initialVersion = store.getState().model!.info.version;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = store.runBatch('Async extension', async () => {
      store.transact('Extension before await', (draft) => {
        draft.info.name = 'Extension before await';
      });
      await gate;
      store.transact('Extension after await', (draft) => {
        draft.info.documentation = 'Extension after await';
      });
    });
    store.transact('External edit', (draft) => {
      draft.info.version = 'External edit';
    });
    const undoLabelsWhilePending = store.getState().undoStack.map((entry) => entry.label);
    undo(store);
    const versionAfterExternalUndo = store.getState().model!.info.version;
    release();
    await pending;

    expect(undoLabelsWhilePending).toEqual(['Async extension', 'External edit']);
    expect(versionAfterExternalUndo).toBe(initialVersion);
    expect(store.getState().model!.info.name).toBe('Extension before await');
    expect(store.getState().model!.info.documentation).toBe('Extension after await');
    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Async extension',
      'Extension after await',
    ]);
    undo(store);
    expect(store.getState().model!.info.documentation).toBe('');
    expect(store.getState().model!.info.name).toBe('Extension before await');
    undo(store);
    expect(store.getState().model!.info.name).toBe('Test');
  });

  it('does not retain the batch lease for a never-settling promise', () => {
    const store = getActiveModelStore();
    const pending = store.runBatch('Never settles', () => {
      store.transact('Extension prefix', (draft) => {
        draft.info.name = 'Extension prefix';
      });
      return new Promise<void>(() => undefined);
    });

    store.transact('External edit', (draft) => {
      draft.info.documentation = 'External edit';
    });

    expect(pending).toBeInstanceOf(Promise);
    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Never settles',
      'External edit',
    ]);
    undo(store);
    expect(store.getState().model!.info.documentation).toBe('');
    expect(store.getState().model!.info.name).toBe('Extension prefix');
  });

  it('cleans up a batch exactly once when undo notification throws', () => {
    const store = createModelStore({ model: createEmptyModel('Cleanup') });
    let throwOnUndo = true;
    const unsubscribe = store.subscribe((next, previous) => {
      if (throwOnUndo && next.undoStack.length > previous.undoStack.length) {
        throwOnUndo = false;
        throw new Error('undo subscriber failed');
      }
    });

    expect(() => store.runBatch('Failing notification', () => {
      store.transact('First mutation', (draft) => {
        draft.info.name = 'First';
      });
    })).toThrow('undo subscriber failed');
    store.setState({ undoStack: [], redoStack: [] });
    store.runBatch('Recovered batch', () => {
      store.transact('Second mutation', (draft) => {
        draft.info.documentation = 'Second';
      });
    });
    unsubscribe();

    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual([
      'Recovered batch',
    ]);
  });

  it('normalizes custom thenables and recovers from a throwing then getter', async () => {
    const store = createModelStore({ model: createEmptyModel('Thenables') });
    const customThenable = {
      then(resolve: (value: string) => void) { resolve('settled'); },
    } as PromiseLike<string>;

    const normalized: Promise<string> = store.runBatch('Custom thenable', () => customThenable);
    expect(normalized).toBeInstanceOf(Promise);
    await expect(normalized).resolves.toBe('settled');

    let thenReads = 0;
    const statefulThenable = Object.defineProperty({}, 'then', {
      get() {
        thenReads += 1;
        if (thenReads > 1) throw new Error('then getter read twice');
        return (resolve: (value: string) => void) => resolve('read once');
      },
    }) as PromiseLike<string>;
    const stateful: Promise<string> = store.runBatch(
      'Stateful thenable',
      () => statefulThenable,
    );
    await expect(stateful).resolves.toBe('read once');
    expect(thenReads).toBe(1);

    const throwingThen = Object.defineProperty({}, 'then', {
      get() { throw new Error('then getter failed'); },
    }) as PromiseLike<never>;
    expect(() => store.runBatch('Throwing then', () => throwingThen))
      .toThrow('then getter failed');
    store.runBatch('After throwing then', () => {
      store.transact('Recovered mutation', (draft) => {
        draft.info.name = 'Recovered';
      });
    });

    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual([
      'After throwing then',
    ]);
  });

  it('applies connection appearance through one undoable style operation', () => {
    const actor = addElement('BusinessActor');
    const role = addElement('BusinessRole');
    const rel = addRelationship('AssignmentRelationship', actor, role)!;
    const viewId = addView('V');
    addElementNodeToView(viewId, actor, viewId, { x: 0, y: 0, width: 120, height: 55 });
    addElementNodeToView(viewId, role, viewId, { x: 200, y: 0, width: 120, height: 55 });
    const connId = Object.values(model().connections).find((conn) => conn.relationshipId === rel)!.id;
    const undoDepth = useStore.getState().undoStack.length;

    setNodeStyle([connId], {
      lineColor: '#123456',
      fontColor: '#abcdef',
      font: '1|Segoe UI|11|1|',
      lineWidth: 3,
      textPosition: 2,
    });

    expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
    expect(model().connections[connId]).toMatchObject({
      lineColor: '#123456',
      fontColor: '#abcdef',
      font: '1|Segoe UI|11|1|',
      lineWidth: 3,
      textPosition: 2,
    });

    undo();
    expect(model().connections[connId].lineColor).toBeUndefined();
    expect(model().connections[connId].fontColor).toBeUndefined();
    expect(model().connections[connId].font).toBeUndefined();
    expect(model().connections[connId].lineWidth).toBeUndefined();
    expect(model().connections[connId].textPosition).toBeUndefined();

    redo();
    expect(model().connections[connId]).toMatchObject({
      lineColor: '#123456',
      fontColor: '#abcdef',
      font: '1|Segoe UI|11|1|',
      lineWidth: 3,
      textPosition: 2,
    });

    setNodeStyle([connId], { lineColor: undefined, fontColor: undefined });
    expect(model().connections[connId].lineColor).toBeUndefined();
    expect(model().connections[connId].fontColor).toBeUndefined();
    expect(model().connections[connId].font).toBe('1|Segoe UI|11|1|');
  });
});
