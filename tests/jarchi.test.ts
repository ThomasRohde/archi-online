import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel, undo } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { JView } from '../src/scripting/jarchi';
import { JARCHI_CAPABILITY_TEST_SCRIPT } from '../src/scripting/example-scripts';
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
