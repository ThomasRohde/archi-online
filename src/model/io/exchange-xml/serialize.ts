// Open Exchange format writer, ported from Archi's XMLModelExporter.java.
// Structure, element order, defaults, and coordinate handling follow that
// implementation exactly (organizations are always written).

import {
  connectionGraphError,
  type Bounds,
  type DiagramConnection,
  type DiagramNode,
  type Folder,
  type ModelState,
  type Property,
} from '../../types';
import {
  bendpointPositions,
  createConnectionRouteResolver,
  type ConnectionRouteResolver,
} from '../../../canvas/geometry';
import { tag, textTag, type Attr } from '../archimate-xml/xml';
import type { ExchangeExportOptions } from './contracts';
import {
  accessTypeToExchange,
  alphaToExchange,
  conceptTypeToExchange,
  defaultNodeFill,
  DEFAULT_FONT_COLOR,
  DEFAULT_LINE_COLOR,
  EXCHANGE_NS,
  EXCHANGE_SCHEMA_LOCATION,
  exchangeId,
  hexToRgb,
  parseFontString,
  VIEWPOINT_ID_TO_NAME,
  XSI_NS,
} from './mapping';

const FOLDER_ORDER = [
  'strategy',
  'business',
  'application',
  'technology',
  'motivation',
  'implementation_migration',
  'other',
] as const;

interface Point {
  x: number;
  y: number;
}

export function serializeExchange(state: ModelState, options: ExchangeExportOptions = {}): string {
  const graphError = connectionGraphError(state);
  if (graphError) throw new Error(graphError);
  const language = normalizeLanguage(options.language ?? state.info.language ?? 'en');
  const metadata = options.metadata ?? state.info.metadata;
  const propertyDefs = collectPropertyDefinitions(state);
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  out.push(
    `<model xmlns="${EXCHANGE_NS}" xmlns:xsi="${XSI_NS}"${metadata.length > 0 ? ' xmlns:dc="http://purl.org/dc/elements/1.1/"' : ''} ` +
      `xsi:schemaLocation="${EXCHANGE_SCHEMA_LOCATION}${metadata.length > 0 ? ' http://purl.org/dc/elements/1.1/ http://www.opengroup.org/xsd/archimate/3.1/dc.xsd' : ''}" ` +
      `identifier="${exchangeId(state.info.id)}">\n`,
  );

  out.push(textTag('  ', 'name', state.info.name));
  if (state.info.documentation !== '') {
    out.push(textTag('  ', 'documentation', state.info.documentation));
  }
  out.push(...propertiesTags('  ', state.info.properties, propertyDefs));
  if (metadata.length > 0) {
    const entries = [textTag('    ', 'schema', 'Dublin Core'), textTag('    ', 'schemaversion', '1.1')];
    for (const entry of metadata) {
      if (entry.value !== '') entries.push(textTag('    ', `dc:${entry.name}`, entry.value));
    }
    out.push(tag('  ', 'metadata', [], entries));
  }

  writeElements(state, out);
  writeRelationships(state, out, propertyDefs);
  if (options.includeOrganization ?? true) writeOrganizations(state, out, propertyDefs);
  writePropertyDefinitions(out, propertyDefs);
  writeViews(state, out, propertyDefs);

  out.push('</model>\n');
  return addLanguageTags(out.join(''), language);

  function writeElements(s: ModelState, o: string[]) {
    const rows: string[] = [];
    for (const folderType of FOLDER_ORDER) {
      const folder = topFolder(s, folderType);
      if (folder) {
        for (const id of itemsRecursive(s, folder)) {
          const el = s.elements[id];
          if (!el) continue;
          const children: string[] = [textTag('      ', 'name', el.name)];
          if (el.documentation !== '') {
            children.push(textTag('      ', 'documentation', el.documentation));
          }
          children.push(...propertiesTags(
            '      ',
            el.properties,
            propertyDefs,
            s.profiles[el.profileIds[0]]?.name,
          ));
          rows.push(
            tag(
              '    ',
              'element',
              [
                ['identifier', exchangeId(el.id)],
                ['xsi:type', conceptTypeToExchange(el.type, el.junctionType)],
              ],
              children,
            ),
          );
        }
      }
    }
    if (rows.length > 0) o.push('  <elements>\n', ...rows, '  </elements>\n');
  }
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim();
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(normalized)) {
    throw new Error(`Invalid ISO-639 language code: ${language}`);
  }
  return normalized;
}

