import { newId } from './id';
import { defaultFolderId, folderForElementType } from './ops/concepts';
import { attachConnection, attachNode } from './ops/draft';
import { transact, type ModelStore } from './store';
import type {
  ArchimateElement,
  ArchimateRelationship,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  ModelState,
} from './types';

export type ModelTransferRootKind = 'element' | 'view' | 'node';

export interface ModelTransferRoot {
  kind: ModelTransferRootKind;
  id: string;
}

export interface ModelTransferBundle {
  sourceSessionId: string;
  kind: 'canvas' | 'tree';
  sourceViewId?: string;
  roots: ModelTransferRoot[];
  elements: ArchimateElement[];
  relationships: ArchimateRelationship[];
  views: DiagramView[];
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export interface PasteTransferOptions {
  targetSessionId: string;
  targetViewId?: string;
  sameModelMode?: 'archi' | 'reference';
  offset?: number;
  at?: { x: number; y: number };
  visualDefaults?: {
    elementSize: (element: ArchimateElement) => { width: number; height: number };
    viewReferenceSize: { width: number; height: number };
    textStyle?: { textAlignment?: number; textPosition?: number };
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCollector(model: ModelState) {
  const elementIds = new Set<string>();
  const relationshipIds = new Set<string>();
  const viewIds = new Set<string>();
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();

  const addConcept = (id: string): void => {
    if (model.elements[id]) {
      elementIds.add(id);
      return;
    }
    const relationship = model.relationships[id];
    if (!relationship || relationshipIds.has(id)) return;
    relationshipIds.add(id);
    addConcept(relationship.sourceId);
    addConcept(relationship.targetId);
  };

  const addNode = (id: string): void => {
    if (nodeIds.has(id)) return;
    const node = model.nodes[id];
    if (!node) return;
    nodeIds.add(id);
    if (node.nodeType === 'element') addConcept(node.elementId);
    if (node.nodeType === 'ref') addView(node.refViewId);
    for (const childId of node.childIds) addNode(childId);
  };

  const addConnectionsForView = (viewId: string): void => {
    for (const connection of Object.values(model.connections)) {
      if (
        connection.viewId !== viewId ||
        !nodeIds.has(connection.sourceId) ||
        !nodeIds.has(connection.targetId)
      ) {
        continue;
      }
      connectionIds.add(connection.id);
      if (connection.relationshipId) addConcept(connection.relationshipId);
    }
  };

  function addView(id: string): void {
    if (viewIds.has(id)) return;
    const view = model.views[id];
    if (!view) return;
    viewIds.add(id);
    for (const childId of view.childIds) addNode(childId);
    addConnectionsForView(id);
  }

  return {
    addConcept,
    addNode,
    addView,
    addConnectionsForView,
    bundle(sourceSessionId: string, kind: ModelTransferBundle['kind'], roots: ModelTransferRoot[]) {
      return {
        sourceSessionId,
        kind,
        roots,
        elements: [...elementIds].map((id) => deepClone(model.elements[id])),
        relationships: [...relationshipIds].map((id) => deepClone(model.relationships[id])),
        views: [...viewIds].map((id) => deepClone(model.views[id])),
        nodes: [...nodeIds].map((id) => deepClone(model.nodes[id])),
        connections: [...connectionIds].map((id) => deepClone(model.connections[id])),
      } satisfies ModelTransferBundle;
    },
  };
}

export function createTreeTransferBundle(
  sourceSessionId: string,
  model: ModelState,
  itemIds: string[],
): ModelTransferBundle {
  const collector = createCollector(model);
  const roots: ModelTransferRoot[] = [];
  for (const id of itemIds) {
    if (model.elements[id]) {
      collector.addConcept(id);
      roots.push({ kind: 'element', id });
    } else if (model.views[id]) {
      collector.addView(id);
      roots.push({ kind: 'view', id });
    }
  }
  return collector.bundle(sourceSessionId, 'tree', roots);
}

export function createCanvasTransferBundle(
  sourceSessionId: string,
  model: ModelState,
  viewId: string,
  selectedIds: string[],
): ModelTransferBundle {
  const selected = new Set(selectedIds.filter((id) => model.nodes[id]?.viewId === viewId));
  const roots = [...selected].filter((id) => {
    let parentId = model.nodes[id]?.parentId;
    while (parentId && model.nodes[parentId]) {
      if (selected.has(parentId)) return false;
      parentId = model.nodes[parentId].parentId;
    }
    return true;
  });
  const drawOrder = new Map<string, number>();
  let drawIndex = 0;
  const visit = (nodeId: string) => {
    drawOrder.set(nodeId, drawIndex++);
    model.nodes[nodeId]?.childIds.forEach(visit);
  };
  model.views[viewId]?.childIds.forEach(visit);
  roots.sort(
    (a, b) =>
      (drawOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (drawOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const collector = createCollector(model);
  roots.forEach(collector.addNode);
  collector.addConnectionsForView(viewId);
  return {
    ...collector.bundle(
    sourceSessionId,
    'canvas',
    roots.map((id) => ({ kind: 'node', id })),
    ),
    sourceViewId: viewId,
  };
}

export function pasteTransferBundle(
  bundle: ModelTransferBundle,
  targetStore: ModelStore,
  options: PasteTransferOptions,
): string[] {
  const targetState = targetStore.getState();
  if (!targetState.model || targetState.readOnly) return [];
  if (options.targetViewId && !targetState.model.views[options.targetViewId]) return [];

  const crossModel = bundle.sourceSessionId !== options.targetSessionId;
  const destination = options.targetViewId ? 'view' : 'tree';
  const sameModelMode = options.sameModelMode ?? 'archi';
  const includeGeometry = !(bundle.kind === 'canvas' && destination === 'tree');
  const baseNodesToPaste = crossModel && includeGeometry
    ? bundle.nodes
    : !crossModel && bundle.kind === 'canvas' && destination === 'view' && bundle.sourceViewId
      ? bundle.nodes.filter((node) => node.viewId === bundle.sourceViewId)
      : [];
  const baseNodeIdsToPaste = new Set(baseNodesToPaste.map((node) => node.id));
  const baseConnectionsToPaste =
    !crossModel && bundle.kind === 'canvas' && destination === 'view'
      ? bundle.connections.filter(
          (connection) =>
            baseNodeIdsToPaste.has(connection.sourceId) &&
            baseNodeIdsToPaste.has(connection.targetId),
        )
      : crossModel && includeGeometry
        ? bundle.connections
        : [];

  const elementIdsToClone = new Set<string>();
  const relationshipIdsToClone = new Set<string>();
  const viewIdsToClone = new Set<string>();
  const nodeById = new Map(bundle.nodes.map((node) => [node.id, node]));
  const viewById = new Map(bundle.views.map((view) => [view.id, view]));
  const addViewClone = (viewId: string): void => {
    if (viewIdsToClone.has(viewId) || (!crossModel && targetState.model!.views[viewId])) return;
    const view = viewById.get(viewId);
    if (!view) return;
    viewIdsToClone.add(viewId);
    const visitNode = (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      if (node.nodeType === 'ref') addViewClone(node.refViewId);
      node.childIds.forEach(visitNode);
    };
    view.childIds.forEach(visitNode);
  };

  if (crossModel) {
    bundle.elements.forEach((item) => elementIdsToClone.add(item.id));
    bundle.relationships.forEach((item) => relationshipIdsToClone.add(item.id));
    if (includeGeometry) bundle.views.forEach((view) => addViewClone(view.id));
  } else {
    for (const root of bundle.roots) {
      if (root.kind === 'element' && !targetState.model.elements[root.id]) {
        elementIdsToClone.add(root.id);
      }
      if (root.kind === 'view' && !targetState.model.views[root.id]) addViewClone(root.id);
      if (destination === 'tree' && root.kind === 'node') {
        const node = nodeById.get(root.id);
        if (
          node?.nodeType === 'element' &&
          !targetState.model.elements[node.elementId]
        ) {
          elementIdsToClone.add(node.elementId);
        }
      }
    }
    for (const node of baseNodesToPaste) {
      if (node.nodeType === 'ref' && !targetState.model.views[node.refViewId]) {
        addViewClone(node.refViewId);
      }
      if (node.nodeType === 'element' && !targetState.model.elements[node.elementId]) {
        elementIdsToClone.add(node.elementId);
      }
    }
  }

  const clonedViewNodes = bundle.nodes.filter((node) => viewIdsToClone.has(node.viewId));
  const nodesToPaste = [
    ...baseNodesToPaste,
    ...clonedViewNodes.filter((node) => !baseNodeIdsToPaste.has(node.id)),
  ];
  const connectionsToPaste = [
    ...baseConnectionsToPaste,
    ...bundle.connections.filter(
      (connection) =>
        viewIdsToClone.has(connection.viewId) &&
        !baseConnectionsToPaste.some((base) => base.id === connection.id),
    ),
  ];
  if (!crossModel) {
    for (const node of nodesToPaste) {
      if (node.nodeType === 'element' && !targetState.model.elements[node.elementId]) {
        elementIdsToClone.add(node.elementId);
      }
    }
  }

  if (
    !crossModel &&
    bundle.kind === 'canvas' &&
    destination === 'view' &&
    sameModelMode === 'archi' &&
    options.targetViewId
  ) {
    const conceptsInTargetView = new Set(
      Object.values(targetState.model.nodes).flatMap((node) =>
        node.viewId === options.targetViewId && node.nodeType === 'element'
          ? [node.elementId]
          : [],
      ),
    );
    for (const node of baseNodesToPaste) {
      if (node.nodeType === 'element' && conceptsInTargetView.has(node.elementId)) {
        elementIdsToClone.add(node.elementId);
      }
    }
  }

  const requiredRelationshipIds = new Set(
    connectionsToPaste.flatMap((connection) =>
      connection.relationshipId ? [connection.relationshipId] : [],
    ),
  );
  for (const relationship of bundle.relationships) {
    if (!requiredRelationshipIds.has(relationship.id) && !crossModel) continue;
    if (
      crossModel ||
      !targetState.model.relationships[relationship.id] ||
      elementIdsToClone.has(relationship.sourceId) ||
      elementIdsToClone.has(relationship.targetId)
    ) {
      relationshipIdsToClone.add(relationship.id);
      if (!targetState.model.elements[relationship.sourceId]) {
        elementIdsToClone.add(relationship.sourceId);
      }
      if (!targetState.model.elements[relationship.targetId]) {
        elementIdsToClone.add(relationship.targetId);
      }
    }
  }

  const idMap = new Map<string, string>();
  const mapFresh = (id: string) => {
    const mapped = newId();
    idMap.set(id, mapped);
    return mapped;
  };

  elementIdsToClone.forEach(mapFresh);
  relationshipIdsToClone.forEach(mapFresh);
  viewIdsToClone.forEach(mapFresh);
  nodesToPaste.forEach((item) => mapFresh(item.id));
  connectionsToPaste.forEach((item) => mapFresh(item.id));

  const treeVisualIds = new Map<string, string>();
  if (bundle.kind === 'tree' && destination === 'view') {
    for (const root of bundle.roots) {
      if (root.kind === 'element' || root.kind === 'view') {
        treeVisualIds.set(root.id, newId());
      }
    }
  }

  let dx = options.offset ?? 16;
  let dy = options.offset ?? 16;
  const canvasRootIds = new Set(bundle.roots.filter((root) => root.kind === 'node').map((root) => root.id));
  if (options.at && canvasRootIds.size > 0) {
    const roots = bundle.nodes.filter((node) => canvasRootIds.has(node.id));
    const minX = Math.min(...roots.map((node) => node.bounds.x));
    const minY = Math.min(...roots.map((node) => node.bounds.y));
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      dx = Math.round(options.at.x - minX);
      dy = Math.round(options.at.y - minY);
    }
  }

  transact(
    'Paste from model',
    (draft) => {
      if (elementIdsToClone.size > 0 || relationshipIdsToClone.size > 0) {
        for (const source of bundle.elements) {
          if (!elementIdsToClone.has(source.id)) continue;
          const id = idMap.get(source.id)!;
          const folderId = crossModel || !draft.folders[source.folderId]
            ? folderForElementType(draft, source.type)
            : source.folderId;
          draft.elements[id] = { ...deepClone(source), id, folderId };
          draft.folders[folderId].itemIds.push(id);
        }
        for (const source of bundle.relationships) {
          if (!relationshipIdsToClone.has(source.id)) continue;
          const id = idMap.get(source.id)!;
          const folderId = crossModel || !draft.folders[source.folderId]
            ? defaultFolderId(draft, 'relations')
            : source.folderId;
          const sourceId = idMap.get(source.sourceId) ?? source.sourceId;
          const targetId = idMap.get(source.targetId) ?? source.targetId;
          if (!draft.elements[sourceId] || !draft.elements[targetId]) continue;
          draft.relationships[id] = {
            ...deepClone(source),
            id,
            folderId,
            sourceId,
            targetId,
          };
          draft.folders[folderId].itemIds.push(id);
        }
      }
      if (viewIdsToClone.size > 0) {
        for (const source of bundle.views) {
          if (!viewIdsToClone.has(source.id)) continue;
          const id = idMap.get(source.id)!;
          const folderId = defaultFolderId(draft, 'diagrams');
          draft.views[id] = { ...deepClone(source), id, folderId, childIds: [] };
          draft.folders[folderId].itemIds.push(id);
        }
      }

      for (const source of nodesToPaste) {
        const id = idMap.get(source.id)!;
        const mappedViewId = idMap.get(source.viewId) ?? options.targetViewId;
        if (!mappedViewId || !draft.views[mappedViewId]) continue;
        const mappedParentId =
          source.parentId === source.viewId
            ? mappedViewId
            : (idMap.get(source.parentId) ?? mappedViewId);
        const isCanvasRoot = bundle.kind === 'canvas' && canvasRootIds.has(source.id);
        const elementId =
          source.nodeType === 'element'
            ? (idMap.get(source.elementId) ?? source.elementId)
            : undefined;
        const refViewId =
          source.nodeType === 'ref'
            ? (idMap.get(source.refViewId) ?? source.refViewId)
            : undefined;
        if (elementId && !draft.elements[elementId]) continue;
        if (refViewId && (!draft.views[refViewId] || refViewId === mappedViewId)) continue;
        const node: DiagramNode = {
          ...deepClone(source),
          id,
          viewId: mappedViewId,
          parentId: mappedParentId,
          bounds:
            isCanvasRoot && mappedParentId === mappedViewId
              ? { ...source.bounds, x: source.bounds.x + dx, y: source.bounds.y + dy }
              : { ...source.bounds },
          childIds: [],
          sourceConnectionIds: [],
          targetConnectionIds: [],
          ...(source.nodeType === 'element'
            ? { elementId: elementId! }
            : {}),
          ...(source.nodeType === 'ref'
            ? { refViewId: refViewId! }
            : {}),
        } as DiagramNode;
        attachNode(draft, node);
      }

      for (const source of connectionsToPaste) {
        const sourceId = idMap.get(source.sourceId);
        const targetId = idMap.get(source.targetId);
        const viewId = idMap.get(source.viewId) ?? options.targetViewId;
        if (!sourceId || !targetId || !viewId || !draft.nodes[sourceId] || !draft.nodes[targetId]) {
          continue;
        }
        const relationshipId = source.relationshipId
          ? (idMap.get(source.relationshipId) ?? source.relationshipId)
          : undefined;
        if (relationshipId && !draft.relationships[relationshipId]) continue;
        attachConnection(draft, {
          ...deepClone(source),
          id: idMap.get(source.id)!,
          viewId,
          sourceId,
          targetId,
          ...(relationshipId ? { relationshipId } : {}),
        });
      }

      if (bundle.kind === 'tree' && options.targetViewId) {
        const offset = options.offset ?? 16;
        const origin = options.at ?? { x: offset, y: offset };
        let index = 0;
        for (const root of bundle.roots) {
          const id = treeVisualIds.get(root.id);
          if (!id) continue;
          if (root.kind === 'element') {
            const elementId = idMap.get(root.id) ?? root.id;
            const element = draft.elements[elementId];
            if (!element) continue;
            const size = options.visualDefaults?.elementSize(element) ?? {
              width: 120,
              height: element.type === 'Junction' ? 18 : 55,
            };
            attachNode(draft, {
              id,
              nodeType: 'element',
              elementId,
              viewId: options.targetViewId,
              parentId: options.targetViewId,
              bounds: {
                x: Math.round(origin.x - size.width / 2 + index * offset),
                y: Math.round(origin.y - size.height / 2 + index * offset),
                ...size,
              },
              childIds: [],
              sourceConnectionIds: [],
              targetConnectionIds: [],
              ...options.visualDefaults?.textStyle,
            });
            index++;
          } else if (root.kind === 'view') {
            const refViewId = idMap.get(root.id) ?? root.id;
            if (!draft.views[refViewId] || refViewId === options.targetViewId) continue;
            const size = options.visualDefaults?.viewReferenceSize ?? { width: 200, height: 140 };
            attachNode(draft, {
              id,
              nodeType: 'ref',
              refViewId,
              viewId: options.targetViewId,
              parentId: options.targetViewId,
              bounds: {
                x: Math.round(origin.x - size.width / 2 + index * offset),
                y: Math.round(origin.y - size.height / 2 + index * offset),
                ...size,
              },
              childIds: [],
              sourceConnectionIds: [],
              targetConnectionIds: [],
              ...options.visualDefaults?.textStyle,
            });
            index++;
          }
        }
      }
    },
    targetStore,
  );

  const after = targetStore.getState().model;
  if (destination === 'view' && bundle.kind === 'tree') {
    return [...treeVisualIds.values()].filter((id) => Boolean(after?.nodes[id]));
  }
  if (destination === 'tree' && bundle.kind === 'canvas') {
    return [...new Set(bundle.roots.flatMap((root) => {
      const node = bundle.nodes.find((item) => item.id === root.id);
      if (node?.nodeType !== 'element') return [];
      return [idMap.get(node.elementId) ?? node.elementId];
    }))].filter((id) => Boolean(after?.elements[id]));
  }
  return bundle.roots
    .map((root) => idMap.get(root.id) ?? root.id)
    .filter((id) => Boolean(after?.elements[id] || after?.views[id] || after?.nodes[id]));
}
