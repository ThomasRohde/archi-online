import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionView } from '../src/canvas/ConnectionView';
import { copyNodes, pasteNodes } from '../src/canvas/clipboard';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import {
  addView,
  createElementOnView,
  createEmptyModel,
  createPlainConnectionOnView,
  createRelationshipOnView,
  addNoteToView,
  canCreatePlainConnection,
  duplicateItems,
  renameItem,
  setDocumentation,
  setNodeStyle,
  setPlainConnectionAttributes,
  setProperties,
} from '../src/model/ops';
import {
  PLAIN_CONNECTION_TYPE,
  type DiagramConnection,
} from '../src/model/types';
import {
  createModelStore,
  redo,
  replaceModel,
  undo,
  type ModelStore,
} from '../src/model/store';
import {
  createTreeTransferBundle,
  pasteTransferBundle,
} from '../src/model/transfer';
import { JConnection, JView, JVisual } from '../src/scripting/jarchi';
import { JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { useStore } from '../src/ui/store-hooks';

function connection(overrides: Partial<DiagramConnection> = {}): DiagramConnection {
  return {
    id: 'plain',
    viewId: 'view',
    connType: 'plain',
    name: '',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: 'note',
    targetId: 'other',
    connectionType: 0,
    bendpoints: [],
    ...overrides,
  };
}

function renderPlain(overrides: Partial<DiagramConnection> = {}): string {
  return renderToStaticMarkup(createElement(ConnectionView, {
    conn: connection(overrides),
    rel: undefined,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    selected: false,
  }));
}

function addPlainFixture(store?: ModelStore) {
  const viewId = addView('View', undefined, store);
  const noteId = addNoteToView(
    viewId,
    viewId,
    { x: 10, y: 10, width: 180, height: 80 },
    'Note',
    {},
    store,
  );
  const actor = createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 260, y: 10, width: 120, height: 55 },
    'Actor',
    {},
    store,
  );
  return { viewId, noteId, actor };
}

beforeEach(() => {
  resetWorkspaceForTests();
  replaceModel(createEmptyModel('Plain Connection Test'), null);
});

