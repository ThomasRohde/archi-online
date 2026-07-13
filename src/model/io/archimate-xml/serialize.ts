import {
  connectionGraphError,
  type Bounds,
  type ConnectableRefs,
  type DiagramConnection,
  type ModelState,
} from '../../types';
import {
  createConnectionOrderIndex,
  orderedConnectableConnectionIds,
} from '../../connection-order';
import { serializeLegendFeature } from '../../legend';
import { ARCHIMATE_NS, docTag, featureTags, propertyTags, serializeFontStyle, tag, textTag, type Attr } from './xml';

export function serializeArchimate(state: ModelState): string {
  const IND = '  ';
  const graphError = connectionGraphError(state);
  if (graphError) throw new Error(graphError);
  const writingConnections = new Set<string>();
  const writtenConnections = new Set<string>();
  const connectionOrderIndex = createConnectionOrderIndex(state);

  function writeBounds(indent: string, b: Bounds): string {
    return tag(indent, 'bounds', [
      ['x', b.x !== 0 ? b.x : undefined],
      ['y', b.y !== 0 ? b.y : undefined],
      ['width', b.width],
      ['height', b.height],
    ]);
  }

  function orderedConnectionIds(
    connectable: ConnectableRefs & { id: string },
    direction: 'source' | 'target',
  ): string[] {
    return orderedConnectableConnectionIds(connectable, direction, connectionOrderIndex);
  }

  function writeConnection(indent: string, conn: DiagramConnection): string {
    if (writingConnections.has(conn.id)) {
      throw new Error(`Connection endpoint cycle: ${conn.id}`);
    }
    if (writtenConnections.has(conn.id)) return '';
    writingConnections.add(conn.id);
    const children: string[] = [];
    for (const connectionId of orderedConnectionIds(conn, 'source')) {
      const child = state.connections[connectionId];
      if (child) children.push(writeConnection(indent + IND, child));
    }
    children.push(...featureTags(indent + IND, {
      labelExpression: conn.labelExpression,
      lineStyle: conn.lineStyle,
      fontAlpha: conn.fontAlpha,
      nameVisible: conn.nameVisible === false ? false : undefined,
    }));
    children.push(...conn.bendpoints.map((bp) =>
      tag(indent + IND, 'bendpoint', [
        ['startX', bp.startX !== 0 ? bp.startX : undefined],
        ['startY', bp.startY !== 0 ? bp.startY : undefined],
        ['endX', bp.endX !== 0 ? bp.endX : undefined],
        ['endY', bp.endY !== 0 ? bp.endY : undefined],
      ]),
    ));
    children.push(...docTag(indent + IND, conn.documentation));
    children.push(...propertyTags(indent + IND, conn.properties));
    const result = tag(
      indent,
      'sourceConnection',
      [
        ['xsi:type', conn.connType === 'relationship' ? 'archimate:Connection' : undefined],
        ['id', conn.id],
        ['name', conn.name !== '' ? conn.name : undefined],
        [
          'targetConnections',
          orderedConnectionIds(conn, 'target').length > 0
            ? orderedConnectionIds(conn, 'target').join(' ')
            : undefined,
        ],
        ['font', conn.font ?? serializeFontStyle(conn.fontStyle)],
        ['fontColor', conn.fontColor],
        ['lineColor', conn.lineColor],
        ['lineWidth', conn.lineWidth],
        ['textPosition', conn.textPosition],
        ['source', conn.sourceId],
        ['target', conn.targetId],
        [
          'type',
          conn.connType === 'plain' && conn.connectionType !== 0
            ? conn.connectionType
            : undefined,
        ],
        ['archimateRelationship', conn.relationshipId],
      ],
      children,
    );
    writingConnections.delete(conn.id);
    writtenConnections.add(conn.id);
    return result;
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
            : node.nodeType === 'ref'
              ? 'archimate:DiagramModelReference'
              : 'archimate:DiagramModelImage';
    const attrs: Attr[] = [
      ['xsi:type', xsiType],
      ['id', node.id],
      ['name', node.nodeType === 'group' || node.nodeType === 'note' ? node.name : undefined],
      [
        'targetConnections',
        orderedConnectionIds(node, 'target').length > 0
          ? orderedConnectionIds(node, 'target').join(' ')
          : undefined,
      ],
      ['font', node.font ?? serializeFontStyle(node.fontStyle)],
      ['fontColor', node.fontColor],
      ['lineColor', node.lineColor],
      ['textAlignment', node.textAlignment],
      ['textPosition', node.textPosition],
      ['alpha', node.alpha],
      ['lineWidth', node.lineWidth],
      ['borderType', node.nodeType === 'group' || node.nodeType === 'note' ? node.borderType : undefined],
      ['fillColor', node.fillColor],
      ['imagePath', node.imagePath],
      // Desktop's standalone DiagramModelImage always fills its bounds and
      // does not implement IIconic. Writing imagePosition there makes Archi
      // report an unknown feature before opening the model.
      ['imagePosition', node.nodeType !== 'image' ? node.imagePosition : undefined],
      ['archimateElement', node.nodeType === 'element' ? node.elementId : undefined],
      ['type', node.nodeType === 'element' ? node.figureType : undefined],
      ['model', node.nodeType === 'ref' ? node.refViewId : undefined],
    ];
    const children: string[] = [writeBounds(indent + IND, node.bounds), ...featureTags(indent + IND, {
      legend: node.nodeType === 'note' && node.legendOptions
        ? serializeLegendFeature(node.legendOptions)
        : undefined,
      labelExpression: node.labelExpression,
      gradient: node.gradient,
      lineStyle: node.lineStyle,
      iconVisible: node.iconVisible,
      iconColor: node.iconColor,
      deriveElementLineColor: node.derivedLineColor,
      fontAlpha: node.fontAlpha,
      lineAlpha: node.lineAlpha,
      imageSource: node.imageSource,
    })];
    for (const connId of orderedConnectionIds(node, 'source')) {
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
          ['profiles', element.profileIds.length > 0 ? element.profileIds.join(' ') : undefined],
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
          ['profiles', rel.profileIds.length > 0 ? rel.profileIds.join(' ') : undefined],
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
    children.push(...featureTags(indent + IND, { labelExpression: folder.labelExpression }));
    return tag(indent, 'folder', [
      ['name', folder.name],
      ['id', folder.id],
      ['type', folder.folderType],
    ], children);
  }

  const body: string[] = [];
  for (const profile of Object.values(state.profiles)) {
    body.push(tag(IND, 'profile', [
      ['name', profile.name],
      ['id', profile.id],
      ['imagePath', profile.imagePath],
      ['conceptType', profile.conceptType],
      ['specialization', profile.specialization ? 'true' : 'false'],
    ]));
  }
  for (const fid of state.rootFolderIds) body.push(writeFolder(IND, fid));
  if (state.info.documentation !== '') body.push(textTag(IND, 'purpose', state.info.documentation));
  body.push(...propertyTags(IND, state.info.properties));
  body.push(...featureTags(IND, {
    dublinCoreMetadata: state.info.metadata.length > 0 ? JSON.stringify(state.info.metadata) : undefined,
    exchangeLanguage: state.info.language,
  }));

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
