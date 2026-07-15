// Open Exchange format reader, ported from Archi's XMLModelImporter.java.
// Placement rules, organization handling, style conversion, and error cases
// follow that implementation.

import { newId } from '../../id';
import { ELEMENT_TYPE_MAP } from '../../metamodel';
import { createEmptyModel } from '../../ops/concepts';
import {
  createConnectionRouteResolver,
  toRelativeBendpoint,
  type Point,
} from '../../../canvas/geometry';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Bounds,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Folder,
  ModelState,
  Property,
} from '../../types';
import {
  connectionGraphError,
  DUBLIN_CORE_FIELDS,
  getConnectable,
  resolveSemanticEndpoint,
} from '../../types';
import { rebuildConnectionAdjacency } from '../../ops/draft';
import type { ExchangeImportOptions, ExchangeImportResult } from './contracts';
import {
  buildFontString,
  EXCHANGE_NS,
  exchangeToAccessType,
  exchangeToAlpha,
  exchangeTypeToConcept,
  rgbToHex,
  viewpointNameToId,
  XSI_NS,
} from './mapping';

export class ExchangeParseError extends Error {}

export function parseExchange(xml: string, options: ExchangeImportOptions = {}): ModelState {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root.localName !== 'model' || root.namespaceURI !== EXCHANGE_NS) {
    if (doc.querySelector('parsererror')) throw new ExchangeParseError('Not well-formed XML');
    throw new ExchangeParseError('Not an ArchiMate Open Exchange file');
  }

  const state = createEmptyModel('Model');
  const language = options.language ?? documentLanguage(root) ?? 'en';
  const readText = (el: Element, name: string, normalize: boolean) => childText(el, name, normalize, language);

  // Property definitions first (id → key name).
  const propertyDefs = new Map<string, string>();
  const defsEl = child(root, 'propertyDefinitions');
  if (defsEl) {
    for (const defEl of children(defsEl, 'propertyDefinition')) {
      const id = defEl.getAttribute('identifier');
      const name = readText(defEl, 'name', false);
      if (id !== null && name !== null) propertyDefs.set(id, name);
    }
  }
  const readProperties = (el: Element): Property[] => {
    const props: Property[] = [];
    const propsEl = child(el, 'properties');
    if (propsEl) {
      for (const propEl of children(propsEl, 'property')) {
        const ref = propEl.getAttribute('propertyDefinitionRef');
        if (ref === 'specialization') continue;
        const key = ref !== null ? propertyDefs.get(ref) : undefined;
        if (key !== undefined) {
          props.push({ key, value: readText(propEl, 'value', true) ?? '' });
        }
      }
    }
    return props;
  };
  const readSpecialization = (
    el: Element,
    conceptType: ArchimateElement['type'] | ArchimateRelationship['type'],
  ): string[] => {
    const propsEl = child(el, 'properties');
    if (!propsEl) return [];
    const specialization = children(propsEl, 'property').find(
      (property) => property.getAttribute('propertyDefinitionRef') === 'specialization',
    );
    const name = specialization ? readText(specialization, 'value', true)?.trim() : '';
    if (!name) return [];
    let profile = Object.values(state.profiles).find(
      (candidate) =>
        candidate.conceptType === conceptType &&
        candidate.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (!profile) {
      const id = newId();
      profile = { id, name, conceptType, specialization: true };
      state.profiles[id] = profile;
    }
    return [profile.id];
  };

  // Root element.
  state.info.id = root.getAttribute('identifier') ?? state.info.id;
  state.info.name = readText(root, 'name', true) ?? state.info.name;
  state.info.documentation = readText(root, 'documentation', false) ?? '';
  state.info.properties = readProperties(root);
  state.info.language = language;
  state.info.metadata = readMetadata(root);
  state.info.version = undefined;

  // Elements.
  const elementsEl = child(root, 'elements');
  if (!elementsEl) throw new ExchangeParseError('No elements found in file');
  for (const el of children(elementsEl, 'element')) {
    const typeName = xsiType(el);
    if (typeName === null) continue; // bogus type is ignored, per Archi
    const mapped = exchangeTypeToConcept(typeName);
    if (mapped === null || mapped.kind !== 'element') {
      throw new ExchangeParseError(`Unsupported element type: ${typeName}`);
    }
    const id = el.getAttribute('identifier') ?? newId();
    const element: ArchimateElement = {
      id,
      kind: 'element',
      type: mapped.type as ArchimateElement['type'],
      name: readText(el, 'name', true) ?? '',
      documentation: readText(el, 'documentation', false) ?? '',
      properties: readProperties(el),
      profileIds: [],
      folderId: defaultElementFolder(state, mapped.type),
      junctionType: mapped.junctionType,
    };
    element.profileIds = readSpecialization(el, element.type);
    state.elements[id] = element;
    state.folders[element.folderId].itemIds.push(id);
  }

  // Relationships (2nd pass validates endpoints).
  const relationsEl = child(root, 'relationships');
  if (relationsEl) {
    const relationsFolder = topFolderId(state, 'relations');
    for (const el of children(relationsEl, 'relationship')) {
      const typeName = xsiType(el);
      if (typeName === null) continue;
      const mapped = exchangeTypeToConcept(typeName);
      if (mapped === null || mapped.kind !== 'relationship') {
        throw new ExchangeParseError(`Unsupported relationship type: ${typeName}`);
      }
      const id = el.getAttribute('identifier') ?? newId();
      const rel: ArchimateRelationship = {
        id,
        kind: 'relationship',
        type: mapped.type as ArchimateRelationship['type'],
        name: readText(el, 'name', true) ?? '',
        documentation: readText(el, 'documentation', false) ?? '',
        properties: readProperties(el),
        profileIds: [],
        folderId: relationsFolder,
        sourceId: el.getAttribute('source') ?? '',
        targetId: el.getAttribute('target') ?? '',
      };
      rel.profileIds = readSpecialization(el, rel.type);
      if (rel.type === 'AccessRelationship') {
        const accessType = el.getAttribute('accessType');
        if (accessType !== null) rel.accessType = exchangeToAccessType(accessType);
      } else if (rel.type === 'InfluenceRelationship') {
        rel.strength = el.getAttribute('modifier') ?? undefined;
      } else if (rel.type === 'AssociationRelationship') {
        if ((el.getAttribute('isDirected') ?? '').toLowerCase() === 'true') rel.directed = true;
      }
      state.relationships[id] = rel;
      state.folders[relationsFolder].itemIds.push(id);
    }
    for (const rel of Object.values(state.relationships)) {
      if (!state.elements[rel.sourceId] && !state.relationships[rel.sourceId]) {
        throw new ExchangeParseError(`Relationship source not found: ${rel.sourceId}`);
      }
      if (!state.elements[rel.targetId] && !state.relationships[rel.targetId]) {
        throw new ExchangeParseError(`Relationship target not found: ${rel.targetId}`);
      }
    }
  }

  // Views.
  const pendingViewRefs: { node: DiagramNode & { nodeType: 'ref' }; refId: string }[] = [];
  const absBoundsByNode = new Map<string, Bounds>();
  const seenDiagramObjectIds = new Set<string>();
  const viewsEl = child(root, 'views');
  const diagramsEl = viewsEl ? child(viewsEl, 'diagrams') : null;
  if (diagramsEl) {
    const diagramsFolder = topFolderId(state, 'diagrams');
    for (const viewEl of children(diagramsEl, 'view')) {
      const id = viewEl.getAttribute('identifier') ?? newId();
      const view: DiagramView = {
        id,
        kind: 'view',
        name: readText(viewEl, 'name', true) ?? '',
        documentation: readText(viewEl, 'documentation', false) ?? '',
        properties: readProperties(viewEl),
        folderId: diagramsFolder,
        viewpoint: viewpointFor(viewEl),
        childIds: [],
      };
      state.views[id] = view;
      state.folders[diagramsFolder].itemIds.push(id);

      parseNodes(viewEl, view, view.id, null);
      parseConnections(viewEl, view);
    }
    // Resolve view references now that all views exist.
    for (const { node, refId } of pendingViewRefs) {
      if (!state.views[refId]) {
        throw new ExchangeParseError(`View reference not found: ${refId}`);
      }
      node.refViewId = refId;
    }
    addImplicitNestedConnections(state);
  }

  // Organizations restructure the default folders.
  for (const orgsEl of children(root, 'organizations')) {
    for (const itemEl of children(orgsEl, 'item')) parseItem(itemEl);
  }

  return state;

  function readMetadata(modelEl: Element): ModelState['info']['metadata'] {
    const metadataEl = child(modelEl, 'metadata');
    if (!metadataEl) return [];
    const fields = new Set<string>(DUBLIN_CORE_FIELDS);
    const entries: ModelState['info']['metadata'] = [];
    for (const element of metadataEl.children) {
      if (element.namespaceURI === 'http://purl.org/dc/elements/1.1/' && fields.has(element.localName)) {
        entries.push({
          name: element.localName as ModelState['info']['metadata'][number]['name'],
          value: element.textContent ?? '',
        });
      }
    }
    return entries;
  }

  function viewpointFor(viewEl: Element): string | undefined {
    const name = viewEl.getAttribute('viewpoint');
    if (name === null) return undefined;
    const id = viewpointNameToId(name);
    return id !== '' ? id : undefined;
  }

  function parseNodes(
    parentEl: Element,
    view: DiagramView,
    parentId: string,
    parentAbs: Bounds | null,
  ): void {
    for (const nodeEl of children(parentEl, 'node')) {
      const abs = nodeBounds(nodeEl);
      const id = nodeEl.getAttribute('identifier') ?? newId();
      registerDiagramObjectId(id);
      const base = {
        id,
        viewId: view.id,
        parentId,
        bounds: {
          x: abs.x - (parentAbs?.x ?? 0),
          y: abs.y - (parentAbs?.y ?? 0),
          width: abs.width,
          height: abs.height,
        },
        childIds: [] as string[],
        sourceConnectionIds: [] as string[],
        targetConnectionIds: [] as string[],
      };

      let node: DiagramNode;
      const elementRef = nodeEl.getAttribute('elementRef');
      const typeName = xsiType(nodeEl);
      const hasChildNodes = children(nodeEl, 'node').length > 0;
      const viewRefEl = child(nodeEl, 'viewRef');

      if (elementRef !== null && elementRef !== '') {
        if (!state.elements[elementRef]) {
          throw new ExchangeParseError(`Node references missing element: ${elementRef}`);
        }
        node = { ...base, nodeType: 'element', elementId: elementRef };
      } else if (typeName === 'Container' || hasChildNodes) {
        node = {
          ...base,
          nodeType: 'group',
          name: readText(nodeEl, 'label', true) ?? '',
          documentation: readText(nodeEl, 'documentation', false) ?? '',
          properties: readProperties(nodeEl),
        };
      } else if (typeName === 'Label' && viewRefEl) {
        const refNode: DiagramNode = { ...base, nodeType: 'ref', refViewId: '' };
        pendingViewRefs.push({
          node: refNode as DiagramNode & { nodeType: 'ref' },
          refId: viewRefEl.getAttribute('ref') ?? '',
        });
        node = refNode;
      } else {
        node = {
          ...base,
          nodeType: 'note',
          content: readText(nodeEl, 'label', false) ?? '',
          properties: readProperties(nodeEl),
        };
      }

      applyNodeStyle(nodeEl, node);
      state.nodes[id] = node;
      absBoundsByNode.set(id, abs);
      if (parentId === view.id) view.childIds.push(id);
      else state.nodes[parentId].childIds.push(id);

      parseNodes(nodeEl, view, id, abs);
    }
  }

  function applyNodeStyle(nodeEl: Element, node: DiagramNode): void {
    const styleEl = child(nodeEl, 'style');
    if (!styleEl) return;
    const fillEl = child(styleEl, 'fillColor');
    if (fillEl) {
      node.fillColor = rgbAttr(fillEl);
      node.alpha = alphaAttr(fillEl);
    }
    const lineEl = child(styleEl, 'lineColor');
    if (lineEl) {
      node.lineColor = rgbAttr(lineEl);
      node.lineAlpha = alphaAttr(lineEl);
    }
    applyFont(styleEl, node);
  }

  function applyFont(
    styleEl: Element,
    target: { font?: string; fontColor?: string },
  ): void {
    const fontEl = child(styleEl, 'font');
    if (!fontEl) return;
    const name = fontEl.getAttribute('name') ?? 'Segoe UI';
    const size = Math.trunc(Number(fontEl.getAttribute('size') ?? '9')) || 9;
    const styleStr = fontEl.getAttribute('style') ?? '';
    target.font = buildFontString(name, size, styleStr.includes('bold'), styleStr.includes('italic'));
    const colorEl = child(fontEl, 'color');
    if (colorEl) target.fontColor = rgbAttr(colorEl);
  }

  function parseConnections(viewEl: Element, view: DiagramView): void {
    const pending: Array<{ connection: DiagramConnection; absoluteBendpoints: Point[] }> = [];
    for (const connEl of children(viewEl, 'connection')) {
      const id = connEl.getAttribute('identifier') ?? newId();
      registerDiagramObjectId(id);
      const relationshipRef = connEl.getAttribute('relationshipRef');
      const isRelationship = relationshipRef !== null && relationshipRef !== '';
      if (isRelationship && !state.relationships[relationshipRef]) {
        throw new ExchangeParseError(`Connection references missing relationship: ${relationshipRef}`);
      }
      const sourceId = connEl.getAttribute('source') ?? '';
      const targetId = connEl.getAttribute('target') ?? '';
      const conn: DiagramConnection = {
        id,
        viewId: view.id,
        connType: isRelationship ? 'relationship' : 'plain',
        relationshipId: isRelationship ? relationshipRef : undefined,
        name: readText(connEl, 'label', true) ?? '',
        documentation: readText(connEl, 'documentation', false) ?? '',
        properties: readProperties(connEl),
        sourceConnectionIds: [],
        targetConnectionIds: [],
        sourceId,
        targetId,
        connectionType: isRelationship ? undefined : 0,
        bendpoints: [],
      };
      const styleEl = child(connEl, 'style');
      if (styleEl) {
        const lineWidth = styleEl.getAttribute('lineWidth');
        if (lineWidth !== null) {
          conn.lineWidth = Math.min(3, Math.max(1, parseInt(lineWidth, 10) || 1)) as 1 | 2 | 3;
        }
        const lineEl = child(styleEl, 'lineColor');
        if (lineEl) conn.lineColor = rgbAttr(lineEl);
        applyFont(styleEl, conn);
      }
      state.connections[id] = conn;
      pending.push({ connection: conn, absoluteBendpoints: readAbsoluteBendpoints(connEl) });
    }

    for (const { connection } of pending) {
      const source = getConnectable(state, connection.sourceId);
      const target = getConnectable(state, connection.targetId);
      if (!source) {
        throw new ExchangeParseError(
          `Connection endpoint missing: ${connection.id} source ${connection.sourceId}`,
        );
      }
      if (!target) {
        throw new ExchangeParseError(
          `Connection endpoint missing: ${connection.id} target ${connection.targetId}`,
        );
      }
      if (source.viewId !== view.id || target.viewId !== view.id) {
        throw new ExchangeParseError(`Connection endpoint belongs to another view: ${connection.id}`);
      }
      const sourceConcept = resolveSemanticEndpoint(state, connection.sourceId);
      const targetConcept = resolveSemanticEndpoint(state, connection.targetId);
      if (connection.connType === 'relationship') {
        if (!sourceConcept || !targetConcept) {
          throw new ExchangeParseError(
            `Relationship connection must join ArchiMate components: ${connection.sourceId} → ${connection.targetId}`,
          );
        }
      } else if (
        'connType' in source ||
        'connType' in target ||
        (sourceConcept && targetConcept)
      ) {
        // Desktop Archi skips ordinary lines attached to another connection,
        // as well as lines between two ArchiMate components.
        delete state.connections[connection.id];
      }
    }
    const graphError = connectionGraphError(state);
    if (graphError) throw new ExchangeParseError(graphError);
    applyConnectionBendpoints(pending);
    rebuildConnectionAdjacency(state);
  }

  function readAbsoluteBendpoints(connEl: Element): Point[] {
    const bendpointEls = children(connEl, 'bendpoint');
    const srcAttach = child(connEl, 'sourceAttachment');
    const tgtAttach = child(connEl, 'targetAttachment');
    const points: Point[] = [];
    const attachMidpoint = (a: Element, b: Element): Point => {
      const pa = pointOf(a);
      const pb = pointOf(b);
      return { x: pa.x + (pb.x - pa.x) / 2, y: pa.y + (pb.y - pa.y) / 2 };
    };

    // Attachment points are approximated as bendpoints, per Archi.
    if (srcAttach && tgtAttach && bendpointEls.length === 0) {
      return [attachMidpoint(srcAttach, tgtAttach)];
    }
    if (srcAttach && bendpointEls.length > 0) {
      points.push(attachMidpoint(srcAttach, bendpointEls[0]));
    }
    for (const bpEl of bendpointEls) {
      points.push(pointOf(bpEl));
    }
    if (tgtAttach && bendpointEls.length > 0) {
      points.push(attachMidpoint(tgtAttach, bendpointEls[bendpointEls.length - 1]));
    }
    return points;
  }

  function applyConnectionBendpoints(
    pending: Array<{ connection: DiagramConnection; absoluteBendpoints: Point[] }>,
  ): void {
    const pointsById = new Map(
      pending.map(({ connection, absoluteBendpoints }) => [connection.id, absoluteBendpoints]),
    );
    const applied = new Set<string>();
    const apply = (connectionId: string): void => {
      if (applied.has(connectionId)) return;
      const connection = state.connections[connectionId];
      if (!connection) {
        applied.add(connectionId);
        return;
      }
      for (const endpointId of [connection.sourceId, connection.targetId]) {
        if (state.connections[endpointId]) apply(endpointId);
      }
      const points = pointsById.get(connectionId) ?? [];
      if (points.length > 0) {
        const endpoints = createConnectionRouteResolver(
          state,
          absBoundsByNode,
        ).endpointPoints(connectionId);
        if (!endpoints) {
          throw new ExchangeParseError(`Connection route cannot be resolved: ${connectionId}`);
        }
        connection.bendpoints = points.map((point) =>
          toRelativeBendpoint(point, endpoints.source, endpoints.target),
        );
      }
      applied.add(connectionId);
    };
    for (const { connection } of pending) apply(connection.id);
  }

  function registerDiagramObjectId(id: string): void {
    if (seenDiagramObjectIds.has(id)) {
      throw new ExchangeParseError(`Duplicate diagram object id: ${id}`);
    }
    seenDiagramObjectIds.add(id);
  }

  // ---- organizations ------------------------------------------------------

  function parseItem(itemEl: Element): void {
    const placed = addObjectItemToFolder(itemEl);
    if (!placed) {
      const top = topLevelFolderInHierarchy(itemEl);
      if (top) getSubFolder(itemEl, top);
    }
    for (const childEl of children(itemEl, 'item')) parseItem(childEl);
  }

  function addObjectItemToFolder(itemEl: Element): boolean {
    const objectId = itemObjectId(itemEl);
    if (objectId === null) return false;
    const defaultFolder = defaultFolderForObject(objectId);
    if (defaultFolder === null) return false;
    const parent = itemEl.parentElement;
    const folder = parent ? getSubFolder(parent, state.folders[defaultFolder]) : null;
    if (folder) moveToFolder(objectId, folder);
    return folder !== null;
  }

  function itemObjectId(itemEl: Element): string | null {
    const idref = itemEl.getAttribute('identifierRef');
    if (idref === null || idref === '') return null;
    if (children(itemEl, 'item').length > 0) return null;
    return state.elements[idref] || state.relationships[idref] || state.views[idref]
      ? idref
      : null;
  }

  function defaultFolderForObject(objectId: string): string | null {
    const el = state.elements[objectId];
    if (el) return defaultElementFolder(state, el.type);
    if (state.relationships[objectId]) return topFolderId(state, 'relations');
    if (state.views[objectId]) return topFolderId(state, 'diagrams');
    return null;
  }

  /** Walk the item hierarchy top-down creating/finding subfolders (Archi's
   * getSubFolder): top-level items matching an Archi folder name only update
   * that folder's documentation. */
  function getSubFolder(itemEl: Element, folder: Folder | null): Folder | null {
    if (!folder) return null;
    for (const el of itemHierarchy(itemEl)) {
      const name = readText(el, 'label', true) ?? '';
      const documentation = readText(el, 'documentation', true) ?? '';
      const properties = readProperties(el);
      const topLevel = topLevelFolder(el);
      if (topLevel) {
        topLevel.documentation = documentation;
        topLevel.properties = properties;
      } else {
        folder = createSubFolder(folder, name, documentation, properties);
      }
    }
    return folder;
  }

  function createSubFolder(
    parent: Folder,
    name: string,
    documentation: string,
    properties: Property[],
  ): Folder {
    for (const subId of parent.folderIds) {
      const sub = state.folders[subId];
      if (sub && sub.name === name) {
        sub.documentation = documentation;
        sub.properties = properties;
        return sub;
      }
    }
    const folder: Folder = {
      id: newId(),
      kind: 'folder',
      name,
      documentation,
      properties,
      parentId: parent.id,
      folderIds: [],
      itemIds: [],
    };
    state.folders[folder.id] = folder;
    parent.folderIds.push(folder.id);
    return folder;
  }

  function itemHierarchy(itemEl: Element): Element[] {
    const result: Element[] = [];
    let el: Element | null = itemEl;
    while (el && el.localName !== 'organizations') {
      result.unshift(el);
      el = el.parentElement;
    }
    return result;
  }

  function topLevelFolderInHierarchy(itemEl: Element): Folder | null {
    let el: Element | null = itemEl;
    while (el && el.localName !== 'organizations') {
      const folder = topLevelFolder(el);
      if (folder) return folder;
      el = el.parentElement;
    }
    return null;
  }

  function topLevelFolder(itemEl: Element): Folder | null {
    if (itemEl.parentElement?.localName !== 'organizations') return null;
    const name = readText(itemEl, 'label', true);
    for (const fid of state.rootFolderIds) {
      const folder = state.folders[fid];
      if (folder && folder.name === name) return folder;
    }
    return null;
  }

  function moveToFolder(objectId: string, folder: Folder): void {
    const object = state.elements[objectId] ?? state.relationships[objectId] ?? state.views[objectId];
    if (!object || object.folderId === folder.id) return;
    const from = state.folders[object.folderId];
    if (from) from.itemIds = from.itemIds.filter((i) => i !== objectId);
    folder.itemIds.push(objectId);
    object.folderId = folder.id;
  }
}