function addLanguageTags(xml: string, language: string): string {
  return xml.replace(/<(name|documentation|label|value)>/g, `<$1 xml:lang="${language}">`);
}

function writeRelationships(
  state: ModelState,
  out: string[],
  propertyDefs: Map<string, string>,
): void {
  const folder = topFolder(state, 'relations');
  if (!folder) return;
  const rows: string[] = [];
  for (const id of itemsRecursive(state, folder)) {
    const rel = state.relationships[id];
    if (!rel) continue;
    const attrs: Attr[] = [
      ['identifier', exchangeId(rel.id)],
      ['source', exchangeId(rel.sourceId)],
      ['target', exchangeId(rel.targetId)],
      ['xsi:type', conceptTypeToExchange(rel.type)],
    ];
    if (rel.type === 'InfluenceRelationship' && rel.strength) {
      attrs.push(['modifier', rel.strength]);
    } else if (rel.type === 'AccessRelationship') {
      attrs.push(['accessType', accessTypeToExchange(rel.accessType)]);
    } else if (rel.type === 'AssociationRelationship' && rel.directed) {
      attrs.push(['isDirected', 'true']);
    }
    const children: string[] = [];
    if (rel.name !== '') children.push(textTag('      ', 'name', rel.name));
    if (rel.documentation !== '') {
      children.push(textTag('      ', 'documentation', rel.documentation));
    }
    children.push(...propertiesTags(
      '      ',
      rel.properties,
      propertyDefs,
      state.profiles[rel.profileIds[0]]?.name,
    ));
    rows.push(tag('    ', 'relationship', attrs, children));
  }
  if (rows.length > 0) out.push('  <relationships>\n', ...rows, '  </relationships>\n');
}

function writeOrganizations(
  state: ModelState,
  out: string[],
  propertyDefs: Map<string, string>,
): void {
  const rows: string[] = [];
  for (const fid of state.rootFolderIds) {
    const folder = state.folders[fid];
    if (!folder || (folder.itemIds.length === 0 && folder.folderIds.length === 0)) continue;
    rows.push(folderItem(state, folder, '    ', propertyDefs));
  }
  if (rows.length > 0) out.push('  <organizations>\n', ...rows, '  </organizations>\n');
}

function folderItem(
  state: ModelState,
  folder: Folder,
  indent: string,
  propertyDefs: Map<string, string>,
): string {
  const inner = indent + '  ';
  const children: string[] = [];
  if (folder.name !== '') children.push(textTag(inner, 'label', folder.name));
  if (folder.documentation !== '') {
    children.push(textTag(inner, 'documentation', folder.documentation));
  }
  children.push(...propertiesTags(inner, folder.properties, propertyDefs));
  for (const sub of folder.folderIds) {
    const subFolder = state.folders[sub];
    if (subFolder) children.push(folderItem(state, subFolder, inner, propertyDefs));
  }
  for (const itemId of folder.itemIds) {
    children.push(tag(inner, 'item', [['identifierRef', exchangeId(itemId)]]));
  }
  return tag(indent, 'item', [], children);
}

function writePropertyDefinitions(out: string[], propertyDefs: Map<string, string>): void {
  if (propertyDefs.size === 0) return;
  const rows: string[] = [];
  for (const [key, defId] of propertyDefs) {
    rows.push(
      tag(
        '    ',
        'propertyDefinition',
        [
          ['identifier', defId],
          ['type', 'string'],
        ],
        [textTag('      ', 'name', key)],
      ),
    );
  }
  out.push('  <propertyDefinitions>\n', ...rows, '  </propertyDefinitions>\n');
}

