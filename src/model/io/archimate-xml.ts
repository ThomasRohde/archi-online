// Reader/writer for Archi's native .archimate XML format.
import { newId } from '../id';
import { isElementType, isRelationshipType } from '../metamodel';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Bendpoint,
  Bounds,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Folder,
  FolderType,
  ModelState,
  Property,
} from '../types';

const ARCHIMATE_NS = 'http://www.archimatetool.com/archimate';

// ------------------------------------------------------------------ parsing

export class ArchimateParseError extends Error {}

function typeOf(el: Element): string {
  const t = el.getAttribute('xsi:type') ?? '';
  return t.replace(/^archimate:/, '');
}

function parseProperties(el: Element): Property[] {
  const props: Property[] = [];
  for (const child of el.children) {
    if (child.localName === 'property') {
      props.push({ key: child.getAttribute('key') ?? '', value: child.getAttribute('value') ?? '' });
    }
  }
  return props;
}

function parseDocumentation(el: Element): string {
  for (const child of el.children) {
    if (child.localName === 'documentation') return child.textContent ?? '';
  }
  return '';
}

function childText(el: Element, name: string): string {
  for (const child of el.children) {
    if (child.localName === name) return child.textContent ?? '';
  }
  return '';
}

function parseBounds(el: Element, defaults: { width: number; height: number }): Bounds {
  let bounds: Bounds = { x: 0, y: 0, width: defaults.width, height: defaults.height };
  for (const child of el.children) {
    if (child.localName === 'bounds') {
      const num = (n: string, d: number) => {
        const v = child.getAttribute(n);
        return v === null ? d : parseInt(v, 10);
      };
      bounds = {
        x: num('x', 0),
        y: num('y', 0),
        width: num('width', -1),
        height: num('height', -1),
      };
    }
  }
  if (bounds.width <= 0) bounds.width = defaults.width;
  if (bounds.height <= 0) bounds.height = defaults.height;
  return bounds;
}

function intAttr(el: Element, name: string): number | undefined {
  const v = el.getAttribute(name);
  return v === null ? undefined : parseInt(v, 10);
}

function strAttr(el: Element, name: string): string | undefined {
  return el.getAttribute(name) ?? undefined;
}

function parseNodeStyle(el: Element, node: DiagramNode): void {
  node.fillColor = strAttr(el, 'fillColor');
  node.lineColor = strAttr(el, 'lineColor');
  node.fontColor = strAttr(el, 'fontColor');
  node.font = strAttr(el, 'font');
  node.alpha = intAttr(el, 'alpha');
  node.lineAlpha = intAttr(el, 'lineAlpha');
  node.textAlignment = intAttr(el, 'textAlignment');
  node.textPosition = intAttr(el, 'textPosition');
}

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  DiagramObject: { width: 120, height: 55 },
  Group: { width: 400, height: 140 },
  Note: { width: 185, height: 80 },
  DiagramModelReference: { width: 200, height: 140 },
};