export function parseExchangeDocument(xml: string, options: ExchangeImportOptions = {}): ExchangeImportResult {
  const language = options.language ?? documentLanguage(new DOMParser().parseFromString(xml, 'application/xml').documentElement) ?? 'en';
  try {
    const model = parseExchange(xml, { ...options, language });
    const propertyCount = model.info.properties.length
      + Object.values(model.elements).reduce((total, item) => total + item.properties.length, 0)
      + Object.values(model.relationships).reduce((total, item) => total + item.properties.length, 0)
      + Object.values(model.views).reduce((total, item) => total + item.properties.length, 0)
      + Object.values(model.folders).reduce((total, item) => total + item.properties.length, 0)
      + Object.values(model.nodes).reduce(
        (total, item) =>
          total + (item.nodeType === 'group' || item.nodeType === 'note'
            ? item.properties.length
            : 0),
        0,
      )
      + Object.values(model.connections).reduce(
        (total, item) => total + item.properties.length,
        0,
      );
    return {
      model,
      language,
      diagnostics: [],
      warnings: [],
      errors: [],
      counts: {
        elements: Object.keys(model.elements).length,
        relationships: Object.keys(model.relationships).length,
        views: Object.keys(model.views).length,
        profiles: Object.keys(model.profiles).length,
        properties: propertyCount,
        warnings: 0,
        errors: 0,
      },
    };
  } catch (error) {
    const diagnostic = { severity: 'error' as const, message: error instanceof Error ? error.message : String(error) };
    return {
      language,
      diagnostics: [diagnostic],
      warnings: [],
      errors: [diagnostic],
      counts: { elements: 0, relationships: 0, views: 0, profiles: 0, properties: 0, warnings: 0, errors: 1 },
    };
  }
}

