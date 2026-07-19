import { describe, expect, it } from 'vitest';
import {
  applyHeatmapToView,
  applyPackedMapLayout,
  buildPackedMapView,
  syncPackedMapView,
} from '../src/model/ops/capability-map';
import {
  addElement,
  addRelationship,
  createEmptyModel,
  deleteItems,
  setNodeStyle,
  setProperties,
} from '../src/model/ops';
import { layoutView } from '../src/model/ops/layout';
import { createModelStore, redo, undo, type ModelStore } from '../src/model/store';
import type { ElementNode, GroupNode, ModelState } from '../src/model/types';

interface Fixture {
  store: ModelStore;
  root: string;
  claims: string;
  billing: string;
  fraud: string;
  service: string;
}

/** Root -> {Claims -> {Fraud}, Billing, Service} via compositions. */
function fixture(): Fixture {
  const store = createModelStore({ model: createEmptyModel('BCM') });
  const root = addElement('Capability', 'Insurance', undefined, store);
  const claims = addElement('Capability', 'Claims', undefined, store);
  const billing = addElement('Capability', 'Billing', undefined, store);
  const fraud = addElement('Capability', 'Fraud Detection', undefined, store);
  const service = addElement('Capability', 'Servicing', undefined, store);
  addRelationship('CompositionRelationship', root, claims, '', undefined, store);
  addRelationship('CompositionRelationship', root, billing, '', undefined, store);
  addRelationship('CompositionRelationship', root, service, '', undefined, store);
  addRelationship('CompositionRelationship', claims, fraud, '', undefined, store);
  return { store, root, claims, billing, fraud, service };
}

function model(store: ModelStore): ModelState {
  return store.getState().model!;
}

function nodeFor(store: ModelStore, viewId: string, elementId: string): ElementNode {
  const found = Object.values(model(store).nodes).find(
    (node): node is ElementNode =>
      node.viewId === viewId && node.nodeType === 'element' && node.elementId === elementId,
  );
  if (!found) throw new Error(`No node for element ${elementId}`);
  return found;
}

describe('buildPackedMapView', () => {
  it('creates a nested packed view in one undo step with no connections', () => {
    const { store, root, claims, fraud, billing } = fixture();
    const before = store.getState().undoStack.length;
    const result = buildPackedMapView(store, {
      rootIds: [root], name: 'Capability Map', open: false,
    });

    const m = model(store);
    const view = m.views[result.viewId];
    expect(view.name).toBe('Capability Map');
    expect(m.folders[view.folderId].itemIds).toContain(result.viewId);
    expect(result.elementIds).toHaveLength(5);
    expect(Object.values(m.connections)).toHaveLength(0);

    const rootNode = nodeFor(store, result.viewId, root);
    const claimsNode = nodeFor(store, result.viewId, claims);
    const fraudNode = nodeFor(store, result.viewId, fraud);
    expect(rootNode.parentId).toBe(result.viewId);
    expect(claimsNode.parentId).toBe(rootNode.id);
    expect(fraudNode.parentId).toBe(claimsNode.id);
    expect(claimsNode.bounds.x).toBeGreaterThan(0);
    expect(claimsNode.bounds.x + claimsNode.bounds.width)
      .toBeLessThanOrEqual(rootNode.bounds.width);

    // Leaves keep the standard element size.
    const billingNode = nodeFor(store, result.viewId, billing);
    expect(billingNode.bounds.width).toBe(120);
    expect(billingNode.bounds.height).toBe(55);

    expect(store.getState().undoStack).toHaveLength(before + 1);
    undo(store);
    expect(model(store).views[result.viewId]).toBeUndefined();
    redo(store);
    expect(model(store).views[result.viewId]).toBeDefined();
  });

  it('applies per-level styling with a luminance ramp and top-positioned parent labels', () => {
    const { store, root, claims, fraud } = fixture();
    const result = buildPackedMapView(store, { rootIds: [root], open: false });
    const rootNode = nodeFor(store, result.viewId, root);
    const claimsNode = nodeFor(store, result.viewId, claims);
    const fraudNode = nodeFor(store, result.viewId, fraud);

    expect(rootNode.fillColor).toBe('#f5deaa');
    expect(claimsNode.fillColor).not.toBe(rootNode.fillColor);
    expect(fraudNode.fillColor).not.toBe(claimsNode.fillColor);
    expect(rootNode.textPosition).toBe(0);
    expect(claimsNode.textPosition).toBe(0);
    expect(fraudNode.textPosition).toBe(1);
    expect(rootNode.fontStyle?.sizePt).toBe(12);
    expect(rootNode.fontStyle?.bold).toBe(true);
    expect(fraudNode.fontStyle?.bold).toBe(false);
    expect(rootNode.iconVisible).toBe(2);
  });

  it('skips styling when applyStyling is false', () => {
    const { store, root } = fixture();
    const result = buildPackedMapView(store, {
      rootIds: [root], open: false, style: { applyStyling: false },
    });
    const rootNode = nodeFor(store, result.viewId, root);
    expect(rootNode.fillColor).toBeUndefined();
    expect(rootNode.fontStyle).toBeUndefined();
  });

  it('sizes leaves by a weight property in treemap mode', () => {
    const { store, root, billing, service } = fixture();
    setProperties(billing, [{ key: 'headcount', value: '9' }], store);
    setProperties(service, [{ key: 'headcount', value: '1' }], store);
    const result = buildPackedMapView(store, {
      rootIds: [root],
      open: false,
      weightProperty: 'headcount',
      layout: { mode: 'treemap', sort: 'weight' },
    });
    const area = (elementId: string) => {
      const { bounds } = nodeFor(store, result.viewId, elementId);
      return bounds.width * bounds.height;
    };
    expect(area(billing)).toBeGreaterThan(area(service) * 3);
  });
});