describe('VIEW-05 plain connection domain', () => {
  it('pins the complete native Archi 5.9 bit contract', () => {
    expect(PLAIN_CONNECTION_TYPE).toEqual({
      TARGET_FILLED: 1,
      DASHED: 2,
      DOTTED: 4,
      SOURCE_FILLED: 8,
      TARGET_HOLLOW: 16,
      SOURCE_HOLLOW: 32,
      TARGET_OPEN: 64,
      SOURCE_OPEN: 128,
    });
  });

  it('allows a Note at either end with every same-view connectable topology', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const second = createElementOnView(
      'BusinessRole',
      viewId,
      viewId,
      { x: 440, y: 10, width: 120, height: 55 },
      'Role',
    );
    const semantic = createRelationshipOnView(
      'AssignmentRelationship',
      viewId,
      actor.nodeId,
      second.nodeId,
    )!;
    const model = useStore.getState().model!;

    expect(canCreatePlainConnection(model, viewId, noteId, actor.nodeId)).toBe(true);
    expect(canCreatePlainConnection(model, viewId, actor.nodeId, noteId)).toBe(true);
    expect(canCreatePlainConnection(model, viewId, noteId, semantic.connectionId)).toBe(true);
    expect(canCreatePlainConnection(model, viewId, semantic.connectionId, noteId)).toBe(true);
    expect(canCreatePlainConnection(model, viewId, noteId, noteId)).toBe(true);
    expect(canCreatePlainConnection(model, viewId, actor.nodeId, second.nodeId)).toBe(false);
    expect(canCreatePlainConnection(model, 'missing', noteId, actor.nodeId)).toBe(false);
  });

  it('creates one defaulted connection in the explicit store and undoes atomically', () => {
    const isolated = createModelStore({ model: createEmptyModel('Isolated') });
    const globalBefore = useStore.getState().model;
    const { viewId, noteId, actor } = addPlainFixture(isolated);

    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId, isolated);

    expect(id).toBeTruthy();
    expect(isolated.getState().model!.connections[id!]).toMatchObject({
      connType: 'plain',
      sourceId: noteId,
      targetId: actor.nodeId,
      connectionType: 0,
      name: '',
      documentation: '',
      properties: [],
      nameVisible: true,
    });
    expect(isolated.getState().undoStack.at(-1)?.label).toBe('Create Connection');
    expect(useStore.getState().model).toBe(globalBefore);

    undo(isolated);
    expect(isolated.getState().model!.connections[id!]).toBeUndefined();
    redo(isolated);
    expect(isolated.getState().model!.connections[id!]).toBeDefined();
  });

  it('adds Desktop circular bendpoints for a Note self-connection', () => {
    const { viewId } = addPlainFixture();
    const noteId = addNoteToView(
      viewId,
      viewId,
      { x: 10, y: 140, width: 181, height: 81 },
      'Odd-sized note',
    );

    const id = createPlainConnectionOnView(viewId, noteId, noteId)!;

    expect(useStore.getState().model!.connections[id].bendpoints).toEqual([
      { startX: 108, startY: 0, endX: 108, endY: 0 },
      { startX: 108, startY: 60, endX: 108, endY: 60 },
      { startX: 0, startY: 60, endX: 0, endY: 60 },
    ]);
  });

  it('rejects illegal and read-only creation without dirtying or history', () => {
    const store = createModelStore({ model: createEmptyModel('Read only') });
    const { viewId, noteId, actor } = addPlainFixture(store);
    store.setState({ dirty: false, undoStack: [], readOnly: true });

    expect(createPlainConnectionOnView(viewId, noteId, actor.nodeId, store)).toBeNull();
    expect(store.getState().model!.connections).toEqual({});
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toEqual([]);
  });

  it('updates native bits and label visibility in one operation without changing appearance style', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
    setNodeStyle([id], { lineStyle: 2 });
    useStore.setState({ undoStack: [] });

    setPlainConnectionAttributes(id, {
      connectionType:
        PLAIN_CONNECTION_TYPE.SOURCE_OPEN |
        PLAIN_CONNECTION_TYPE.TARGET_HOLLOW |
        PLAIN_CONNECTION_TYPE.DASHED,
      nameVisible: false,
    });

    expect(useStore.getState().model!.connections[id]).toMatchObject({
      connectionType: 128 | 16 | 2,
      nameVisible: false,
      lineStyle: 2,
    });
    expect(useStore.getState().undoStack).toHaveLength(1);
    undo();
    expect(useStore.getState().model!.connections[id]).toMatchObject({
      connectionType: 0,
      nameVisible: true,
      lineStyle: 2,
    });
  });
});

describe('VIEW-05 plain connection rendering', () => {
  it.each([
    [PLAIN_CONNECTION_TYPE.TARGET_FILLED, 'target-filled'],
    [PLAIN_CONNECTION_TYPE.SOURCE_FILLED, 'source-filled'],
    [PLAIN_CONNECTION_TYPE.TARGET_HOLLOW, 'target-hollow'],
    [PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW, 'source-hollow'],
    [PLAIN_CONNECTION_TYPE.TARGET_OPEN, 'target-open'],
    [PLAIN_CONNECTION_TYPE.SOURCE_OPEN, 'source-open'],
  ])('renders native arrow bit %i as %s', (connectionType, marker) => {
    expect(renderPlain({ connectionType })).toContain(`data-plain-arrow="${marker}"`);
  });

  it('uses Desktop arrow and line precedence for conflicting native combinations', () => {
    const html = renderPlain({
      connectionType: 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128,
    });
    expect(html).toContain('data-plain-arrow="source-filled"');
    expect(html).toContain('data-plain-arrow="target-filled"');
    expect(html).not.toContain('source-open');
    expect(html).not.toContain('source-hollow');
    expect(html).not.toContain('target-open');
    expect(html).not.toContain('target-hollow');
    expect(html).toContain('stroke-dasharray="4"');
  });

  it('uses native line bits only when appearance lineStyle is Default', () => {
    expect(renderPlain({ connectionType: 4, lineStyle: undefined })).toContain(
      'stroke-dasharray="1 4"',
    );
    expect(renderPlain({ connectionType: 2, lineStyle: 2 })).toContain(
      'stroke-dasharray="2 3"',
    );
    expect(renderPlain({ connectionType: 2, lineStyle: 0 })).not.toContain(
      'stroke-dasharray',
    );
  });

  it('renders a visible plain name with its position/font and hides it on request', () => {
    const visible = renderPlain({
      name: 'Explains',
      textPosition: 2,
      fontStyle: { family: 'Aptos', sizePt: 11, bold: true, italic: true },
      fontColor: '#123456',
      nameVisible: true,
    });
    expect(visible).toContain('Explains');
    expect(visible).toContain('x="85"');
    expect(visible).toContain('font-family="Aptos, sans-serif"');
    expect(visible).toContain('fill="#123456"');
    expect(renderPlain({ name: 'Hidden', nameVisible: false })).not.toContain('Hidden');
  });
});