interface PendingConnection {
  xml: Element;
  sourceNodeId: string;
}

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
      version: root.getAttribute('version') ?? undefined,
    },
    folders: {},
    rootFolderIds: [],
    elements: {},
    relationships: {},
    views: {},
    nodes: {},
    connections: {},
  };

  const pendingConnections: PendingConnection[] = [];
  const targetOrder = new Map<string, string[]>(); // nodeId -> targetConnections attr order

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
    } else {
      return null; // unsupported child (e.g. sketch/canvas types)
    }
    parseNodeStyle(el, node);
    const tc = el.getAttribute('targetConnections');
    if (tc) targetOrder.set(id, tc.split(/\s+/).filter(Boolean));
    state.nodes[id] = node;
    for (const child of el.children) {
      if (child.localName === 'child') {
        const childId = parseViewNode(child, viewId, id);
        if (childId) node.childIds.push(childId);
      } else if (child.localName === 'sourceConnection') {
        pendingConnections.push({ xml: child, sourceNodeId: id });
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
      connectionRouterType: intAttr(el, 'connectionRouterType'),
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
            folderId: id,
            junctionType:
              t === 'Junction' ? (child.getAttribute('type') === 'or' ? 'or' : 'and') : undefined,
          };
          state.elements[cid] = element;
          folder.itemIds.push(cid);
        }
        // silently skip SketchModel / CanvasModel and unknown types
      }
    }
    return folder;
  }

  for (const child of root.children) {
    if (child.localName === 'folder') {
      const folder = parseFolder(child, null);
      state.rootFolderIds.push(folder.id);
    }
  }

  // Second pass: connections (targets may be forward references)
  for (const pc of pendingConnections) {
    const el = pc.xml;
    const id = el.getAttribute('id') ?? newId();
    const bendpoints: Bendpoint[] = [];
    for (const bp of el.children) {
      if (bp.localName === 'bendpoint') {
        const num = (n: string) => {
          const v = bp.getAttribute(n);
          return v === null ? 0 : parseInt(v, 10);
        };
        bendpoints.push({
          startX: num('startX'),
          startY: num('startY'),
          endX: num('endX'),
          endY: num('endY'),
        });
      }
    }
    const relationshipId = el.getAttribute('archimateRelationship') ?? undefined;
    const conn: DiagramConnection = {
      id,
      viewId: state.nodes[pc.sourceNodeId].viewId,
      connType: relationshipId ? 'relationship' : 'plain',
      relationshipId,
      sourceId: el.getAttribute('source') ?? pc.sourceNodeId,
      targetId: el.getAttribute('target') ?? '',
      bendpoints,
      lineColor: strAttr(el, 'lineColor'),
      fontColor: strAttr(el, 'fontColor'),
      font: strAttr(el, 'font'),
      lineWidth: intAttr(el, 'lineWidth'),
      textPosition: intAttr(el, 'textPosition'),
    };
    state.connections[id] = conn;
    state.nodes[pc.sourceNodeId].sourceConnectionIds.push(id);
  }
  // target connection lists, preserving the file's targetConnections order
  for (const conn of Object.values(state.connections)) {
    const tgt = state.nodes[conn.targetId];
    if (tgt) tgt.targetConnectionIds.push(conn.id);
  }
  for (const [nodeId, order] of targetOrder) {
    const node = state.nodes[nodeId];
    if (!node) continue;
    node.targetConnectionIds.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    });
  }

  return state;
}