describe('applyPackedMapLayout', () => {
  it('repacks distorted bounds while preserving sibling order and root position', () => {
    const { store, root, billing } = fixture();
    const result = buildPackedMapView(store, { rootIds: [root], open: false });
    const rootNode = nodeFor(store, result.viewId, root);
    const orderBefore = [...rootNode.childIds];

    const billingNode = nodeFor(store, result.viewId, billing);
    // Distort: move the root and blow up one leaf.
    layoutView([
      { id: rootNode.id, bounds: { ...rootNode.bounds, x: 400, y: 300 } },
      { id: billingNode.id, bounds: { ...billingNode.bounds, width: 500, height: 300 } },
    ], [], store);

    const outcome = applyPackedMapLayout(store, result.viewId);
    expect(outcome.nodeCount).toBeGreaterThan(0);
    const repackedRoot = nodeFor(store, result.viewId, root);
    const repackedBilling = nodeFor(store, result.viewId, billing);
    expect(repackedRoot.bounds.x).toBe(400);
    expect(repackedRoot.bounds.y).toBe(300);
    expect(repackedRoot.childIds).toEqual(orderBefore);
    expect(repackedBilling.bounds.width).toBe(120);
    expect(repackedBilling.bounds.height).toBe(55);
  });
});

describe('syncPackedMapView', () => {
  it('adds, removes, and reparents in one undo step while preserving survivor styling', () => {
    const { store, root, claims, billing, fraud } = fixture();
    const result = buildPackedMapView(store, { rootIds: [root], open: false });
    const claimsNode = nodeFor(store, result.viewId, claims);
    setNodeStyle([claimsNode.id], { fillColor: '#123456' }, store);

    // Model changes: new child under root, Fraud moves Claims -> Billing,
    // Servicing leaves the hierarchy.
    const analytics = addElement('Capability', 'Analytics', undefined, store);
    addRelationship('CompositionRelationship', root, analytics, '', undefined, store);
    const fraudRel = Object.values(model(store).relationships).find(
      (rel) => rel.sourceId === claims && rel.targetId === fraud,
    )!;
    deleteItems([fraudRel.id], store);
    addRelationship('CompositionRelationship', billing, fraud, '', undefined, store);
    const servicingRel = Object.values(model(store).relationships).find(
      (rel) => model(store).elements[rel.targetId]?.name === 'Servicing',
    )!;
    deleteItems([servicingRel.id], store);

    const before = store.getState().undoStack.length;
    const outcome = syncPackedMapView(store, result.viewId);
    expect(outcome).toEqual({ added: 1, removed: 1, reparented: 1 });
    expect(store.getState().undoStack).toHaveLength(before + 1);

    const syncedFraud = nodeFor(store, result.viewId, fraud);
    const billingNode = nodeFor(store, result.viewId, billing);
    expect(syncedFraud.parentId).toBe(billingNode.id);
    expect(nodeFor(store, result.viewId, claims).fillColor).toBe('#123456');
    expect(nodeFor(store, result.viewId, analytics).id).toBeDefined();
    expect(Object.values(model(store).nodes).filter(
      (node) => node.viewId === result.viewId && node.nodeType === 'element',
    )).toHaveLength(5);
  });

  it('inserts new children at their name-sorted position among survivors', () => {
    const { store, root } = fixture();
    const result = buildPackedMapView(store, { rootIds: [root], open: false });
    const alpha = addElement('Capability', 'Alpha', undefined, store);
    addRelationship('CompositionRelationship', root, alpha, '', undefined, store);
    syncPackedMapView(store, result.viewId);
    const rootNode = nodeFor(store, result.viewId, root);
    const childNames = rootNode.childIds.map((id) => {
      const child = model(store).nodes[id] as ElementNode;
      return model(store).elements[child.elementId].name;
    });
    expect(childNames[0]).toBe('Alpha');
  });
});