function writeViews(state: ModelState, out: string[], propertyDefs: Map<string, string>): void {
  const diagrams = topFolder(state, 'diagrams');
  if (!diagrams) return;
  const viewIds = itemsRecursive(state, diagrams).filter((id) => state.views[id]);
  if (viewIds.length === 0) return;

  out.push('  <views>\n    <diagrams>\n');
  for (const viewId of viewIds) {
    const view = state.views[viewId];
    const absBounds = absoluteBounds(state, viewId);
    const routes = createConnectionRouteResolver(state, absBounds);
    const offset = negativeOffset(state, viewId, routes);

    const attrs: Attr[] = [
      ['identifier', exchangeId(view.id)],
      ['xsi:type', 'Diagram'],
    ];
    const viewpointName = view.viewpoint ? VIEWPOINT_ID_TO_NAME[view.viewpoint] : undefined;
    if (viewpointName) attrs.push(['viewpoint', viewpointName]);

    const children: string[] = [textTag('        ', 'name', view.name)];
    if (view.documentation !== '') {
      children.push(textTag('        ', 'documentation', view.documentation));
    }
    children.push(...propertiesTags('        ', view.properties, propertyDefs));
    for (const nodeId of view.childIds) {
      children.push(nodeTag(state, nodeId, absBounds, offset, propertyDefs, '        '));
    }
    children.push(...connectionTags(state, viewId, offset, propertyDefs, routes));
    out.push(tag('      ', 'view', attrs, children));
  }
  out.push('    </diagrams>\n  </views>\n');
}

function nodeTag(
  state: ModelState,
  nodeId: string,
  absBounds: Map<string, Bounds>,
  offset: Point,
  propertyDefs: Map<string, string>,
  indent: string,
): string {
  const node = state.nodes[nodeId];
  if (!node) return '';
  const abs = absBounds.get(nodeId)!;
  const boundsAttrs: Attr[] = [
    ['x', abs.x - offset.x],
    ['y', abs.y - offset.y],
    ['w', abs.width],
    ['h', abs.height],
  ];
  const inner = indent + '  ';
  const children: string[] = [];
  let attrs: Attr[];

  if (node.nodeType === 'element') {
    attrs = [
      ['identifier', exchangeId(node.id)],
      ['elementRef', exchangeId(node.elementId)],
      ['xsi:type', 'Element'],
      ...boundsAttrs,
    ];
    children.push(styleTag(state, node, inner));
    for (const cid of node.childIds) {
      children.push(nodeTag(state, cid, absBounds, offset, propertyDefs, inner));
    }
  } else if (node.nodeType === 'group') {
    attrs = [['identifier', exchangeId(node.id)], ...boundsAttrs, ['xsi:type', 'Container']];
    if (node.name !== '') children.push(textTag(inner, 'label', node.name));
    if (node.documentation !== '') children.push(textTag(inner, 'documentation', node.documentation));
    children.push(...propertiesTags(inner, node.properties, propertyDefs));
    children.push(styleTag(state, node, inner));
    for (const cid of node.childIds) {
      children.push(nodeTag(state, cid, absBounds, offset, propertyDefs, inner));
    }
  } else if (node.nodeType === 'note') {
    attrs = [['identifier', exchangeId(node.id)], ['xsi:type', 'Label'], ...boundsAttrs];
    if (node.content !== '') children.push(textTag(inner, 'label', node.content));
    children.push(...propertiesTags(inner, node.properties, propertyDefs));
    children.push(styleTag(state, node, inner));
  } else if (node.nodeType === 'image') {
    // The Open Exchange schema has no embedded-image node. Keep its bounds as
    // an unlabeled diagram label so the rest of the view remains valid.
    attrs = [['identifier', exchangeId(node.id)], ['xsi:type', 'Label'], ...boundsAttrs];
    children.push(styleTag(state, node, inner));
  } else {
    // View reference exports as a Label with a viewRef child (per Archi).
    attrs = [['identifier', exchangeId(node.id)], ['xsi:type', 'Label'], ...boundsAttrs];
    const refView = state.views[node.refViewId];
    if (refView && refView.name !== '') children.push(textTag(inner, 'label', refView.name));
    children.push(styleTag(state, node, inner));
    if (refView) {
      children.push(tag(inner, 'viewRef', [['ref', exchangeId(node.refViewId)]]));
    }
  }
  return tag(indent, 'node', attrs, children);
}

function styleTag(state: ModelState, node: DiagramNode, indent: string): string {
  const inner = indent + '  ';
  const element = node.nodeType === 'element' ? state.elements[node.elementId] : undefined;
  const fill = hexToRgb(node.fillColor ?? defaultNodeFill(node, element));
  const line = hexToRgb(node.lineColor ?? DEFAULT_LINE_COLOR);
  return tag(
    indent,
    'style',
    [],
    [
      tag(inner, 'fillColor', [
        ['r', fill.r],
        ['g', fill.g],
        ['b', fill.b],
        ['a', alphaToExchange(node.alpha)],
      ]),
      tag(inner, 'lineColor', [
        ['r', line.r],
        ['g', line.g],
        ['b', line.b],
        ['a', alphaToExchange(node.lineAlpha)],
      ]),
      fontTag(inner, node.font, node.fontColor),
    ],
  );
}

