import type { Bounds, DiagramConnection, ModelState } from '../../types';
import { ARCHIMATE_NS, docTag, propertyTags, tag, textTag, type Attr } from './xml';

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