describe('applyHeatmapToView', () => {
  it('paints a numeric scale and builds a bucket legend', () => {
    const { store, root, claims, billing, service } = fixture();
    setProperties(claims, [{ key: 'maturity', value: '1' }], store);
    setProperties(billing, [{ key: 'maturity', value: '5' }], store);
    const result = buildPackedMapView(store, { rootIds: [root], open: false });

    const outcome = applyHeatmapToView(store, result.viewId, {
      property: 'maturity',
      missingColor: '#dddddd',
    });
    expect(outcome.painted).toBeGreaterThanOrEqual(2);
    expect(outcome.missing).toBeGreaterThan(0);
    expect(outcome.buckets.at(-1)?.label).toBe('No data');

    expect(nodeFor(store, result.viewId, claims).fillColor).toBe('#d64550');
    expect(nodeFor(store, result.viewId, billing).fillColor).toBe('#4c9f70');
    expect(nodeFor(store, result.viewId, service).fillColor).toBe('#dddddd');

    const legend = Object.values(model(store).nodes).find(
      (node): node is GroupNode =>
        node.viewId === result.viewId && node.nodeType === 'group',
    );
    expect(legend?.name).toBe('Heat map: maturity');
    expect(legend?.childIds.length).toBe(outcome.buckets.length);

    // Re-running replaces the legend instead of stacking a second one.
    applyHeatmapToView(store, result.viewId, {
      property: 'maturity', missingColor: '#dddddd',
    });
    expect(Object.values(model(store).nodes).filter(
      (node) => node.viewId === result.viewId && node.nodeType === 'group',
    )).toHaveLength(1);
  });

  it('falls back to categorical colors for enum values', () => {
    const { store, root, claims, billing } = fixture();
    setProperties(claims, [{ key: 'status', value: 'core' }], store);
    setProperties(billing, [{ key: 'status', value: 'emerging' }], store);
    const result = buildPackedMapView(store, { rootIds: [root], open: false });
    const outcome = applyHeatmapToView(store, result.viewId, {
      property: 'status', legend: false,
    });
    expect(outcome.buckets.map((bucket) => bucket.label)).toEqual(['core', 'emerging']);
    expect(nodeFor(store, result.viewId, claims).fillColor)
      .not.toBe(nodeFor(store, result.viewId, billing).fillColor);
    expect(Object.values(model(store).nodes).some(
      (node) => node.viewId === result.viewId && node.nodeType === 'group',
    )).toBe(false);
  });
});
