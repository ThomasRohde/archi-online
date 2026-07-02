import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel, undo, useStore } from '../src/model/store';
import { runScript, type ConsoleEntry } from '../src/scripting/runner';

function model() {
  return useStore.getState().model!;
}

function run(code: string): { error?: string; logs: string[] } {
  const logs: string[] = [];
  const res = runScript(code, (e: ConsoleEntry) => logs.push(`${e.level}:${e.text}`));
  return { ...res, logs };
}

beforeEach(() => {
  replaceModel(createEmptyModel('Script Test'), null);
});

describe('jArchi scripting API', () => {
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
});