function fontTag(indent: string, font: string | undefined, fontColor: string | undefined): string {
  const fd = parseFontString(font);
  let style = '';
  if (fd.bold) style = 'bold';
  if (fd.italic) style = style ? `${style} italic` : 'italic';
  const color = hexToRgb(fontColor ?? DEFAULT_FONT_COLOR);
  return tag(
    indent,
    'font',
    [
      ['name', fd.name],
      ['size', fd.size],
      ['style', style || undefined],
    ],
    [
      tag(indent + '  ', 'color', [
        ['r', color.r],
        ['g', color.g],
        ['b', color.b],
      ]),
    ],
  );
}

function connectionTags(
  state: ModelState,
  viewId: string,
  offset: Point,
  propertyDefs: Map<string, string>,
  routes: ConnectionRouteResolver,
): string[] {
  const rows: string[] = [];
  for (const conn of Object.values(state.connections)) {
    if (conn.viewId !== viewId) continue;
    if (isNestedConnection(state, conn)) continue;
    const attrs: Attr[] = [['identifier', exchangeId(conn.id)]];
    if (conn.connType === 'relationship' && conn.relationshipId) {
      attrs.push(['relationshipRef', exchangeId(conn.relationshipId)]);
      attrs.push(['xsi:type', 'Relationship']);
    } else {
      attrs.push(['xsi:type', 'Line']);
    }
    attrs.push(['source', exchangeId(conn.sourceId)]);
    attrs.push(['target', exchangeId(conn.targetId)]);

    const children: string[] = [];
    if (conn.name !== '') children.push(textTag('          ', 'label', conn.name));
    if (conn.documentation !== '') {
      children.push(textTag('          ', 'documentation', conn.documentation));
    }
    children.push(...propertiesTags('          ', conn.properties, propertyDefs));
    children.push(connectionStyleTag(conn, '          '));
    for (const pt of absoluteBendpoints(conn, routes)) {
      children.push(
        tag('          ', 'bendpoint', [
          ['x', Math.round(pt.x) - offset.x],
          ['y', Math.round(pt.y) - offset.y],
        ]),
      );
    }
    rows.push(tag('        ', 'connection', attrs, children));
  }
  return rows;
}

function connectionStyleTag(conn: DiagramConnection, indent: string): string {
  const inner = indent + '  ';
  const attrs: Attr[] = [];
  if (conn.lineWidth !== undefined && conn.lineWidth !== 1) {
    attrs.push(['lineWidth', conn.lineWidth]);
  }
  const line = hexToRgb(conn.lineColor ?? DEFAULT_LINE_COLOR);
  return tag(indent, 'style', attrs, [
    tag(inner, 'lineColor', [
      ['r', line.r],
      ['g', line.g],
      ['b', line.b],
    ]),
    fontTag(inner, conn.font, conn.fontColor),
  ]);
}

/** Nested ArchiMate connections (source contains target or vice versa) are
 * not written, per Archi's exporter. */
function isNestedConnection(state: ModelState, conn: DiagramConnection): boolean {
  if (conn.connType !== 'relationship') return false;
  const src = state.nodes[conn.sourceId];
  const tgt = state.nodes[conn.targetId];
  if (!src || !tgt || src.nodeType !== 'element' || tgt.nodeType !== 'element') return false;
  return src.childIds.includes(tgt.id) || tgt.childIds.includes(src.id);
}

// ---- geometry -------------------------------------------------------------

/** Absolute bounds of every node in a view (our bounds are parent-relative). */
function absoluteBounds(state: ModelState, viewId: string): Map<string, Bounds> {
  const map = new Map<string, Bounds>();
  const walk = (ids: string[], ox: number, oy: number) => {
    for (const id of ids) {
      const node = state.nodes[id];
      if (!node) continue;
      const b = {
        x: ox + node.bounds.x,
        y: oy + node.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
      };
      map.set(id, b);
      walk(node.childIds, b.x, b.y);
    }
  };
  walk(state.views[viewId]?.childIds ?? [], 0, 0);
  return map;
}

