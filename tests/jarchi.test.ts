import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import {
  createModelStore,
  getActiveModelStore,
  redo,
  replaceModel,
  setActiveModelStore,
  undo,
} from '../src/model/store';
import {
  addModelSession,
  getModelSession,
  removeModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { useStore } from '../src/ui/store-hooks';
import { createJArchiGlobals, JConcept, JView } from '../src/scripting/jarchi';
import { JARCHI_CAPABILITY_TEST_SCRIPT } from '../src/scripting/example-scripts';
import { runScript, type ConsoleEntry } from '../src/scripting/runner';
import { connectionEndpointModel, endpointConnection } from './helpers/connection-endpoints';

function model() {
  return useStore.getState().model!;
}

function run(code: string): { error?: string; logs: string[] } {
  const logs: string[] = [];
  const res = runScript(code, (e: ConsoleEntry) => logs.push(`${e.level}:${e.text}`));
  return { ...res, logs };
}

function collidingJArchiStores() {
  const first = createModelStore({ model: createEmptyModel('First model') });
  const actorId = addElement('BusinessActor', 'First actor', undefined, first);
  const roleId = addElement('BusinessRole', 'First role', undefined, first);
  const relationshipId = addRelationship(
    'AssignmentRelationship',
    actorId,
    roleId,
    'First relationship',
    undefined,
    first,
  )!;
  const viewId = addView('First view', undefined, first);
  const actorNodeId = addElementNodeToView(
    viewId,
    actorId,
    viewId,
    { x: 10, y: 10, width: 120, height: 55 },
    false,
    {},
    first,
  );
  const roleNodeId = addElementNodeToView(
    viewId,
    roleId,
    viewId,
    { x: 300, y: 10, width: 120, height: 55 },
    false,
    {},
    first,
  );
  const connectionId = addConnectionToView(
    viewId,
    relationshipId,
    actorNodeId,
    roleNodeId,
    first,
  );
  const secondModel = structuredClone(first.getState().model!);
  secondModel.info.name = 'Second model';
  secondModel.elements[actorId].name = 'Second actor';
  secondModel.elements[roleId].name = 'Second role';
  secondModel.relationships[relationshipId].name = 'Second relationship';
  secondModel.views[viewId].name = 'Second view';
  const second = createModelStore({ model: secondModel });

  return {
    first,
    second,
    actorId,
    roleId,
    relationshipId,
    viewId,
    actorNodeId,
    roleNodeId,
    connectionId,
  };
}

beforeEach(() => {
  replaceModel(createEmptyModel('Script Test'), null);
});

describe('jArchi scripting API', () => {
  it('keeps retained wrappers bound to the model store where they were created', () => {
    const previous = getActiveModelStore();
    const { first, second, actorId, viewId } = collidingJArchiStores();
    try {
      setActiveModelStore(first);
      const globals = createJArchiGlobals();
      const actor = globals.$(`#${actorId}`).first()!;
      const view = new JView(viewId);

      setActiveModelStore(second);

      expect(globals.$(`#${actorId}`).first()!.name).toBe('First actor');
      expect(view.name).toBe('First view');
      actor.name = 'Renamed in first';
      expect(first.getState().model!.elements[actorId].name).toBe('Renamed in first');
      expect(second.getState().model!.elements[actorId].name).toBe('Second actor');
    } finally {
      setActiveModelStore(previous);
    }
  });

  it('keeps retained specialization wrappers bound to their originating store', () => {
    const previous = getActiveModelStore();
    const { first, second } = collidingJArchiStores();
    try {
      setActiveModelStore(first);
      const profile = createJArchiGlobals().model.createSpecialization(
        'First specialization',
        'business-actor',
      );

      setActiveModelStore(second);

      expect(profile.name).toBe('First specialization');
      profile.name = 'Renamed specialization';
      expect(Object.values(first.getState().model!.profiles)[0].name)
        .toBe('Renamed specialization');
      expect(Object.keys(second.getState().model!.profiles)).toHaveLength(0);
    } finally {
      setActiveModelStore(previous);
    }
  });

  it('includes model-store identity in equality and preserves it through derived wrappers', () => {
    const previous = getActiveModelStore();
    const { first, second, actorId, relationshipId, viewId } = collidingJArchiStores();
    try {
      setActiveModelStore(first);
      const firstGlobals = createJArchiGlobals();
      const firstActor = firstGlobals.$(`#${actorId}`).first()!;
      const firstRelationship = firstGlobals.$(`#${relationshipId}`);
      const firstView = new JView(viewId);

      setActiveModelStore(second);
      const secondActor = createJArchiGlobals().$(`#${actorId}`).first()!;

      expect(firstActor.equals(secondActor)).toBe(false);
      expect(firstGlobals.$(`#${actorId}`).first()!.equals(firstActor)).toBe(true);
      expect(firstRelationship.sourceEnds().first()!.equals(firstActor)).toBe(true);
      expect(firstView.nodes()[0].concept!.equals(firstActor)).toBe(true);
      expect(firstView.connections()[0].source.equals(firstView.nodes()[0])).toBe(true);
      expect(firstGlobals.$('.Business').children(`#${actorId}`).first()!.name)
        .toBe('First actor');
    } finally {
      setActiveModelStore(previous);
    }
  });

  it('rejects create and reconnect calls that mix wrappers from different model stores', () => {
    const previous = getActiveModelStore();
    const { first, second, actorId, roleId, relationshipId, viewId } = collidingJArchiStores();
    try {
      setActiveModelStore(first);
      const firstGlobals = createJArchiGlobals();
      const firstActor = firstGlobals.$(`#${actorId}`).first() as JConcept;
      const firstRelationship = firstGlobals.$(`#${relationshipId}`).first() as JConcept;
      const firstView = new JView(viewId);
      const firstNodes = firstView.nodes();
      const firstConnection = firstView.connections()[0];

      setActiveModelStore(second);
      const secondGlobals = createJArchiGlobals();
      const secondRole = secondGlobals.$(`#${roleId}`).first() as JConcept;
      const secondRoleNode = new JView(viewId).nodes()[1];

      expect(() => firstGlobals.model.createRelationship(
        'assignment-relationship',
        'mixed',
        firstActor,
        secondRole,
      )).toThrow(/different model session/i);
      expect(() => firstView.add(
        firstRelationship,
        firstNodes[0],
        secondRoleNode,
      )).toThrow(/different model session/i);
      expect(() => firstConnection.reconnect('target', secondRoleNode))
        .toThrow(/different model session/i);
      expect(() => firstGlobals.$(`#${actorId}`).add(secondRole))
        .toThrow(/different model session/i);
    } finally {
      setActiveModelStore(previous);
    }
  });

  it('keeps one script execution and undo batch on its captured active store', () => {
    const previous = getActiveModelStore();
    const first = createModelStore({ model: createEmptyModel('First') });
    const second = createModelStore({ model: createEmptyModel('Second') });
    try {
      setActiveModelStore(first);
      const result = runScript(`
        model.createElement("business-actor", "Before switch");
        console.log("switch");
        model.createElement("business-role", "After switch");
      `, (entry) => {
        if (entry.text === 'switch') setActiveModelStore(second);
      });

      expect(result.error).toBeUndefined();
      expect(Object.values(first.getState().model!.elements).map((element) => element.name))
        .toEqual(['Before switch', 'After switch']);
      expect(Object.keys(second.getState().model!.elements)).toHaveLength(0);
      expect(first.getState().undoStack).toHaveLength(1);
      expect(second.getState().undoStack).toHaveLength(0);
    } finally {
      setActiveModelStore(previous);
    }
  });

  it('invalidates wrappers, profiles, and collections when their workspace session closes', () => {
    resetWorkspaceForTests();
    const sessionId = addModelSession({
      id: 'stale-jarchi-session',
      model: createEmptyModel('Session model'),
      fileName: null,
    });
    const store = getModelSession(sessionId)!.store;
    const actorId = addElement('BusinessActor', 'Session actor', undefined, store);
    const globals = createJArchiGlobals(store);
    const actor = globals.$(`#${actorId}`).first()!;
    const collection = globals.$(`#${actorId}`);
    const profile = globals.model.createSpecialization('Session profile', 'business-actor');
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    removeModelSession(sessionId);

    expect(() => actor.name).toThrow(/stale.*session/i);
    expect(() => collection.size()).toThrow(/stale.*session/i);
    expect(() => profile.name).toThrow(/stale.*session/i);
    expect(() => createJArchiGlobals(store).model.name).toThrow(/stale.*session/i);
    expect(() => {
      actor.name = 'Must not apply';
    }).toThrow(/stale.*session/i);
    expect(store.getState().model!.elements[actorId].name).toBe('Session actor');
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it('invalidates retained wrappers when their store model is replaced', () => {
    const store = createModelStore({ model: createEmptyModel('Original model') });
    const actorId = addElement('BusinessActor', 'Original actor', undefined, store);
    const globals = createJArchiGlobals(store);
    const actor = globals.$(`#${actorId}`).first()!;
    const collection = globals.$(`#${actorId}`);
    const emptyCollection = globals.$('#missing-id');
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    replaceModel(createEmptyModel('Replacement model'), null, false, {}, store);

    expect(() => actor.name).toThrow(/stale.*session/i);
    expect(() => collection.toArray()).toThrow(/stale.*session/i);
    expect(() => emptyCollection.isEmpty()).toThrow(/stale.*session/i);
    expect(() => globals.model.name).toThrow(/stale.*session/i);
    expect(() => {
      actor.name = 'Must not apply';
    }).toThrow(/stale.*session/i);
    expect(store.getState().model!.info.name).toBe('Replacement model');
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toHaveLength(0);
    expect(createJArchiGlobals(store).model.name).toBe('Replacement model');
  });

  it('keeps wrapper, profile, and collection model bindings opaque and non-bypassable', () => {
    const first = createModelStore({ model: createEmptyModel('Read-only first') });
    const actorId = addElement('BusinessActor', 'First actor', undefined, first);
    const globals = createJArchiGlobals(first);
    const actor = globals.$(`#${actorId}`).first()!;
    const collection = globals.$(`#${actorId}`);
    const profile = globals.model.createSpecialization('First profile', 'business-actor');
    const secondModel = structuredClone(first.getState().model!);
    secondModel.info.name = 'Writable second';
    secondModel.elements[actorId].name = 'Second actor';
    const second = createModelStore({ model: secondModel });
    const secondActor = createJArchiGlobals(second).$(`#${actorId}`).first()!;
    first.setState({ readOnly: true, dirty: false, undoStack: [], redoStack: [] });

    for (const value of [actor, profile, collection]) {
      expect('modelStore' in value).toBe(false);
      expect(Object.getOwnPropertyNames(value)).not.toContain('modelStore');
      expect(Object.getOwnPropertyNames(Object.getPrototypeOf(value))).not.toContain('modelStore');
      expect((value as unknown as Record<string, unknown>).modelStore).toBeUndefined();
    }

    Object.defineProperty(actor, 'modelStore', { value: second, configurable: true });
    Object.defineProperty(profile, 'modelStore', { value: second, configurable: true });
    Object.defineProperty(collection, 'modelStore', { value: second, configurable: true });
    expect(actor.name).toBe('First actor');
    actor.name = 'Bypassed actor';
    profile.name = 'Bypassed profile';
    expect(() => collection.add(secondActor)).toThrow(/different model session/i);
    expect(first.getState().model!.elements[actorId].name).toBe('First actor');
    expect(second.getState().model!.elements[actorId].name).toBe('Second actor');
    expect(first.getState().undoStack).toHaveLength(0);
    expect(second.getState().undoStack).toHaveLength(0);
  });

  it('keeps wrappers valid through undo, redo, and read-only state changes', () => {
    const store = createModelStore({ model: createEmptyModel('Stable model') });
    const actorId = addElement('BusinessActor', 'Before', undefined, store);
    const actor = createJArchiGlobals(store).$(`#${actorId}`).first()!;
    store.setState({ dirty: false, undoStack: [], redoStack: [] });

    actor.name = 'After';
    expect(actor.name).toBe('After');
    undo(store);
    expect(actor.name).toBe('Before');
    redo(store);
    expect(actor.name).toBe('After');

    store.setState({ readOnly: true });
    expect(actor.name).toBe('After');
    actor.name = 'Ignored';
    expect(actor.name).toBe('After');
  });

  it('matches the jArchi specialization API', () => {
    const { logs, error } = run(`
      var actor = model.createElement("business-actor", "Customer");
      var profile = model.createSpecialization("External party", "business-actor");
      actor.specialization = "External party";
      console.log(actor.specialization, profile.type, model.specializations.length);
      profile.name = "External customer";
      console.log(model.findSpecialization("External customer", "business-actor").name);
      profile.delete();
      console.log(actor.specialization, model.specializations.length);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:External party business-actor 1',
      'log:External customer',
      'log:undefined 0',
    ]);
  });

  it('returns a replacement wrapper from setType and supports relationship-only invert', () => {
    const { logs, error } = run(`
      var actor = model.createElement("business-actor", "Actor");
      var role = model.createElement("business-role", "Role");
      var relationship = model.createRelationship("association-relationship", "linked", actor, role);
      var oldActorId = actor.id;
      var replacement = actor.setType("business-role");
      console.log(oldActorId !== replacement.id, replacement.type, replacement.name,
        relationship.source.id === replacement.id);
      var relationshipId = relationship.id;
      var inverted = relationship.invert();
      console.log(inverted.id === relationshipId, inverted.source.name, inverted.target.name);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:true business-role Actor true',
      'log:true Role Actor',
    ]);
  });

  it('rejects illegal setType and element inversion without partial mutation', () => {
    const { error } = run(`
      var actor = model.createElement("business-actor", "Actor");
      var role = model.createElement("business-role", "Role");
      var relationship = model.createRelationship("assignment-relationship", "assigned", actor, role);
      relationship.setType("access-relationship");
    `);
    expect(error).toMatch(/not legal/i);
    expect(Object.values(model().relationships)[0]).toMatchObject({
      type: 'AssignmentRelationship',
      sourceId: Object.values(model().elements).find((element) => element.name === 'Actor')?.id,
    });

    const elementInvert = run(`$(".Actor").first().invert()`);
    expect(elementInvert.error).toMatch(/relationships/i);
  });

  it('creates elements, relationships and views', () => {
    const { error } = run(`
      var actor = model.createElement("business-actor", "Bob");
      var role = model.createElement("business-role", "Manager");
      var rel = model.createRelationship("assignment-relationship", "does", actor, role);
      var view = model.createArchimateView("Main View");
      var va = view.add(actor, 10, 10, 120, 55);
      var vr = view.add(role, 300, 10, 120, 55);
      view.add(rel, va, vr);
    `);
    expect(error).toBeUndefined();
    const m = model();
    expect(Object.keys(m.elements)).toHaveLength(2);
    expect(Object.keys(m.relationships)).toHaveLength(1);
    expect(Object.keys(m.views)).toHaveLength(1);
    expect(Object.keys(m.nodes)).toHaveLength(2);
    expect(Object.keys(m.connections)).toHaveLength(1);
    const rel = Object.values(m.relationships)[0];
    expect(rel.type).toBe('AssignmentRelationship');
    expect(rel.name).toBe('does');
  });

  it('one script run is a single undo step', () => {
    run(`
      for (var i = 0; i < 5; i++) model.createElement("capability", "Cap " + i);
    `);
    expect(Object.keys(model().elements)).toHaveLength(5);
    expect(useStore.getState().undoStack).toHaveLength(1);
    undo();
    expect(Object.keys(model().elements)).toHaveLength(0);
  });

  it('selects with $() by type, name, id, wildcard', () => {
    run(`
      model.createElement("business-actor", "Bob");
      model.createElement("business-actor", "Alice");
      model.createElement("business-role", "Manager");
    `);
    const { logs } = run(`
      console.log($("business-actor").size());
      console.log($("element").size());
      console.log($(".Alice").size());
      console.log($("business-actor.Bob").size());
      console.log($("*").size() > 5);
      console.log($("folder").size());
    `);
    expect(logs).toEqual(['log:2', 'log:3', 'log:1', 'log:1', 'log:true', 'log:9']);
  });

  it('reads and writes attributes and properties', () => {
    const { logs, error } = run(`
      var a = model.createElement("business-actor", "Bob");
      a.name = "Robert";
      a.documentation = "The boss";
      a.prop("email", "bob@example.com");
      console.log(a.name, a.documentation, a.prop("email"));
      a.prop("email", "bob2@example.com");
      console.log(a.prop("email"), a.prop().length);
      a.removeProp("email");
      console.log(a.prop("email"));
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:Robert The boss bob@example.com',
      'log:bob2@example.com 1',
      'log:undefined',
    ]);
  });

  it('walks relationships with rels/sourceEnds/targetEnds', () => {
    const { logs } = run(`
      var app = model.createElement("application-component", "CRM");
      var svc = model.createElement("application-service", "Query Service");
      var proc = model.createElement("business-process", "Sell");
      model.createRelationship("realization-relationship", "", app, svc);
      model.createRelationship("serving-relationship", "", svc, proc);
      console.log($(".CRM").rels().size());
      console.log($(".Query Service").rels().size());
      console.log($(".Query Service").inRels().size());
      console.log($(".Query Service").outRels().size());
      console.log($("serving-relationship").sourceEnds().first().name);
      console.log($("serving-relationship").targetEnds().first().name);
    `);
    expect(logs).toEqual(['log:1', 'log:2', 'log:1', 'log:1', 'log:Query Service', 'log:Sell']);
  });

  it('filters, iterates, deletes', () => {
    const { logs } = run(`
      model.createElement("goal", "G1");
      model.createElement("goal", "G2");
      model.createElement("driver", "D1");
      var names = [];
      $("goal").each(function(g) { names.push(g.name); });
      console.log(names.join(","));
      $("element").filter(function(e) { return e.name === "D1"; }).delete();
      console.log($("element").size());
    `);
    expect(logs).toEqual(['log:G1,G2', 'log:2']);
  });

  it('rejects invalid relationships with an error', () => {
    const { error } = run(`
      var obj = model.createElement("business-object", "Doc");
      var proc = model.createElement("business-process", "P");
      model.createRelationship("assignment-relationship", "", obj, proc);
    `);
    expect(error).toContain('not allowed');
    // the batch still commits what succeeded before the error
    expect(Object.keys(model().elements)).toHaveLength(2);
  });

  it('visual objects: bounds, colors, nesting, objectRefs/viewRefs', () => {
    const { logs, error } = run(`
      var node = model.createElement("node", "Server");
      var view = model.createArchimateView("Infra");
      var v = view.add(node, 24, 36, 200, 100);
      v.fillColor = "#ff0000";
      v.bounds = { width: 240 };
      console.log(v.bounds.x, v.bounds.width, v.fillColor);
      var dev = model.createElement("device", "Disk");
      var child = v.add(dev, 10, 40, 100, 40);
      console.log(child.concept.name, $(".Server").objectRefs().size(), $(".Server").viewRefs().first().name);
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual(['log:24 240 #ff0000', 'log:Disk 1 Infra']);
    const nodes = Object.values(model().nodes);
    expect(nodes).toHaveLength(2);
    const child = nodes.find((n) => n.parentId !== n.viewId)!;
    expect(child.bounds).toEqual({ x: 10, y: 40, width: 100, height: 40 });
  });

  it('exposes Archi 5.9 label and appearance fields', () => {
    const { logs, error } = run(`
      var actor = model.createElement("business-actor", "Actor");
      var role = model.createElement("business-role", "Role");
      var rel = model.createRelationship("assignment-relationship", "assigned", actor, role);
      var view = model.createArchimateView("View");
      var source = view.add(actor, 10, 10, 120, 55);
      var target = view.add(role, 220, 10, 120, 55);
      var connection = view.add(rel, source, target);
      source.labelExpression = "\${name}";
      source.gradient = 3; source.lineStyle = 2; source.lineWidth = 3;
      source.imageSource = 1; source.imagePosition = 9;
      connection.labelExpression = "\${source:name}";
      connection.lineStyle = 1; connection.lineWidth = 2;
      console.log(source.labelExpression, source.gradient, source.lineStyle, source.lineWidth, source.imageSource, source.imagePosition);
      console.log(connection.labelExpression, connection.lineStyle, connection.lineWidth);
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual(['log:${name} 3 2 3 1 9', 'log:${source:name} 1 2']);
  });

  it('exposes diagram automation traversal helpers', () => {
    const { logs, error } = run(`
      var actor = model.createElement("business-actor", "Actor");
      var role = model.createElement("business-role", "Role");
      var rel = model.createRelationship("assignment-relationship", "assigned", actor, role);
      var view = model.createArchimateView("Main");
      var group = view.createObject("group", 100, 80, 300, 150);
      group.name = "Container";
      var actorNode = group.add(actor, 10, 20, 120, 55);
      var roleNode = view.add(role, 400, 100, 120, 55);
      var conn = view.add(rel, actorNode, roleNode);
      var viewBounds = view.bounds({ recursive: true });

      console.log(view.nodes().length, view.nodes({ recursive: true }).length, view.connections().length);
      console.log(actorNode.parent().id === group.id, group.children().length, actorNode.absoluteBounds().x, actorNode.absoluteBounds().y);
      console.log(actorNode.connections().length, roleNode.connections({ outgoing: false }).length, actorNode.connections({ incoming: false }).length);
      console.log(viewBounds.x, viewBounds.y, viewBounds.width, viewBounds.height);
      console.log(conn.source.id === actorNode.id, conn.target.id === roleNode.id);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:2 3 1',
      'log:true 1 110 100',
      'log:1 1 1',
      'log:100 80 420 150',
      'log:true true',
    ]);
  });

  it('uses connections as connectable endpoints with diagram metadata and properties', () => {
    const { logs, error } = run(`
      var a = model.createElement("business-actor", "A");
      var b = model.createElement("business-role", "B");
      var c = model.createElement("business-collaboration", "C");
      var baseRel = model.createRelationship("association-relationship", "base semantic", a, b);
      var dependentRel = model.createRelationship("association-relationship", "dependent semantic", baseRel, c);
      var view = model.createArchimateView("Connectables");
      var aNode = view.add(a, 0, 0, 100, 40);
      var bNode = view.add(b, 200, 0, 100, 40);
      var cNode = view.add(c, 100, 160, 100, 40);
      var base = view.add(baseRel, aNode, bNode);
      var dependent = view.add(dependentRel, base, cNode);
      dependent.name = "visual dependent";
      dependent.documentation = "diagram docs";
      dependent.prop("owner", "diagram");
      dependent.setAbsoluteRoute([{ x: 140, y: 100 }]);
      var route = dependent.absoluteRoute();
      console.log(dependent.source.kind, dependent.target.kind, dependent.name, dependent.documentation, dependent.prop("owner"));
      console.log(route.length, Math.round(route[0].x), Math.round(route[0].y));
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:connection visual visual dependent diagram docs diagram',
      'log:1 140 100',
    ]);
    const connections = Object.values(model().connections);
    const dependent = connections.find((connection) => connection.name === 'visual dependent')!;
    const base = connections.find((connection) => connection.id === dependent.sourceId)!;
    expect(dependent.documentation).toBe('diagram docs');
    expect(dependent.properties).toEqual([{ key: 'owner', value: 'diagram' }]);
    expect(base.sourceConnectionIds).toEqual([dependent.id]);
  });

  it('supports raw bendpoints and absolute connection routes', () => {
    const { logs, error } = run(`
      var source = model.createElement("application-component", "Source");
      var target = model.createElement("application-service", "Target");
      var rel = model.createRelationship("realization-relationship", "realizes", source, target);
      var view = model.createArchimateView("Routes");
      var sourceNode = view.add(source, 10, 20, 100, 50);
      var targetNode = view.add(target, 310, 220, 100, 50);
      var conn = view.add(rel, sourceNode, targetNode);

      conn.bendpoints = [{ startX: 10, startY: 20, endX: -30, endY: 40 }];
      console.log(conn.bendpoints.length, conn.bendpoints[0].startX, conn.bendpoints[0].endY);

      conn.setAbsoluteRoute([{ x: 180, y: 130 }, { x: 220, y: 160 }]);
      var route = conn.absoluteRoute();
      console.log(route.length, Math.round(route[0].x), Math.round(route[0].y), Math.round(route[1].x), Math.round(route[1].y));

      conn.setAbsoluteRoute([]);
      console.log(conn.bendpoints.length, conn.absoluteRoute().length);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:1 10 40',
      'log:2 180 130 220 160',
      'log:0 0',
    ]);
  });

  it('exposes view routers, rendered routes, and additive connection reconnection', () => {
    const { logs, error } = run(`
      var a = model.createElement("business-actor", "A");
      var b = model.createElement("business-role", "B");
      var c = model.createElement("business-role", "C");
      var rel = model.createRelationship("assignment-relationship", "assigned", a, b);
      var view = model.createArchimateView("Router");
      var aNode = view.add(a, 0, 0, 100, 40);
      var bNode = view.add(b, 200, 0, 100, 40);
      var cNode = view.add(c, 400, 0, 100, 40);
      var conn = view.add(rel, aNode, bNode);
      conn.setAbsoluteRoute([{ x: 250, y: 120 }]);
      console.log(view.routerType, conn.bendpoints.length);
      view.routerType = "manhattan";
      conn.reconnect("target", cNode);
      var route = conn.routedPoints();
      console.log(view.routerType, rel.target.name, conn.target.concept.name,
        conn.bendpoints.length, route.length,
        Math.round(route[0].x), Math.round(route[route.length - 1].x));
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:manual 1',
      'log:manhattan C C 1 4 100 400',
    ]);
  });

  it('returns the same Manhattan lane as projections when nesting hides an earlier connection', () => {
    const routeModel = createEmptyModel('Nested route');
    const diagrams = routeModel.rootFolderIds
      .map((id) => routeModel.folders[id])
      .find((folder) => folder.folderType === 'diagrams')!;
    routeModel.views.view = {
      id: 'view',
      kind: 'view',
      name: 'Nested route',
      documentation: '',
      properties: [],
      folderId: diagrams.id,
      childIds: ['hidden-source', 'visible-source', 'visible-target'],
      connectionRouterType: 2,
    };
    diagrams.itemIds.push('view');
    routeModel.nodes['hidden-source'] = {
      id: 'hidden-source',
      viewId: 'view',
      parentId: 'view',
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      childIds: ['hidden-target'],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      content: 'Hidden source',
      properties: [],
    };
    routeModel.nodes['hidden-target'] = {
      id: 'hidden-target',
      viewId: 'view',
      parentId: 'hidden-source',
      bounds: { x: 200, y: 80, width: 100, height: 40 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      content: 'Hidden target',
      properties: [],
    };
    for (const [id, x, y] of [
      ['visible-source', 0, 0],
      ['visible-target', 200, 80],
    ] as const) {
      routeModel.nodes[id] = {
        id,
        viewId: 'view',
        parentId: 'view',
        bounds: { x, y, width: 100, height: 40 },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'note',
        content: id,
        properties: [],
      };
    }
    attachConnection(
      routeModel,
      endpointConnection('hidden', 'hidden-source', 'hidden-target'),
    );
    attachConnection(
      routeModel,
      endpointConnection('visible', 'visible-source', 'visible-target'),
    );

    const previousSettings = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    try {
      replaceModel(routeModel, null);
      const markup = renderToStaticMarkup(
        createElement('svg', null, createElement(StaticViewContent, {
          model: routeModel,
          viewId: 'view',
        })),
      );
      const visible = new JView('view').connections()
        .find((connection) => connection.id === 'visible')!;

      expect(markup).not.toContain('data-conn-id="hidden"');
      expect(markup).toContain('d="M100,40 L100,60 L200,60 L200,80"');
      expect(visible.routedPoints()).toEqual([
        { x: 100, y: 40 },
        { x: 100, y: 60 },
        { x: 200, y: 60 },
        { x: 200, y: 80 },
      ]);
    } finally {
      useSettingsStore.setState({ settings: previousSettings });
    }
  });

  it('applies bulk view layout with absolute bounds and routes in one transaction', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const rel = addRelationship('AssignmentRelationship', actor, role)!;
    const viewId = addView('Layout');
    const groupId = addGroupToView(viewId, viewId, { x: 100, y: 100, width: 300, height: 200 }, 'Container');
    const actorNodeId = addElementNodeToView(
      viewId,
      actor,
      groupId,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      role,
      viewId,
      { x: 500, y: 100, width: 120, height: 55 },
      false,
    );
    const connId = addConnectionToView(viewId, rel, actorNodeId, roleNodeId);
    const undoBefore = useStore.getState().undoStack.length;

    new JView(viewId).layout({
      nodes: {
        [groupId]: { x: 40, y: 50, width: 320, height: 180 },
        [actorNodeId]: { x: 70, y: 85, width: 140 },
        [roleNodeId]: { x: 300, y: 90, height: 60 },
      },
      connections: {
        [connId]: { route: [{ x: 220, y: 100 }] },
      },
    });

    const m = model();
    expect(m.nodes[groupId].bounds).toEqual({ x: 40, y: 50, width: 320, height: 180 });
    expect(m.nodes[actorNodeId].bounds).toEqual({ x: 30, y: 35, width: 140, height: 55 });
    expect(m.nodes[roleNodeId].bounds).toEqual({ x: 300, y: 90, width: 120, height: 60 });
    const route = new JView(viewId).connections()[0].absoluteRoute();
    expect(route[0].x).toBeCloseTo(220);
    expect(route[0].y).toBeCloseTo(100.25);
    expect(useStore.getState().undoStack).toHaveLength(undoBefore + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Layout View');
  });

  it('applies dependent absolute routes against earlier routes in the same layout', () => {
    replaceModel(connectionEndpointModel(), null);
    const view = new JView('view');

    view.layout({
      connections: {
        base: { route: [{ x: 150, y: 100 }] },
        dependent: { route: [{ x: 140, y: 120 }] },
      },
    });

    const byId = new Map(view.connections().map((connection) => [connection.id, connection]));
    expect(byId.get('base')!.absoluteRoute()).toEqual([{ x: 150, y: 100 }]);
    expect(byId.get('dependent')!.absoluteRoute()).toEqual([{ x: 140, y: 120 }]);
  });

  it('applies routes after transitive endpoint route dependencies regardless of input order', () => {
    const source = connectionEndpointModel();
    source.nodes['node-d'] = {
      id: 'node-d',
      viewId: 'view',
      parentId: 'view',
      bounds: { x: 300, y: 160, width: 100, height: 40 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      content: 'D',
      properties: [],
    };
    source.views.view.childIds.push('node-d');
    attachConnection(source, endpointConnection('top', 'dependent', 'node-d'));
    replaceModel(source, null);
    const view = new JView('view');

    view.layout({
      connections: {
        top: { route: [{ x: 240, y: 120 }] },
        base: { route: [{ x: 150, y: 100 }] },
      },
    });

    const byId = new Map(view.connections().map((connection) => [connection.id, connection]));
    expect(byId.get('base')!.absoluteRoute()).toEqual([{ x: 150, y: 100 }]);
    expect(byId.get('top')!.absoluteRoute()).toEqual([{ x: 240, y: 120 }]);
  });

  it('returns only stored logical bendpoints for self-loop absolute routes', () => {
    const source = connectionEndpointModel();
    attachConnection(source, endpointConnection('self', 'node-a', 'node-a'));
    replaceModel(source, null);

    const self = new JView('view').connections().find((connection) => connection.id === 'self')!;

    expect(self.absoluteRoute()).toEqual([]);
  });

  it('rejects invalid bulk layout input without partial mutation', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const rel = addRelationship('AssignmentRelationship', actor, role)!;
    const viewId = addView('Layout');
    const otherViewId = addView('Other');
    const actorNodeId = addElementNodeToView(
      viewId,
      actor,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      role,
      viewId,
      { x: 300, y: 10, width: 120, height: 55 },
      false,
    );
    const otherNodeId = addElementNodeToView(
      otherViewId,
      actor,
      otherViewId,
      { x: 1, y: 1, width: 120, height: 55 },
      false,
    );
    const connId = addConnectionToView(viewId, rel, actorNodeId, roleNodeId);
    const before = model();
    const view = new JView(viewId);

    expect(() => view.layout({ nodes: { [otherNodeId]: { x: 99 } } })).toThrow(/not in view/);
    expect(() =>
      view.layout({ connections: { [connId]: { route: [{ x: Number.NaN, y: 5 }] } } }),
    ).toThrow(/finite/);
    expect(() =>
      view.layout({ connections: { [connId]: { route: [], bendpoints: [] } } }),
    ).toThrow(/route.*bendpoints/);
    expect(model()).toEqual(before);
  });

  it('supports exit() and reports script errors', () => {
    const { logs, error } = run(`
      console.log("before");
      exit();
      console.log("after");
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual(['log:before']);
    const bad = run(`nonsense.unknown()`);
    expect(bad.error).toContain('nonsense');
  });

  it('folder navigation from model', () => {
    const { logs } = run(`
      var folders = $("folder");
      console.log(folders.size());
      var business = folders.filter(".Business").first();
      var a = model.createElement("business-actor", "Bob", business);
      console.log($(".Bob").parent().first().name);
    `);
    expect(logs).toEqual(['log:9', 'log:Business']);
  });

  it('runs the built-in elaborate capability test script', () => {
    const { error, logs } = run(JARCHI_CAPABILITY_TEST_SCRIPT);

    expect(error).toBeUndefined();
    expect(logs.some((line) => line.startsWith('log:RESULT: PASS'))).toBe(true);
    expect(logs.some((line) => line.includes('FAIL:'))).toBe(false);
    expect(logs.some((line) => line.includes('SKIP:'))).toBe(false);
    expect(Object.keys(model().elements).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(model().relationships).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(model().views)).toHaveLength(1);
    expect(Object.keys(model().nodes).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(model().connections).length).toBeGreaterThanOrEqual(3);
  });
});