/**
 * Archi re-creates connections between directly nested element nodes when a
 * relationship exists between their elements and no connection is present
 * (XMLModelImporter.addNestedConnections).
 */
function addImplicitNestedConnections(state: ModelState): void {
  for (const parent of Object.values(state.nodes)) {
    if (parent.nodeType !== 'element') continue;
    for (const childId of parent.childIds) {
      const childNode = state.nodes[childId];
      if (!childNode || childNode.nodeType !== 'element') continue;
      for (const rel of Object.values(state.relationships)) {
        const forward = rel.sourceId === parent.elementId && rel.targetId === childNode.elementId;
        const backward = rel.sourceId === childNode.elementId && rel.targetId === parent.elementId;
        if (!forward && !backward) continue;
        const [srcNode, tgtNode] = forward ? [parent, childNode] : [childNode, parent];
        const exists = Object.values(state.connections).some(
          (c) =>
            c.relationshipId === rel.id && c.sourceId === srcNode.id && c.targetId === tgtNode.id,
        );
        if (exists) continue;
        const conn: DiagramConnection = {
          id: newId(),
          viewId: parent.viewId,
          connType: 'relationship',
          relationshipId: rel.id,
          name: '',
          documentation: '',
          properties: [],
          sourceConnectionIds: [],
          targetConnectionIds: [],
          sourceId: srcNode.id,
          targetId: tgtNode.id,
          bendpoints: [],
        };
        state.connections[conn.id] = conn;
        srcNode.sourceConnectionIds.push(conn.id);
        tgtNode.targetConnectionIds.push(conn.id);
      }
    }
  }
}

