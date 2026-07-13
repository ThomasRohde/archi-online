import {
  ELEMENT_TYPE_MAP,
  isRelationshipType,
  relationshipLabel,
} from '../../model/metamodel';
import type {
  ArchimateRelationship,
  DiagramConnection,
  DiagramNode,
  ModelState,
  Property,
} from '../../model/types';
import { isLegendNote } from '../../model/legend';

/** What the current selection resolves to for the properties panel. */
export interface Target {
  /** id whose name/documentation/properties are edited (concept, view, folder, model) */
  conceptId?: string;
  name?: string;
  nameEditable: boolean;
  typeLabel: string;
  documentation?: string;
  properties?: Property[];
  relationship?: ArchimateRelationship;
  junctionElementId?: string;
  junctionType?: 'and' | 'or';
  viewId?: string;
  viewpoint?: string;
  /** diagram objects the Appearance tab applies to */
  styleIds: string[];
  node?: DiagramNode;
  connection?: DiagramConnection;
  count: number;
}

export function resolveTarget(model: ModelState, source: 'tree' | 'view', ids: string[]): Target | null {
  if (ids.length === 0) return null;
  if (ids.length > 1) {
    return {
      nameEditable: false,
      typeLabel: `${ids.length} items selected`,
      styleIds: source === 'view' ? ids : [],
      count: ids.length,
    };
  }
  const id = ids[0];
  const base: Target = { nameEditable: false, typeLabel: '', styleIds: [], count: 1 };

  const resolveConcept = (cid: string, t: Target): Target | null => {
    const el = model.elements[cid];
    if (el) {
      t.conceptId = cid;
      t.name = el.name;
      t.nameEditable = true;
      t.typeLabel = ELEMENT_TYPE_MAP[el.type].label;
      t.documentation = el.documentation;
      t.properties = el.properties;
      if (el.type === 'Junction') {
        t.junctionElementId = cid;
        t.junctionType = el.junctionType ?? 'and';
      }
      return t;
    }
    const rel = model.relationships[cid];
    if (rel) {
      t.conceptId = cid;
      t.name = rel.name;
      t.nameEditable = true;
      t.typeLabel = relationshipLabel(rel.type);
      t.documentation = rel.documentation;
      t.properties = rel.properties;
      t.relationship = rel;
      return t;
    }
    const view = model.views[cid];
    if (view) {
      t.conceptId = cid;
      t.name = view.name;
      t.nameEditable = true;
      t.typeLabel = 'ArchiMate View';
      t.documentation = view.documentation;
      t.properties = view.properties;
      t.viewId = cid;
      t.viewpoint = view.viewpoint ?? '';
      return t;
    }
    const folder = model.folders[cid];
    if (folder) {
      t.conceptId = cid;
      t.name = folder.name;
      t.nameEditable = folder.parentId !== null;
      t.typeLabel = 'Folder';
      t.documentation = folder.documentation;
      t.properties = folder.properties;
      return t;
    }
    if (model.info.id === cid) {
      t.conceptId = cid;
      t.name = model.info.name;
      t.nameEditable = true;
      t.typeLabel = 'ArchiMate Model';
      t.documentation = model.info.documentation;
      t.properties = model.info.properties;
      return t;
    }
    return null;
  };

  if (source === 'tree') return resolveConcept(id, base);

  const node = model.nodes[id];
  if (node) {
    base.styleIds = [id];
    base.node = node;
    if (node.nodeType === 'element') {
      return resolveConcept(node.elementId, base);
    }
    if (node.nodeType === 'group') {
      base.conceptId = id;
      base.name = node.name;
      base.nameEditable = true;
      base.typeLabel = 'Group';
      base.documentation = node.documentation;
      base.properties = node.properties;
      return base;
    }
    if (node.nodeType === 'note') {
      base.conceptId = id;
      base.name = isLegendNote(node) ? node.name ?? 'Legend' : node.content;
      base.nameEditable = !isLegendNote(node);
      base.typeLabel = isLegendNote(node) ? 'Legend' : 'Note';
      base.properties = node.properties;
      return base;
    }
    if (node.nodeType === 'image') {
      base.typeLabel = 'Image';
      base.name = 'Image';
      return base;
    }
    base.typeLabel = 'View Reference';
    base.name = model.views[node.refViewId]?.name ?? '';
    return base;
  }
  const conn = model.connections[id];
  if (conn) {
    base.styleIds = [id];
    base.connection = conn;
    if (conn.relationshipId) return resolveConcept(conn.relationshipId, base);
    base.conceptId = conn.id;
    base.name = conn.name;
    base.nameEditable = true;
    base.typeLabel = 'Plain Connection';
    base.documentation = conn.documentation;
    base.properties = conn.properties;
    return base;
  }
  return null;
}

export function conceptName(model: ModelState, id: string): string {
  const c = model.elements[id] ?? model.relationships[id];
  if (!c) return '?';
  if (c.name) return c.name;
  return isRelationshipType(c.type) ? relationshipLabel(c.type) : ELEMENT_TYPE_MAP[c.type].label;
}
