import {
  deriveCompositionTree,
  type CompositionTreeNode,
} from '../composition-tree';
import {
  layoutPackedTree,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../layout/packed-tree';
import {
  categoricalColorScale,
  deriveLevelFills,
  numericColorScale,
  type HeatmapBucket,
} from '../color-scale';
import { ELEMENT_TYPE_MAP, type ElementType, type RelationshipType } from '../metamodel';
import { newId } from '../id';
import { compareStableText } from '../stable-order';
import {
  openView,
  transact,
  transactWithSelection,
  type ModelStore,
} from '../store';
import type {
  Bounds,
  DiagramView,
  ElementNode,
  FontStyle,
  GroupNode,
  ModelState,
  NoteNode,
} from '../types';
import { defaultFolderId } from './concepts';
import { attachNode, deleteNodeFromDraft } from './draft';
import { layoutView, type DiagramNodeLayoutUpdate } from './layout';
import { applyMoveEntriesToDraft, type MoveEntry } from './movement';

export interface PackedMapStyle {
  /** Explicit per-depth fills; otherwise a luminance ramp derived from baseFill. */
  levelFills?: readonly string[];
  /** Level-0 fill; defaults to the root element type's layer fill. */
  baseFill?: string;
  /** Font size in points per depth; deeper levels clamp to the last entry. */
  fontSizes?: readonly number[];
  parentTextAlignment?: number;
  parentTextPosition?: number;
  leafTextAlignment?: number;
  leafTextPosition?: number;
  iconVisible?: 0 | 1 | 2;
  /** false = geometry only, no style fields are written. */
  applyStyling?: boolean;
}

export interface PackedMapOptions {
  rootIds: readonly string[];
  elementTypes?: readonly ElementType[];
  relationshipTypes?: readonly RelationshipType[];
  depth?: number;
  direction?: 'source-is-parent' | 'target-is-parent';
  /** Element property parsed as a number for treemap weights. */
  weightProperty?: string;
  layout?: PackedTreeOptions;
  style?: PackedMapStyle;
}

export interface PackedMapBuildOptions extends PackedMapOptions {
  name?: string;
  open?: boolean;
}

export interface PackedMapBuildResult {
  viewId: string;
  nodeIds: string[];
  elementIds: string[];
  duplicates: Record<string, string[]>;
  size: { width: number; height: number };
}

export interface PackedMapRelayoutOptions {
  scopeNodeIds?: readonly string[];
  weightProperty?: string;
  layout?: PackedTreeOptions;
}

export interface PackedMapRelayoutResult {
  nodeCount: number;
  size: { width: number; height: number };
}

export interface PackedMapSyncOptions extends Omit<PackedMapOptions, 'rootIds'> {
  /** Defaults to the elements of the view's top-level element nodes. */
  rootIds?: readonly string[];
}

export interface PackedMapSyncResult {
  added: number;
  removed: number;
  reparented: number;
}

const DEFAULT_FONT_SIZES: readonly number[] = [12, 11, 10, 9];
const FONT_FAMILY = 'Segoe UI';

function requireModel(store: ModelStore): ModelState {
  const state = store.getState();
  if (!state.model) throw new Error('No model is open');
  if (state.readOnly) throw new Error('The model is read-only');
  return state.model;
}

function propertyNumber(
  model: ModelState,
  elementId: string,
  key: string,
): number | undefined {
  const property = model.elements[elementId]?.properties.find((p) => p.key === key);
  const parsed = property ? Number.parseFloat(property.value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Title band derived from the top-level font so container labels never collide with children. */
function withDerivedTitleBand(
  layout: PackedTreeOptions | undefined,
  style: PackedMapStyle | undefined,
): PackedTreeOptions {
  if (layout?.titleBandHeight !== undefined || style?.applyStyling === false) {
    return layout ?? {};
  }
  const topSize = style?.fontSizes?.[0] ?? DEFAULT_FONT_SIZES[0];
  return { ...layout, titleBandHeight: Math.ceil((topSize * 96) / 72) + 14 };
}

interface LevelStyler {
  (depth: number, isParent: boolean): Partial<ElementNode>;
}

function createLevelStyler(
  style: PackedMapStyle | undefined,
  rootType: ElementType | undefined,
  maxDepth: number,
): LevelStyler {
  if (style?.applyStyling === false) return () => ({});
  const baseFill = style?.baseFill ??
    (rootType ? ELEMENT_TYPE_MAP[rootType]?.fill : undefined) ?? '#ffffff';
  const fills = style?.levelFills?.length
    ? style.levelFills
    : deriveLevelFills(baseFill, maxDepth + 1);
  const sizes = style?.fontSizes?.length ? style.fontSizes : DEFAULT_FONT_SIZES;
  const at = <T>(values: readonly T[], depth: number) =>
    values[Math.min(depth, values.length - 1)];
  return (depth, isParent) => {
    const fontStyle: FontStyle = {
      family: FONT_FAMILY,
      sizePt: at(sizes, depth),
      bold: depth <= 1,
      italic: false,
    };
    return {
      fillColor: at(fills, depth),
      fontStyle,
      textAlignment: isParent
        ? style?.parentTextAlignment ?? 2
        : style?.leafTextAlignment ?? 2,
      textPosition: isParent
        ? style?.parentTextPosition ?? 0
        : style?.leafTextPosition ?? 1,
      iconVisible: style?.iconVisible ?? 2,
    };
  };
}

function createElementNode(
  id: string,
  viewId: string,
  parentId: string,
  elementId: string,
  bounds: Bounds,
  styleFields: Partial<ElementNode>,
): ElementNode {
  return {
    id,
    viewId,
    parentId,
    nodeType: 'element',
    elementId,
    bounds: { ...bounds },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    ...styleFields,
  };
}

function toPackedNode(
  model: ModelState,
  node: CompositionTreeNode,
  weightProperty: string | undefined,
): PackedTreeNode {
  const weight = weightProperty
    ? propertyNumber(model, node.elementId, weightProperty)
    : undefined;
  return {
    id: node.elementId,
    name: model.elements[node.elementId]?.name ?? '',
    ...(weight !== undefined ? { weight } : {}),
    ...(node.children.length > 0
      ? { children: node.children.map((child) => toPackedNode(model, child, weightProperty)) }
      : {}),
  };
}

/** Top-to-bottom, left-to-right — matches how the packed layout reads. */
function readingOrder(
  bounds: Record<string, Bounds>,
  idOf: (node: CompositionTreeNode) => string,
) {
  return (a: CompositionTreeNode, b: CompositionTreeNode) => {
    const left = bounds[idOf(a)];
    const right = bounds[idOf(b)];
    return left.y - right.y || left.x - right.x || compareStableText(idOf(a), idOf(b));
  };
}

/**
 * Generate a new view with the derived hierarchy as packed nested rectangles.
 * No connections are added — nesting is the notation.
 */
export function buildPackedMapView(
  store: ModelStore,
  options: PackedMapBuildOptions,
): PackedMapBuildResult {
  const model = requireModel(store);
  const tree = deriveCompositionTree(model, {
    rootIds: options.rootIds,
    elementTypes: options.elementTypes,
    relationshipTypes: options.relationshipTypes,
    depth: options.depth,
    direction: options.direction,
  });
  if (tree.roots.length === 0) {
    throw new Error('Select at least one element to build a capability map');
  }
  const packedRoots = tree.roots.map((node) =>
    toPackedNode(model, node, options.weightProperty));
  const packed = layoutPackedTree(
    packedRoots,
    withDerivedTitleBand(options.layout, options.style),
  );

  let maxDepth = 0;
  const walkDepth = (node: CompositionTreeNode) => {
    maxDepth = Math.max(maxDepth, node.depth);
    node.children.forEach(walkDepth);
  };
  tree.roots.forEach(walkDepth);
  const rootType = model.elements[tree.roots[0].elementId]?.type;
  const styler = createLevelStyler(options.style, rootType, maxDepth);

  const viewId = newId();
  const view: DiagramView = {
    id: viewId,
    kind: 'view',
    name: options.name?.trim() || 'Capability Map',
    documentation: '',
    properties: [],
    folderId: defaultFolderId(model, 'diagrams'),
    childIds: [],
  };
  const nodes: ElementNode[] = [];
  const order = readingOrder(packed.nodes, (node) => node.elementId);
  const visit = (node: CompositionTreeNode, parentRef: string) => {
    const id = newId();
    nodes.push(createElementNode(
      id,
      viewId,
      parentRef,
      node.elementId,
      packed.nodes[node.elementId],
      styler(node.depth, node.children.length > 0),
    ));
    for (const child of [...node.children].sort(order)) visit(child, id);
  };
  for (const root of [...tree.roots].sort(order)) visit(root, viewId);

  transactWithSelection('Generate Capability Map', (draft) => {
    draft.views[view.id] = view;
    draft.folders[view.folderId].itemIds.push(view.id);
    for (const node of nodes) attachNode(draft, node);
  }, { source: 'tree', ids: [viewId] }, store);
  if (options.open !== false) openView(viewId, store);
  return {
    viewId,
    nodeIds: nodes.map((node) => node.id),
    elementIds: tree.elementIds,
    duplicates: tree.duplicates,
    size: packed.size,
  };
}

/**
 * Repack the view's existing element-node nesting. Sibling order follows the
 * current z-order (`sort: 'none'`), so manual arrangement survives repacks;
 * scope roots keep their position and only grow or shrink.
 */
export function applyPackedMapLayout(
  store: ModelStore,
  viewId: string,
  options: PackedMapRelayoutOptions = {},
): PackedMapRelayoutResult {
  const model = requireModel(store);
  const view = model.views[viewId];
  if (!view) throw new Error(`Unknown view: ${viewId}`);
  const isElementNode = (id: string) => model.nodes[id]?.nodeType === 'element';

  let rootNodeIds: string[];
  if (options.scopeNodeIds?.length) {
    const scoped = options.scopeNodeIds.filter((id) => {
      const node = model.nodes[id];
      return node?.viewId === viewId && node.nodeType === 'element';
    });
    const scopedSet = new Set(scoped);
    rootNodeIds = scoped.filter((id) => {
      for (
        let parentId = model.nodes[id].parentId;
        model.nodes[parentId];
        parentId = model.nodes[parentId].parentId
      ) {
        if (scopedSet.has(parentId)) return false;
      }
      return true;
    });
  } else {
    rootNodeIds = view.childIds.filter(isElementNode);
  }
  if (rootNodeIds.length === 0) return { nodeCount: 0, size: { width: 0, height: 0 } };

  const toPacked = (nodeId: string): PackedTreeNode => {
    const node = model.nodes[nodeId] as ElementNode;
    const weight = options.weightProperty
      ? propertyNumber(model, node.elementId, options.weightProperty)
      : undefined;
    const children = node.childIds.filter(isElementNode).map(toPacked);
    return {
      id: nodeId,
      name: model.elements[node.elementId]?.name ?? '',
      ...(weight !== undefined ? { weight } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  };
  const packed = layoutPackedTree(
    rootNodeIds.map(toPacked),
    { sort: 'none', ...options.layout },
  );
  const rootSet = new Set(rootNodeIds);
  const updates: DiagramNodeLayoutUpdate[] = Object.entries(packed.nodes).map(
    ([id, bounds]) => rootSet.has(id)
      ? {
        id,
        bounds: {
          x: model.nodes[id].bounds.x,
          y: model.nodes[id].bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      }
      : { id, bounds },
  );
  layoutView(updates, [], store);
  return { nodeCount: updates.length, size: packed.size };
}

/**
 * Reconcile an existing packed map with the model: add missing children,
 * remove stale occurrences, reparent survivors, then repack. Surviving nodes
 * keep their styling and their relative sibling order; new children are
 * inserted at their name-sorted position (stable mental map).
 */
export function syncPackedMapView(
  store: ModelStore,
  viewId: string,
  options: PackedMapSyncOptions = {},
): PackedMapSyncResult {
  const model = requireModel(store);
  const view = model.views[viewId];
  if (!view) throw new Error(`Unknown view: ${viewId}`);

  const topElementNodes = view.childIds
    .map((id) => model.nodes[id])
    .filter((node): node is ElementNode => node?.nodeType === 'element');
  const rootIds = options.rootIds?.length
    ? [...new Set(options.rootIds)]
    : [...new Set(topElementNodes.map((node) => node.elementId))];
  if (rootIds.length === 0) throw new Error('The view has no element nodes to sync');
  const tree = deriveCompositionTree(model, {
    rootIds,
    elementTypes: options.elementTypes,
    relationshipTypes: options.relationshipTypes,
    depth: options.depth,
    direction: options.direction,
  });
  const desired = new Set(tree.elementIds);

  // The map is the element-node forest hanging off the view's top level;
  // element nodes nested inside groups or notes are out of scope.
  const walked: ElementNode[] = [];
  const nodeByElement = new Map<string, ElementNode>();
  const visitExisting = (nodeId: string) => {
    const node = model.nodes[nodeId];
    if (node?.nodeType !== 'element') return;
    walked.push(node);
    if (!nodeByElement.has(node.elementId)) nodeByElement.set(node.elementId, node);
    node.childIds.forEach(visitExisting);
  };
  view.childIds.forEach(visitExisting);

  const removedNodes = walked.filter((node) =>
    !desired.has(node.elementId) || nodeByElement.get(node.elementId)!.id !== node.id);
  const removedIds = new Set(removedNodes.map((node) => node.id));

  const elementName = (elementId: string) => model.elements[elementId]?.name ?? '';

  /** Survivors already under this parent keep their order; others insert by name. */
  const planSiblings = (
    parentElementId: string | null,
    treeChildren: readonly CompositionTreeNode[],
  ): CompositionTreeNode[] => {
    const byElement = new Map(treeChildren.map((child) => [child.elementId, child]));
    const currentChildIds = parentElementId === null
      ? view.childIds
      : nodeByElement.get(parentElementId)?.childIds ?? [];
    const staying = currentChildIds
      .map((id) => model.nodes[id])
      .filter((node): node is ElementNode =>
        node?.nodeType === 'element' &&
        !removedIds.has(node.id) &&
        byElement.has(node.elementId) &&
        nodeByElement.get(node.elementId) === node)
      .map((node) => node.elementId);
    const order = [...staying];
    const incoming = treeChildren
      .map((child) => child.elementId)
      .filter((elementId) => !staying.includes(elementId))
      .sort((a, b) => compareStableText(elementName(a), elementName(b)) || compareStableText(a, b));
    for (const elementId of incoming) {
      const name = elementName(elementId);
      let index = order.findIndex((existing) => compareStableText(elementName(existing), name) > 0);
      if (index < 0) index = order.length;
      order.splice(index, 0, elementId);
    }
    return order.map((elementId) => byElement.get(elementId)!);
  };

  interface PlannedNode {
    element: CompositionTreeNode;
    nodeId: string;
    parentNodeId: string;
    isNew: boolean;
  }
  const planned: PlannedNode[] = [];
  const plannedChildren = new Map<string, PlannedNode[]>();
  const planVisit = (node: CompositionTreeNode, parentNodeId: string, parentKey: string) => {
    const existing = nodeByElement.get(node.elementId);
    const entry: PlannedNode = {
      element: node,
      nodeId: existing?.id ?? newId(),
      parentNodeId,
      isNew: !existing,
    };
    planned.push(entry);
    const siblings = plannedChildren.get(parentKey) ?? [];
    siblings.push(entry);
    plannedChildren.set(parentKey, siblings);
    for (const child of planSiblings(node.elementId, node.children)) {
      planVisit(child, entry.nodeId, entry.nodeId);
    }
  };
  for (const root of planSiblings(null, tree.roots)) planVisit(root, viewId, viewId);

  // Packed layout over the planned forest in planned sibling order.
  const toPacked = (entry: PlannedNode): PackedTreeNode => {
    const weight = options.weightProperty
      ? propertyNumber(model, entry.element.elementId, options.weightProperty)
      : undefined;
    const children = (plannedChildren.get(entry.nodeId) ?? []).map(toPacked);
    return {
      id: entry.nodeId,
      name: elementName(entry.element.elementId),
      ...(weight !== undefined ? { weight } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  };
  const plannedRoots = plannedChildren.get(viewId) ?? [];
  const packed = layoutPackedTree(
    plannedRoots.map(toPacked),
    { sort: 'none', ...withDerivedTitleBand(options.layout, options.style) },
  );
  const finalBounds = new Map<string, Bounds>();
  for (const entry of planned) {
    const bounds = packed.nodes[entry.nodeId];
    const isRoot = entry.parentNodeId === viewId;
    const existing = entry.isNew ? undefined : nodeByElement.get(entry.element.elementId);
    finalBounds.set(entry.nodeId, isRoot && existing
      ? {
        x: existing.bounds.x,
        y: existing.bounds.y,
        width: bounds.width,
        height: bounds.height,
      }
      : bounds);
  }

  let maxDepth = 0;
  for (const entry of planned) maxDepth = Math.max(maxDepth, entry.element.depth);
  const rootType = model.elements[tree.roots[0]?.elementId]?.type;
  const styler = createLevelStyler(options.style, rootType, maxDepth);

  const additions = planned.filter((entry) => entry.isNew);
  const moves: MoveEntry[] = planned
    .filter((entry) => {
      if (entry.isNew) return false;
      const existing = nodeByElement.get(entry.element.elementId)!;
      return existing.parentId !== entry.parentNodeId;
    })
    .map((entry) => ({
      id: entry.nodeId,
      parentId: entry.parentNodeId,
      bounds: finalBounds.get(entry.nodeId)!,
    }));

  transact('Sync Capability Map', (draft) => {
    // New nodes first so reparent targets exist; planned order is pre-order.
    for (const entry of additions) {
      attachNode(draft, createElementNode(
        entry.nodeId,
        viewId,
        entry.parentNodeId,
        entry.element.elementId,
        finalBounds.get(entry.nodeId)!,
        styler(entry.element.depth, entry.element.children.length > 0),
      ));
    }
    applyMoveEntriesToDraft(draft, moves);
    const deletingNodes = new Set<string>();
    const deletingConnections = new Set<string>();
    for (const id of removedIds) {
      deleteNodeFromDraft(draft, id, deletingNodes, deletingConnections);
    }
    for (const entry of planned) {
      const node = draft.nodes[entry.nodeId];
      if (node) node.bounds = { ...finalBounds.get(entry.nodeId)! };
    }
    // Re-establish planned sibling order (non-element children stay, at the end).
    const applyOrder = (list: string[], parentKey: string) => {
      const orderedIds = (plannedChildren.get(parentKey) ?? []).map((entry) => entry.nodeId);
      const orderedSet = new Set(orderedIds);
      const rest = list.filter((id) => !orderedSet.has(id));
      list.splice(0, list.length, ...orderedIds, ...rest);
    };
    applyOrder(draft.views[viewId].childIds, viewId);
    for (const entry of planned) {
      const node = draft.nodes[entry.nodeId];
      if (node) applyOrder(node.childIds, entry.nodeId);
    }
  }, store);

  return {
    added: additions.length,
    removed: removedNodes.length,
    reparented: moves.length,
  };
}

export interface PackedMapHeatmapOptions {
  /** Element property to color by. */
  property: string;
  /** Scope nodes (expanded to their element descendants); default: whole view. */
  nodeIds?: readonly string[];
  /** auto = numeric iff every present value parses as a finite number. */
  mode?: 'auto' | 'numeric' | 'enum';
  palette?: readonly string[];
  min?: number;
  max?: number;
  /** Fill for elements without a value; unset leaves them untouched. */
  missingColor?: string;
  legend?: { x?: number; y?: number; title?: string } | false;
}

export interface PackedMapHeatmapResult {
  painted: number;
  missing: number;
  buckets: HeatmapBucket[];
}

const LEGEND_WIDTH = 200;
const LEGEND_ROW_HEIGHT = 24;
const LEGEND_ROW_GAP = 6;
const LEGEND_TOP = 28;

/**
 * Color element nodes from an element property. The legend is built from
 * value buckets as a group of colored notes (the built-in legend only renders
 * concept types). Re-running replaces a previous legend with the same title.
 */
export function applyHeatmapToView(
  store: ModelStore,
  viewId: string,
  options: PackedMapHeatmapOptions,
): PackedMapHeatmapResult {
  const model = requireModel(store);
  const view = model.views[viewId];
  if (!view) throw new Error(`Unknown view: ${viewId}`);
  if (!options.property?.trim()) throw new Error('A property name is required');
  const property = options.property.trim();

  const targets: ElementNode[] = [];
  const collect = (nodeId: string) => {
    const node = model.nodes[nodeId];
    if (!node || node.viewId !== viewId) return;
    if (node.nodeType === 'element') targets.push(node);
    node.childIds.forEach(collect);
  };
  (options.nodeIds?.length ? options.nodeIds : view.childIds).forEach(collect);
  if (targets.length === 0) {
    return { painted: 0, missing: 0, buckets: [] };
  }

  const rawFor = (node: ElementNode): string | undefined => {
    const value = model.elements[node.elementId]?.properties
      .find((p) => p.key === property)?.value.trim();
    return value ? value : undefined;
  };
  const present = targets.flatMap((node) => {
    const raw = rawFor(node);
    return raw !== undefined ? [{ node, raw }] : [];
  });
  const missingNodes = targets.filter((node) => rawFor(node) === undefined);

  const numericValues = present.map(({ raw }) => Number.parseFloat(raw));
  const allNumeric = present.length > 0 && numericValues.every(Number.isFinite);
  const mode = options.mode === 'numeric' || options.mode === 'enum'
    ? options.mode
    : allNumeric ? 'numeric' : 'enum';

  const colorByNodeId = new Map<string, string>();
  let buckets: HeatmapBucket[];
  if (mode === 'numeric') {
    const finiteEntries = present.filter((_, i) => Number.isFinite(numericValues[i]));
    const scale = numericColorScale(
      finiteEntries.map(({ raw }) => Number.parseFloat(raw)),
      { min: options.min, max: options.max, palette: options.palette },
    );
    for (const { node, raw } of finiteEntries) {
      colorByNodeId.set(node.id, scale.colorFor(Number.parseFloat(raw)));
    }
    for (const { node, raw } of present) {
      if (!Number.isFinite(Number.parseFloat(raw))) missingNodes.push(node);
    }
    buckets = scale.buckets();
  } else {
    const byValue = categoricalColorScale(
      present.map(({ raw }) => raw),
      options.palette,
    );
    for (const { node, raw } of present) colorByNodeId.set(node.id, byValue.get(raw)!);
    buckets = [...byValue.entries()].map(([label, color]) => ({ label, color }));
  }
  if (options.missingColor && missingNodes.length > 0) {
    for (const node of missingNodes) colorByNodeId.set(node.id, options.missingColor);
    buckets = [...buckets, { label: 'No data', color: options.missingColor }];
  }

  const legendTitle = options.legend === false
    ? null
    : options.legend?.title?.trim() || `Heat map: ${property}`;
  transact('Apply Heat Map', (draft) => {
    for (const [nodeId, color] of colorByNodeId) {
      const node = draft.nodes[nodeId];
      if (node) node.fillColor = color;
    }
    if (legendTitle === null || buckets.length === 0) return;
    const previous = draft.views[viewId].childIds.find((id) => {
      const node = draft.nodes[id];
      return node?.nodeType === 'group' && node.name === legendTitle;
    });
    if (previous) deleteNodeFromDraft(draft, previous);
    // Default placement: just right of the view's top-level extent.
    let maxRight = 0;
    let minTop = 0;
    for (const id of draft.views[viewId].childIds) {
      const bounds = draft.nodes[id]?.bounds;
      if (!bounds) continue;
      maxRight = Math.max(maxRight, bounds.x + bounds.width);
      minTop = Math.min(minTop, bounds.y);
    }
    const legend = options.legend === false ? undefined : options.legend;
    const group: GroupNode = {
      id: newId(),
      viewId,
      parentId: viewId,
      nodeType: 'group',
      name: legendTitle,
      documentation: '',
      properties: [],
      bounds: {
        x: legend?.x ?? maxRight + 24,
        y: legend?.y ?? minTop,
        width: LEGEND_WIDTH,
        height: LEGEND_TOP + buckets.length * (LEGEND_ROW_HEIGHT + LEGEND_ROW_GAP),
      },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
    };
    attachNode(draft, group);
    buckets.forEach((bucket, index) => {
      const note: NoteNode = {
        id: newId(),
        viewId,
        parentId: group.id,
        nodeType: 'note',
        content: bucket.label,
        properties: [],
        bounds: {
          x: 12,
          y: LEGEND_TOP + index * (LEGEND_ROW_HEIGHT + LEGEND_ROW_GAP),
          width: LEGEND_WIDTH - 24,
          height: LEGEND_ROW_HEIGHT,
        },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        fillColor: bucket.color,
        textAlignment: 1,
        borderType: 1,
      };
      attachNode(draft, note);
    });
  }, store);

  return {
    painted: colorByNodeId.size,
    missing: missingNodes.length,
    buckets,
  };
}