// ---- DOM helpers -----------------------------------------------------------

function children(el: Element, name: string): Element[] {
  const result: Element[] = [];
  for (const c of el.children) {
    if (c.localName === name && c.namespaceURI === EXCHANGE_NS) result.push(c);
  }
  return result;
}

function child(el: Element, name: string): Element | null {
  for (const c of el.children) {
    if (c.localName === name && c.namespaceURI === EXCHANGE_NS) return c;
  }
  return null;
}

/** First matching child's text; normalize collapses whitespace like JDOM's
 * getTextNormalize. (Archi prefers the xml:lang matching the system locale;
 * we take the first child, its documented fallback.) */
function childText(el: Element, name: string, normalize: boolean, language?: string): string | null {
  const candidates = children(el, name);
  const c = candidates.find((candidate) => candidate.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') === language)
    ?? candidates.find((candidate) => !candidate.hasAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang'))
    ?? candidates[0];
  if (!c) return null;
  const text = c.textContent ?? '';
  return normalize ? text.replace(/\s+/g, ' ').trim() : text;
}

function documentLanguage(root: Element): string | undefined {
  for (const candidate of children(root, 'name')) {
    const language = candidate.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
    if (language) return language;
  }
  return undefined;
}

function xsiType(el: Element): string | null {
  return el.getAttributeNS(XSI_NS, 'type') ?? el.getAttribute('xsi:type');
}

function nodeBounds(nodeEl: Element): Bounds {
  const attr = (name: string): number => {
    const v = nodeEl.getAttribute(name);
    if (v === null || v === '') throw new ExchangeParseError('Node is missing bounds');
    return parseInt(v, 10);
  };
  return { x: attr('x'), y: attr('y'), width: attr('w'), height: attr('h') };
}

function pointOf(el: Element): { x: number; y: number } {
  const attr = (name: string): number => {
    const v = el.getAttribute(name);
    if (v === null || v === '') throw new ExchangeParseError('Point is missing coordinates');
    return parseInt(v, 10);
  };
  return { x: attr('x'), y: attr('y') };
}

function rgbAttr(el: Element): string {
  const num = (name: string): number => {
    const v = el.getAttribute(name);
    if (v === null) throw new ExchangeParseError('Color is missing RGB values');
    return parseInt(v, 10);
  };
  return rgbToHex(num('r'), num('g'), num('b'));
}

function alphaAttr(el: Element): number | undefined {
  const v = el.getAttribute('a');
  return v === null ? undefined : exchangeToAlpha(parseInt(v, 10));
}

function defaultElementFolder(state: ModelState, type: string): string {
  const layer = type === 'Junction' ? 'other' : (ELEMENT_TYPE_MAP[type]?.layer ?? 'other');
  const folderType =
    layer === 'physical' ? 'technology' : (layer as Exclude<typeof layer, 'physical'>);
  return topFolderId(state, folderType);
}

function topFolderId(state: ModelState, folderType: string): string {
  for (const id of state.rootFolderIds) {
    if (state.folders[id]?.folderType === folderType) return id;
  }
  throw new ExchangeParseError(`Missing default folder: ${folderType}`);
}