// -------------------------------------------------------------- serializing

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#xD;')
    .replace(/\n/g, '&#xA;')
    .replace(/\t/g, '&#x9;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}

type Attr = [name: string, value: string | number | undefined];

function tag(indent: string, name: string, attrs: Attr[], children: string[] = []): string {
  let s = indent + '<' + name;
  for (const [an, av] of attrs) {
    if (av !== undefined && av !== '') s += ` ${an}="${esc(String(av))}"`;
  }
  if (children.length === 0) return s + '/>\n';
  s += '>\n' + children.join('') + indent + `</${name}>\n`;
  return s;
}

function textTag(indent: string, name: string, text: string): string {
  return `${indent}<${name}>${escText(text)}</${name}>\n`;
}

function propertyTags(indent: string, properties: Property[]): string[] {
  return properties.map((p) =>
    tag(indent, 'property', [
      ['key', p.key],
      ['value', p.value],
    ]),
  );
}

function docTag(indent: string, documentation: string): string[] {
  return documentation !== '' ? [textTag(indent, 'documentation', documentation)] : [];
}

export function serializeArchimate(state: ModelState): string {
  const IND = '  ';

  function writeBounds(indent: string, b: Bounds): string {
    return tag(indent, 'bounds', [
      ['x', b.x !== 0 ? b.x : undefined],
      ['y', b.y !== 0 ? b.y : undefined],
      ['width', b.width],
      ['height', b.height],
    ]);
  }

  function writeConnection(indent: string, conn: DiagramConnection): string {
    const children: string[] = conn.bendpoints.map((bp) =>
      tag(indent + IND, 'bendpoint', [
        ['startX', bp.startX !== 0 ? bp.startX : undefined],
        ['startY', bp.startY !== 0 ? bp.startY : undefined],
        ['endX', bp.endX !== 0 ? bp.endX : undefined],
        ['endY', bp.endY !== 0 ? bp.endY : undefined],
      ]),
    );
    return tag(
      indent,
      'sourceConnection',
      [
        ['xsi:type', 'archimate:Connection'],
        ['id', conn.id],
        ['font', conn.font],
        ['fontColor', conn.fontColor],
        ['lineColor', conn.lineColor],
        ['lineWidth', conn.lineWidth],
        ['textPosition', conn.textPosition],
        ['source', conn.sourceId],
        ['target', conn.targetId],
        ['archimateRelationship', conn.relationshipId],
      ],
      children,
    );
  }

  function writeNode(indent: string, nodeId: string): string {
    const node = state.nodes[nodeId];
    if (!node) return '';
    const xsiType =
      node.nodeType === 'element'
        ? 'archimate:DiagramObject'
        : node.nodeType === 'group'
          ? 'archimate:Group'
          : node.nodeType === 'note'
            ? 'archimate:Note'
            : 'archimate:DiagramModelReference';
    const attrs: Attr[] = [
      ['xsi:type', xsiType],
      ['id', node.id],
      ['name', node.nodeType === 'group' ? node.name : undefined],
      [
        'targetConnections',
        node.targetConnectionIds.length > 0 ? node.targetConnectionIds.join(' ') : undefined,
      ],
      ['font', node.font],
      ['fontColor', node.fontColor],
      ['lineColor', node.lineColor],
      ['textAlignment', node.textAlignment],
      ['textPosition', node.textPosition],
      ['alpha', node.alpha],
      ['lineAlpha', node.lineAlpha],
      ['borderType', node.nodeType === 'group' || node.nodeType === 'note' ? node.borderType : undefined],
      ['fillColor', node.fillColor],
      ['archimateElement', node.nodeType === 'element' ? node.elementId : undefined],
      ['type', node.nodeType === 'element' ? node.figureType : undefined],
      ['model', node.nodeType === 'ref' ? node.refViewId : undefined],
    ];
    const children: string[] = [writeBounds(indent + IND, node.bounds)];
    for (const connId of node.sourceConnectionIds) {
      const conn = state.connections[connId];
      if (conn) children.push(writeConnection(indent + IND, conn));
    }
    for (const childId of node.childIds) children.push(writeNode(indent + IND, childId));
    if (node.nodeType === 'note' && node.content !== '') {
      children.push(textTag(indent + IND, 'content', node.content));
    }
    if (node.nodeType === 'group') children.push(...docTag(indent + IND, node.documentation));
    if (node.nodeType === 'group' || node.nodeType === 'note') {
      children.push(...propertyTags(indent + IND, node.properties));
    }
    return tag(indent, 'child', attrs, children);
  }

  function writeItem(indent: string, id: string): string {
    const element = state.elements[id];
    if (element) {
      return tag(
        indent,
        'element',
        [
          ['xsi:type', 'archimate:' + element.type],
          ['name', element.name],
          ['id', element.id],
          ['type', element.type === 'Junction' && element.junctionType === 'or' ? 'or' : undefined],
        ],
        [...docTag(indent + IND, element.documentation), ...propertyTags(indent + IND, element.properties)],
      );
    }
    const rel = state.relationships[id];
    if (rel) {
      return tag(
        indent,
        'element',
        [
          ['xsi:type', 'archimate:' + rel.type],
          ['name', rel.name !== '' ? rel.name : undefined],
          ['id', rel.id],
          ['source', rel.sourceId],
          ['target', rel.targetId],
          ['accessType', rel.accessType],
          ['strength', rel.strength],
          ['directed', rel.directed ? 'true' : undefined],
        ],
        [...docTag(indent + IND, rel.documentation), ...propertyTags(indent + IND, rel.properties)],
      );
    }
    const view = state.views[id];
    if (view) {
      const children: string[] = view.childIds.map((cid) => writeNode(indent + IND, cid));
      children.push(...docTag(indent + IND, view.documentation));
      children.push(...propertyTags(indent + IND, view.properties));
      return tag(
        indent,
        'element',
        [
          ['xsi:type', 'archimate:ArchimateDiagramModel'],
          ['name', view.name],
          ['id', view.id],
          ['connectionRouterType', view.connectionRouterType],
          ['viewpoint', view.viewpoint],
        ],
        children,
      );
    }
    return '';
  }

  function writeFolder(indent: string, folderId: string): string {
    const folder = state.folders[folderId];
    if (!folder) return '';
    const children: string[] = [];
    for (const sub of folder.folderIds) children.push(writeFolder(indent + IND, sub));
    for (const itemId of folder.itemIds) children.push(writeItem(indent + IND, itemId));
    children.push(...docTag(indent + IND, folder.documentation));
    children.push(...propertyTags(indent + IND, folder.properties));
    return tag(indent, 'folder', [
      ['name', folder.name],
      ['id', folder.id],
      ['type', folder.folderType],
    ], children);
  }

  const body: string[] = [];
  for (const fid of state.rootFolderIds) body.push(writeFolder(IND, fid));
  if (state.info.documentation !== '') body.push(textTag(IND, 'purpose', state.info.documentation));
  body.push(...propertyTags(IND, state.info.properties));

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    tag('', 'archimate:model', [
      ['xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'],
      ['xmlns:archimate', ARCHIMATE_NS],
      ['name', state.info.name],
      ['id', state.info.id],
      ['version', state.info.version ?? '5.0.0'],
    ], body)
  );
}