describe('VIEW-05 native persistence and preservation', () => {
  it('round-trips native and appearance fields independently with metadata order', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
    renameItem(id, 'Explains');
    setDocumentation(id, 'Why this actor exists');
    setProperties(id, [{ key: 'second', value: '2' }, { key: 'first', value: '1' }]);
    setNodeStyle([id], {
      lineColor: '#112233',
      fontColor: '#445566',
      lineWidth: 3,
      lineStyle: 2,
      textPosition: 0,
      fontStyle: { family: 'Aptos', sizePt: 11, bold: true, italic: false },
    });
    setPlainConnectionAttributes(id, { connectionType: 65, nameVisible: false });

    const xml = serializeArchimate(useStore.getState().model!);
    expect(xml).toContain('type="65"');
    expect(xml).toContain('<feature name="lineStyle" value="2"/>');
    expect(xml).toContain('<feature name="nameVisible" value="false"/>');
    const connectionElement = new DOMParser()
      .parseFromString(xml, 'application/xml')
      .querySelector(`sourceConnection[id="${id}"]`)!;
    expect(connectionElement.getAttribute('xsi:type')).toBeNull();

    const parsed = parseArchimate(xml);
    const copy = Object.values(parsed.connections).find((item) => item.name === 'Explains')!;
    expect(copy).toMatchObject({
      documentation: 'Why this actor exists',
      properties: [{ key: 'second', value: '2' }, { key: 'first', value: '1' }],
      connectionType: 65,
      nameVisible: false,
      lineColor: '#112233',
      fontColor: '#445566',
      lineWidth: 3,
      lineStyle: 2,
      textPosition: 0,
      fontStyle: { family: 'Aptos', sizePt: 11, bold: true, italic: false },
    });
  });

  it('preserves every field through view duplication and cross-model transfer', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
    renameItem(id, 'Copied');
    setDocumentation(id, 'Docs');
    setProperties(id, [{ key: 'ordered', value: 'yes' }]);
    setPlainConnectionAttributes(id, { connectionType: 193, nameVisible: false });
    setNodeStyle([id], {
      lineStyle: 1,
      fontStyle: { family: 'Aptos', sizePt: 10, bold: false, italic: true },
    });

    const [duplicateViewId] = duplicateItems([viewId]);
    const duplicate = Object.values(useStore.getState().model!.connections).find(
      (item) => item.viewId === duplicateViewId && item.name === 'Copied',
    )!;
    expect(duplicate).toMatchObject({
      documentation: 'Docs',
      properties: [{ key: 'ordered', value: 'yes' }],
      connectionType: 193,
      nameVisible: false,
      lineStyle: 1,
      fontStyle: { family: 'Aptos', sizePt: 10, bold: false, italic: true },
    });

    const bundle = createTreeTransferBundle('source', useStore.getState().model!, [viewId]);
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    const target = getModelSession(targetId)!;
    pasteTransferBundle(bundle, target.store, { targetSessionId: targetId });
    const transferred = Object.values(target.store.getState().model!.connections).find(
      (item) => item.name === 'Copied',
    )!;
    expect(transferred).toMatchObject({
      documentation: 'Docs',
      properties: [{ key: 'ordered', value: 'yes' }],
      connectionType: 193,
      nameVisible: false,
      lineStyle: 1,
    });
  });

  it('preserves native and appearance fields through canvas copy/paste', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
    renameItem(id, 'Clipboard plain');
    setPlainConnectionAttributes(id, { connectionType: 68, nameVisible: false });
    setNodeStyle([id], { lineStyle: 1, lineColor: '#123456' });

    copyNodes([noteId, actor.nodeId]);
    const pastedRoots = pasteNodes(viewId);

    expect(pastedRoots).toHaveLength(2);
    const pasted = Object.values(useStore.getState().model!.connections).find(
      (item) => item.id !== id && item.name === 'Clipboard plain',
    )!;
    expect(pasted).toMatchObject({
      connectionType: 68,
      nameVisible: false,
      lineStyle: 1,
      lineColor: '#123456',
    });
  });

  it('projects the same native arrows and label through static export', () => {
    const { viewId, noteId, actor } = addPlainFixture();
    const id = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
    renameItem(id, 'Projected');
    setPlainConnectionAttributes(id, {
      connectionType: PLAIN_CONNECTION_TYPE.SOURCE_OPEN | PLAIN_CONNECTION_TYPE.TARGET_FILLED,
    });

    const html = renderToStaticMarkup(createElement(
      'svg',
      null,
      createElement(StaticViewContent, { model: useStore.getState().model!, viewId }),
    ));

    expect(html).toContain('data-plain-arrow="source-open"');
    expect(html).toContain('data-plain-arrow="target-filled"');
    expect(html).toContain('Projected');
  });
});

