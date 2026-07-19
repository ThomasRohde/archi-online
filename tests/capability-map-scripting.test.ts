import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel, undo } from '../src/model/store';
import {
  ARCHI_ONLINE_CAPABILITY_MAP_SCRIPT,
  CAPABILITY_MAP_SCRIPT,
} from '../src/scripting/example-scripts';
import { runScript, type ConsoleEntry } from '../src/scripting/runner';
import { useStore } from '../src/ui/store-hooks';

function run(code: string): { error?: string; logs: string[] } {
  const logs: string[] = [];
  const result = runScript(code, (entry: ConsoleEntry) => logs.push(`${entry.level}:${entry.text}`));
  return { ...result, logs };
}

const SEED = `
  var root = model.createElement("capability", "Insurance");
  var claims = model.createElement("capability", "Claims");
  var billing = model.createElement("capability", "Billing");
  var fraud = model.createElement("capability", "Fraud Detection");
  model.createRelationship("composition-relationship", "", root, claims);
  model.createRelationship("composition-relationship", "", root, billing);
  model.createRelationship("composition-relationship", "", claims, fraud);
`;

beforeEach(() => replaceModel(createEmptyModel('Capability script'), null));

describe('packed capability-map scripting', () => {
  it('builds a styled packed map with a heat map in one script undo step', () => {
    const { error, logs } = run(`
      ${SEED}
      claims.prop("maturity", "1");
      billing.prop("maturity", "5");
      var view = model.createPackedView({ roots: root, name: "BCM", open: false });
      var visuals = view.nodes({ recursive: true });
      var rootVisual = visuals.filter(function (v) { return v.name === "Insurance"; })[0];
      var fraudVisual = visuals.filter(function (v) { return v.name === "Fraud Detection"; })[0];
      console.log(view.name, visuals.length, rootVisual.children().length);
      console.log(rootVisual.textPosition, fraudVisual.textPosition, rootVisual.fontStyle);
      var heat = view.applyHeatmap({ property: "maturity", missingColor: "#dddddd" });
      console.log(heat.painted, heat.missing, heat.buckets.length > 0);
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:BCM 4 2',
      'log:0 1 bold',
      'log:4 2 true',
    ]);
    expect(useStore.getState().undoStack).toHaveLength(1);
    const model = useStore.getState().model!;
    expect(Object.keys(model.views)).toHaveLength(1);
    expect(Object.values(model.connections)).toHaveLength(0);
    undo();
    expect(Object.keys(useStore.getState().model!.views)).toHaveLength(0);
  });

  it('repacks distorted bounds and syncs new children from a script', () => {
    const { error, logs } = run(`
      ${SEED}
      var view = model.createPackedView({ roots: root, open: false });
      var billingVisual = view.nodes({ recursive: true })
        .filter(function (v) { return v.name === "Billing"; })[0];
      billingVisual.bounds = { width: 500, height: 300 };
      var packed = view.layoutPacked();
      console.log(packed.nodeCount > 0, billingVisual.bounds.width, billingVisual.bounds.height);
      var analytics = model.createElement("capability", "Analytics");
      model.createRelationship("composition-relationship", "", root, analytics);
      var sync = view.syncPacked();
      console.log(sync.added, sync.removed, sync.reparented);
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:true 120 55',
      'log:1 0 0',
    ]);
  });

  it('round-trips the new style accessors and rejects invalid values', () => {
    const { error, logs } = run(`
      ${SEED}
      var view = model.createPackedView({ roots: root, open: false });
      var visual = view.nodes()[0];
      visual.fontSize = 14;
      visual.fontName = "Arial";
      visual.fontStyle = "bolditalic";
      visual.textAlignment = 1;
      visual.textPosition = 2;
      visual.figureType = 1;
      visual.iconVisible = 1;
      console.log(visual.fontSize, visual.fontName, visual.fontStyle);
      console.log(visual.textAlignment, visual.textPosition, visual.figureType, visual.iconVisible);
      try { visual.textAlignment = 3; } catch (e) { console.log("rejected"); }
    `);
    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:14 Arial bolditalic',
      'log:1 2 1 1',
      'log:rejected',
    ]);
  });

  it('runs the built-in capability map example script on an empty model', () => {
    const { error, logs } = run(CAPABILITY_MAP_SCRIPT);
    expect(error).toBeUndefined();
    expect(logs[0]).toContain('creating a demo hierarchy');
    const model = useStore.getState().model!;
    const views = Object.values(model.views);
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe('Capability Map');
    expect(Object.values(model.nodes).filter(
      (node) => node.nodeType === 'element' && node.viewId === views[0].id,
    ).length).toBe(10);
  });

  it('runs the built-in Archi Online capability map script idempotently', () => {
    const first = run(ARCHI_ONLINE_CAPABILITY_MAP_SCRIPT);
    expect(first.error).toBeUndefined();
    expect(first.logs[0]).toBe('log:Created 50 capabilities.');
    const second = run(ARCHI_ONLINE_CAPABILITY_MAP_SCRIPT);
    expect(second.error).toBeUndefined();
    expect(second.logs[0]).toContain('Reusing the existing');
    const model = useStore.getState().model!;
    const viewNames = Object.values(model.views).map((view) => view.name).sort();
    expect(viewNames).toEqual([
      'Archi Online — Capability Map',
      'Archi Online — Investment Treemap',
    ]);
    expect(Object.keys(model.elements)).toHaveLength(50);
  });

  it('re-running the built-in script syncs the existing view instead of duplicating it', () => {
    run(CAPABILITY_MAP_SCRIPT);
    const second = run(CAPABILITY_MAP_SCRIPT);
    expect(second.error).toBeUndefined();
    expect(second.logs.some((line) => line.includes('Synced existing map'))).toBe(true);
    const model = useStore.getState().model!;
    expect(Object.values(model.views)).toHaveLength(1);
    expect(Object.values(model.nodes).filter(
      (node) => node.nodeType === 'element',
    ).length).toBe(10);
  });
});