/** Absolute bendpoint positions using the same recursive endpoint projection
 * as the canvas, including connections attached to other connections. */
function absoluteBendpoints(
  conn: DiagramConnection,
  routes: ConnectionRouteResolver,
): Point[] {
  const endpoints = routes.endpointPoints(conn.id);
  return endpoints
    ? bendpointPositions(conn.bendpoints, endpoints.source, endpoints.target)
    : [];
}

/**
 * The exchange format allows no negative coordinates; compute the offset to
 * subtract, per XMLExchangeUtils.getNegativeOffsetForDiagram (top-level node
 * bounds plus all absolute bendpoint positions).
 */
function negativeOffset(
  state: ModelState,
  viewId: string,
  routes: ConnectionRouteResolver,
): Point {
  const extreme = { x: 0, y: 0 };
  const view = state.views[viewId];
  if (!view) return extreme;
  for (const id of view.childIds) {
    const node = state.nodes[id];
    if (!node) continue;
    extreme.x = Math.min(extreme.x, node.bounds.x);
    extreme.y = Math.min(extreme.y, node.bounds.y);
  }
  for (const conn of Object.values(state.connections)) {
    if (conn.viewId !== viewId) continue;
    for (const pt of absoluteBendpoints(conn, routes)) {
      extreme.x = Math.min(extreme.x, Math.round(pt.x));
      extreme.y = Math.min(extreme.y, Math.round(pt.y));
    }
  }
  return extreme;
}

// ---- shared helpers --------------------------------------------------------

function topFolder(state: ModelState, folderType: string): Folder | undefined {
  for (const id of state.rootFolderIds) {
    const f = state.folders[id];
    if (f?.folderType === folderType) return f;
  }
  return undefined;
}

/** Folder items depth-first, items before subfolders (Archi's getElements). */
function itemsRecursive(state: ModelState, folder: Folder): string[] {
  const result: string[] = [...folder.itemIds];
  for (const sub of folder.folderIds) {
    const subFolder = state.folders[sub];
    if (subFolder) result.push(...itemsRecursive(state, subFolder));
  }
  return result;
}

/**
 * All unique property keys in the model, sorted, mapped to "propid-N" ids in
 * sorted order (Archi uses a TreeMap over the whole model's contents).
 */
function collectPropertyDefinitions(state: ModelState): Map<string, string> {
  const keys = new Set<string>();
  const collect = (props: Property[]) => {
    for (const p of props) if (p.key !== '') keys.add(p.key);
  };
  collect(state.info.properties);
  for (const f of Object.values(state.folders)) collect(f.properties);
  for (const el of Object.values(state.elements)) collect(el.properties);
  for (const rel of Object.values(state.relationships)) collect(rel.properties);
  for (const v of Object.values(state.views)) collect(v.properties);
  for (const n of Object.values(state.nodes)) {
    if (n.nodeType === 'group' || n.nodeType === 'note') collect(n.properties);
  }
  for (const connection of Object.values(state.connections)) collect(connection.properties);
  const map = new Map<string, string>();
  let count = 1;
  for (const key of [...keys].sort()) map.set(key, `propid-${count++}`);
  if ([...Object.values(state.elements), ...Object.values(state.relationships)]
    .some((concept) => concept.profileIds.length > 0)) {
    map.set('Specialization', 'specialization');
  }
  return map;
}

function propertiesTags(
  indent: string,
  properties: Property[],
  propertyDefs: Map<string, string>,
  specialization?: string,
): string[] {
  const inner = indent + '  ';
  const rows: string[] = [];
  for (const p of properties) {
    const defId = p.key !== '' ? propertyDefs.get(p.key) : undefined;
    if (defId) {
      rows.push(
        tag(inner, 'property', [['propertyDefinitionRef', defId]], [
          textTag(inner + '  ', 'value', p.value),
        ]),
      );
    }
  }
  if (specialization) {
    rows.push(
      tag(inner, 'property', [['propertyDefinitionRef', 'specialization']], [
        textTag(inner + '  ', 'value', specialization),
      ]),
    );
  }
  return rows.length > 0 ? [tag(indent, 'properties', [], rows)] : [];
}