describe('VIEW-05 scripting API', () => {
  it('creates and edits a plain connection including a connection endpoint', () => {
    const sessionId = addModelSession({ model: createEmptyModel('Scripted'), fileName: null });
    activateModelSession(sessionId);
    const { viewId, noteId, actor } = addPlainFixture(getModelSession(sessionId)!.store);
    const base = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;

    const wrapper = new JView(viewId).createPlainConnection(
      new JVisual(noteId),
      new JVisual(actor.nodeId),
    );
    const dependent = new JView(viewId).createPlainConnection(
      new JVisual(noteId),
      new JConnection(base),
      65,
    );
    wrapper.name = 'Script label';
    wrapper.documentation = 'Script docs';
    wrapper.prop('key', 'value');
    wrapper.connectionType = 128 | 16 | 4;
    wrapper.nameVisible = false;
    wrapper.textPosition = 2;
    wrapper.fontColor = '#abcdef';
    setNodeStyle([wrapper.id], {
      fontStyle: { family: 'Aptos', sizePt: 20, bold: false, italic: false },
    }, getModelSession(sessionId)!.store);
    wrapper.font = '1|Arial|8|0|';

    const scripted = getModelSession(sessionId)!.store.getState().model!.connections[wrapper.id];
    expect(scripted).toMatchObject({
      name: 'Script label',
      documentation: 'Script docs',
      properties: [{ key: 'key', value: 'value' }],
      connectionType: 148,
      nameVisible: false,
      textPosition: 2,
      fontColor: '#abcdef',
      font: '1|Arial|8|0|',
    });
    expect(scripted.fontStyle).toBeUndefined();
    expect(renderToStaticMarkup(createElement(ConnectionView, {
      conn: { ...scripted, nameVisible: true },
      rel: undefined,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      selected: false,
    }))).toContain('font-family="Arial, sans-serif"');
    expect(dependent.connectionType).toBe(65);
    expect(getModelSession(sessionId)!.store.getState().model!.connections[base]).toBeDefined();
  });

  it('declares the additive creation and writable fields', () => {
    expect(JARCHI_SCRIPT_DTS).toContain(
      'createPlainConnection(source: JConnectable, target: JConnectable, connectionType?: number): JConnection;',
    );
    for (const declaration of [
      'connectionType: number;',
      'nameVisible: boolean;',
      'textPosition: number;',
      'fontColor: string | undefined;',
    ]) {
      expect(JARCHI_SCRIPT_DTS).toContain(declaration);
    }
  });

  it('documents plain connection creation, compatibility, and writable appearance fields', () => {
    const docs = readFileSync('docs/wiki/Scripting-API.md', 'utf8');

    expect(docs).toContain('view.createPlainConnection(source, target, connectionType)');
    expect(docs).toMatch(/A\s+Note must be one endpoint/);
    expect(docs).toContain('connection.connectionType');
    expect(docs).toContain('connection.nameVisible');
    expect(docs).toContain('connection.fontColor');
    expect(docs).toContain('connection.font');
    expect(docs).toContain('connection.textPosition');
  });
});
