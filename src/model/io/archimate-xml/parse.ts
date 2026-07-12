import { newId } from '../../id';
import { parseFontStyle } from '../../font-style';
import { isElementType, isRelationshipType } from '../../metamodel';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Bendpoint,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Folder,
  FolderType,
  ModelState,
  ProfileDefinition,
} from '../../types';
import {
  connectionGraphError,
  getConnectable,
  type ConnectionRouterType,
} from '../../types';
import { rebuildConnectionAdjacency } from '../../ops/draft';
import {
  ARCHIMATE_NS,
  childText,
  intAttr,
  parseBounds,
  parseDocumentation,
  feature,
  intFeature,
  parseNodeStyle,
  parseProperties,
  strAttr,
  typeOf,
} from './xml';

export class ArchimateParseError extends Error {}

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  DiagramObject: { width: 120, height: 55 },
  Group: { width: 400, height: 140 },
  Note: { width: 185, height: 80 },
  DiagramModelReference: { width: 200, height: 140 },
  DiagramModelImage: { width: 120, height: 80 },
};

export function parseArchimate(xml: string): ModelState {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root.localName !== 'model' || root.namespaceURI !== ARCHIMATE_NS) {
    if (doc.querySelector('parsererror')) throw new ArchimateParseError('Not well-formed XML');
    throw new ArchimateParseError('Not an Archi .archimate model file');
  }

  const state: ModelState = {
    info: {
      id: root.getAttribute('id') ?? newId(),
      name: root.getAttribute('name') ?? 'Model',
      documentation: childText(root, 'purpose'),
      properties: parseProperties(root),
      metadata: parseNativeMetadata(root),
      language: feature(root, 'exchangeLanguage'),
      version: root.getAttribute('version') ?? undefined,
    },
    profiles: {},
    assets: {},
    folders: {},
    rootFolderIds: [],
    elements: {},
    relationships: {},
    views: {},
    nodes: {},
    connections: {},
  };

  const targetOrder = new Map<string, string[]>();

  function readTargetOrder(el: Element, connectableId: string): void {
    const value = el.getAttribute('targetConnections');
    if (value !== null) targetOrder.set(connectableId, value.split(/\s+/).filter(Boolean));
  }

  function parseConnection(el: Element, ownerId: string, viewId: string): string {
    const id = el.getAttribute('id') ?? newId();
    if (state.connections[id] || state.nodes[id]) {
      throw new ArchimateParseError(`Duplicate diagram object id: ${id}`);
    }
    const bendpoints: Bendpoint[] = [];
    for (const child of el.children) {
      if (child.localName !== 'bendpoint') continue;
      const num = (name: string) => {
        const value = child.getAttribute(name);
        return value === null ? 0 : parseInt(value, 10);
      };
      bendpoints.push({
        startX: num('startX'),
        startY: num('startY'),
        endX: num('endX'),
        endY: num('endY'),
      });
    }
    const relationshipId = el.getAttribute('archimateRelationship') ?? undefined;
    const conn: DiagramConnection = {
      id,
      viewId,
      connType: relationshipId ? 'relationship' : 'plain',
      relationshipId,
      name: el.getAttribute('name') ?? '',
      documentation: parseDocumentation(el),
      properties: parseProperties(el),
      sourceConnectionIds: [],
      targetConnectionIds: [],
      sourceId: el.getAttribute('source') ?? ownerId,
      targetId: el.getAttribute('target') ?? '',
      connectionType: relationshipId ? undefined : (intAttr(el, 'type') ?? 0),
      bendpoints,
      lineColor: strAttr(el, 'lineColor'),
      fontColor: strAttr(el, 'fontColor'),
      font: strAttr(el, 'font'),
      fontStyle: undefined,
      lineWidth: intAttr(el, 'lineWidth') as DiagramConnection['lineWidth'],
      textPosition: intAttr(el, 'textPosition'),
      labelExpression: feature(el, 'labelExpression'),
      lineStyle: intFeature(el, 'lineStyle') as DiagramConnection['lineStyle'],
      fontAlpha: intFeature(el, 'fontAlpha'),
    };
    conn.fontStyle = parseFontStyle(conn.font);
    state.connections[id] = conn;
    readTargetOrder(el, id);
    for (const child of el.children) {
      if (child.localName === 'sourceConnection') {
        conn.sourceConnectionIds.push(parseConnection(child, id, viewId));
      }
    }
    return id;
  }

  function parseViewNode(el: Element, viewId: string, parentId: string): string | null {
    const t = typeOf(el);
    const id = el.getAttribute('id') ?? newId();
    const base = {
      id,
      viewId,
      parentId,
      bounds: parseBounds(el, DEFAULT_SIZES[t] ?? DEFAULT_SIZES.DiagramObject),
      childIds: [] as string[],
      sourceConnectionIds: [] as string[],
      targetConnectionIds: [] as string[],
    };
    let node: DiagramNode;
    if (t === 'DiagramObject') {
      const elementId = el.getAttribute('archimateElement');
      if (!elementId) return null;
      node = { ...base, nodeType: 'element', elementId, figureType: intAttr(el, 'type') };
    } else if (t === 'Group') {
      node = {
        ...base,
        nodeType: 'group',
        name: el.getAttribute('name') ?? '',
        documentation: parseDocumentation(el),
        properties: parseProperties(el),
        borderType: intAttr(el, 'borderType'),
      };
    } else if (t === 'Note') {
      node = {
        ...base,
        nodeType: 'note',
        content: childText(el, 'content'),
        properties: parseProperties(el),
        borderType: intAttr(el, 'borderType'),
      };
    } else if (t === 'DiagramModelReference') {
      const refViewId = el.getAttribute('model');
      if (!refViewId) return null;
      node = { ...base, nodeType: 'ref', refViewId };
    } else if (t === 'DiagramModelImage') {
      const imagePath = el.getAttribute('imagePath');
      if (!imagePath) return null;
      node = { ...base, nodeType: 'image', imagePath };
    } else {
      return null; // unsupported child (e.g. sketch/canvas types)
    }
    parseNodeStyle(el, node);
    node.imagePath = strAttr(el, 'imagePath') ?? node.imagePath;
    node.imageSource = node.imageSource ?? (intAttr(el, 'imageSource') as 0 | 1 | undefined);
    node.imagePosition = intAttr(el, 'imagePosition') as DiagramNode['imagePosition'];
    readTargetOrder(el, id);
    state.nodes[id] = node;
    for (const child of el.children) {
      if (child.localName === 'child') {
        const childId = parseViewNode(child, viewId, id);
        if (childId) node.childIds.push(childId);
      } else if (child.localName === 'sourceConnection') {
        node.sourceConnectionIds.push(parseConnection(child, id, viewId));
      }
    }
    return id;
  }

  function parseView(el: Element, folderId: string): DiagramView {
    const id = el.getAttribute('id') ?? newId();
    const view: DiagramView = {
      id,
      kind: 'view',
      name: el.getAttribute('name') ?? '',
      documentation: parseDocumentation(el),
      properties: parseProperties(el),
      folderId,
      viewpoint: strAttr(el, 'viewpoint'),
      childIds: [],
      connectionRouterType: parseConnectionRouterType(el),
    };
    for (const child of el.children) {
      if (child.localName === 'child') {
        const childId = parseViewNode(child, id, id);
        if (childId) view.childIds.push(childId);
      }
    }
    return view;
  }

  function parseFolder(el: Element, parentId: string | null): Folder {
    const id = el.getAttribute('id') ?? newId();
    const folder: Folder = {
      id,
      kind: 'folder',
      name: el.getAttribute('name') ?? '',
      folderType: (el.getAttribute('type') as FolderType | null) ?? undefined,
      documentation: parseDocumentation(el),
      properties: parseProperties(el),
      labelExpression: feature(el, 'labelExpression'),
      parentId,
      folderIds: [],
      itemIds: [],
    };
    state.folders[id] = folder;
    for (const child of el.children) {
      if (child.localName === 'folder') {
        const sub = parseFolder(child, id);
        folder.folderIds.push(sub.id);
      } else if (child.localName === 'element') {
        const t = typeOf(child);
        const cid = child.getAttribute('id') ?? newId();
        if (t === 'ArchimateDiagramModel') {
          const view = parseView(child, id);
          state.views[view.id] = view;
          folder.itemIds.push(view.id);
        } else if (isRelationshipType(t)) {
          const rel: ArchimateRelationship = {
            id: cid,
            kind: 'relationship',
            type: t,
            name: child.getAttribute('name') ?? '',
            documentation: parseDocumentation(child),
            properties: parseProperties(child),
            profileIds: (child.getAttribute('profiles') ?? '').split(/\s+/).filter(Boolean),
            folderId: id,
            sourceId: child.getAttribute('source') ?? '',
            targetId: child.getAttribute('target') ?? '',
            accessType: intAttr(child, 'accessType'),
            strength: strAttr(child, 'strength'),
            directed: child.getAttribute('directed') === 'true' ? true : undefined,
          };
          state.relationships[cid] = rel;
          folder.itemIds.push(cid);
        } else if (isElementType(t)) {
          const element: ArchimateElement = {
            id: cid,
            kind: 'element',
            type: t,
            name: child.getAttribute('name') ?? '',
            documentation: parseDocumentation(child),
            properties: parseProperties(child),
            profileIds: (child.getAttribute('profiles') ?? '').split(/\s+/).filter(Boolean),
            folderId: id,
            junctionType:
              t === 'Junction' ? (child.getAttribute('type') === 'or' ? 'or' : 'and') : undefined,
          };
          state.elements[cid] = element;
          folder.itemIds.push(cid);
        }
        // Silently skip SketchModel / CanvasModel and unknown types.
      }
    }
    return folder;
  }

  for (const child of root.children) {
    if (child.localName === 'profile') {
      const conceptType = child.getAttribute('conceptType') ?? '';
      if (!isElementType(conceptType) && !isRelationshipType(conceptType)) continue;
      const id = child.getAttribute('id') ?? newId();
      const profile: ProfileDefinition = {
        id,
        name: child.getAttribute('name') ?? '',
        conceptType,
        specialization: child.getAttribute('specialization') !== 'false',
        imagePath: strAttr(child, 'imagePath'),
      };
      state.profiles[id] = profile;
    } else if (child.localName === 'folder') {
      const folder = parseFolder(child, null);
      state.rootFolderIds.push(folder.id);
    }
  }

  const graphError = connectionGraphError(state);
  if (graphError) throw new ArchimateParseError(graphError);

  // Seed explicit target order before deriving and completing adjacency.
  for (const [connectableId, order] of targetOrder) {
    const connectable = getConnectable(state, connectableId);
    if (!connectable) continue;
    for (const connectionId of order) {
      const connection = state.connections[connectionId];
      if (!connection) {
        throw new ArchimateParseError(
          `Connection endpoint missing: ${connectableId} target connection ${connectionId}`,
        );
      }
      if (connection.targetId !== connectableId) {
        throw new ArchimateParseError(
          `Target connection order mismatch: ${connectableId} does not target ${connectionId}`,
        );
      }
    }
    connectable.targetConnectionIds = [...order];
  }
  rebuildConnectionAdjacency(state);

  return state;
}

function parseConnectionRouterType(el: Element): ConnectionRouterType | undefined {
  const value = intAttr(el, 'connectionRouterType');
  return value === 0 || value === 2 ? value : undefined;
}

function parseNativeMetadata(root: Element): ModelState['info']['metadata'] {
  const raw = feature(root, 'dublinCoreMetadata');
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as ModelState['info']['metadata'];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
