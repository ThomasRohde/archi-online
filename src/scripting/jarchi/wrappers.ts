import {
  isElementType,
  isRelationshipType,
  toKebab,
  type ElementType,
  type RelationshipType,
} from '../../model/metamodel';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addNoteToView,
  addRelationship,
  addView,
  deleteItems,
  deleteViewObjects,
  renameItem,
  resizeNode,
  setDocumentation,
  setNodeStyle,
  setProperties,
  setRelationshipAttrs,
} from '../../model/ops';
import { openView } from '../../model/store';
import type { Concept, Property } from '../../model/types';
import { state } from './state';
import { resolveType } from './type-resolution';

export type JKind = 'element' | 'relationship' | 'view' | 'folder' | 'visual' | 'connection' | 'model';

export abstract class JObject {
  constructor(readonly id: string) {}
  abstract get kind(): JKind;
  abstract get type(): string;

  get name(): string {
    return '';
  }

  set name(_v: string) {
    throw new Error(`Cannot set name of ${this.kind}`);
  }

  toString(): string {
    return `${this.type}: ${this.name}`;
  }

  equals(other: unknown): boolean {
    return other instanceof JObject && other.id === this.id;
  }
}

function propsOf(id: string): Property[] {
  const m = state();
  return (
    m.elements[id]?.properties ??
    m.relationships[id]?.properties ??
    m.views[id]?.properties ??
    m.folders[id]?.properties ??
    (m.info.id === id ? m.info.properties : []) ??
    []
  );
}

/** Shared prop()/removeProp() implementation (concepts, views, folders, model). */
function propApi(target: { id: string }) {
  return {
    prop(key?: string, value?: string, duplicate?: boolean): unknown {
      const props = propsOf(target.id);
      if (key === undefined) return [...new Set(props.map((p) => p.key))];
      if (value === undefined) return props.find((p) => p.key === key)?.value;
      if (duplicate || !props.some((p) => p.key === key)) {
        setProperties(target.id, [...props, { key, value }]);
      } else {
        setProperties(
          target.id,
          props.map((p) => (p.key === key ? { ...p, value } : p)),
        );
      }
      return undefined;
    },
    removeProp(key: string, value?: string): void {
      const props = propsOf(target.id);
      setProperties(
        target.id,
        props.filter((p) => p.key !== key || (value !== undefined && p.value !== value)),
      );
    },
  };
}

export class JConcept extends JObject {
  get kind(): JKind {
    const m = state();
    return m.relationships[this.id] ? 'relationship' : 'element';
  }

  private concept(): Concept {
    const m = state();
    const c: Concept | undefined = m.elements[this.id] ?? m.relationships[this.id];
    if (!c) throw new Error(`Concept ${this.id} no longer exists`);
    return c;
  }

  get type(): string {
    return toKebab(this.concept().type);
  }

  override get name(): string {
    return this.concept().name;
  }

  override set name(v: string) {
    renameItem(this.id, v);
  }

  get documentation(): string {
    return this.concept().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v);
  }

  get source(): JConcept | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? new JConcept(c.sourceId) : undefined;
  }

  get target(): JConcept | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? new JConcept(c.targetId) : undefined;
  }

  get accessType(): string | undefined {
    const c = this.concept();
    if (c.kind !== 'relationship' || c.type !== 'AccessRelationship') return undefined;
    return (['write', 'read', 'access', 'readwrite'] as const)[c.accessType ?? 0];
  }

  set accessType(v: string | undefined) {
    const i = ['write', 'read', 'access', 'readwrite'].indexOf(v ?? 'write');
    setRelationshipAttrs(this.id, { accessType: i < 0 ? 0 : i });
  }

  get influenceStrength(): string | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? c.strength : undefined;
  }

  set influenceStrength(v: string | undefined) {
    setRelationshipAttrs(this.id, { strength: v ?? '' });
  }

  get associationDirected(): boolean {
    const c = this.concept();
    return c.kind === 'relationship' ? (c.directed ?? false) : false;
  }

  set associationDirected(v: boolean) {
    setRelationshipAttrs(this.id, { directed: v });
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  delete(): void {
    deleteItems([this.id]);
  }
}

export class JFolder extends JObject {
  get kind(): JKind {
    return 'folder';
  }

  get type(): string {
    return 'folder';
  }

  private folder() {
    const f = state().folders[this.id];
    if (!f) throw new Error(`Folder ${this.id} no longer exists`);
    return f;
  }

  override get name(): string {
    return this.folder().name;
  }

  override set name(v: string) {
    renameItem(this.id, v);
  }

  get documentation(): string {
    return this.folder().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v);
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  delete(): void {
    deleteItems([this.id]);
  }
}

export class JView extends JObject {
  get kind(): JKind {
    return 'view';
  }

  get type(): string {
    return 'archimate-diagram-model';
  }

  private view() {
    const v = state().views[this.id];
    if (!v) throw new Error(`View ${this.id} no longer exists`);
    return v;
  }

  override get name(): string {
    return this.view().name;
  }

  override set name(v: string) {
    renameItem(this.id, v);
  }

  get documentation(): string {
    return this.view().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v);
  }

  get viewpoint(): string | undefined {
    return this.view().viewpoint;
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  /**
   * view.add(element, x, y, w, h) -> visual object
   * view.add(relationship, sourceVisual, targetVisual) -> visual connection
   */
  add(obj: JConcept, a: number | JVisual, b: number | JVisual, w?: number, h?: number): JVisual | JConnection {
    const m = state();
    if (m.relationships[obj.id]) {
      if (!(a instanceof JVisual) || !(b instanceof JVisual)) {
        throw new Error('view.add(relationship, sourceVisual, targetVisual)');
      }
      const connId = addConnectionToView(this.id, obj.id, a.id, b.id);
      return new JConnection(connId);
    }
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error('view.add(element, x, y, width, height)');
    }
    const nodeId = addElementNodeToView(
      this.id,
      obj.id,
      this.id,
      { x: a, y: b, width: w ?? 120, height: h ?? 55 },
      false,
    );
    return new JVisual(nodeId);
  }

  createObject(type: string, x: number, y: number, w: number, h: number): JVisual {
    const t = type.toLowerCase();
    if (t.includes('note')) {
      return new JVisual(addNoteToView(this.id, this.id, { x, y, width: w, height: h }));
    }
    if (t.includes('group')) {
      return new JVisual(addGroupToView(this.id, this.id, { x, y, width: w, height: h }));
    }
    throw new Error(`Unsupported view object type: ${type}`);
  }

  openInUI(): void {
    openView(this.id);
  }

  delete(): void {
    deleteItems([this.id]);
  }
}

export class JVisual extends JObject {
  get kind(): JKind {
    return 'visual';
  }

  node() {
    const n = state().nodes[this.id];
    if (!n) throw new Error(`Diagram object ${this.id} no longer exists`);
    return n;
  }

  get type(): string {
    const n = this.node();
    switch (n.nodeType) {
      case 'element':
        return toKebab(state().elements[n.elementId]?.type ?? 'DiagramObject');
      case 'group':
        return 'diagram-model-group';
      case 'note':
        return 'diagram-model-note';
      case 'ref':
        return 'archimate-diagram-model-reference';
    }
  }

  override get name(): string {
    const n = this.node();
    if (n.nodeType === 'element') return state().elements[n.elementId]?.name ?? '';
    if (n.nodeType === 'group') return n.name;
    if (n.nodeType === 'note') return n.content;
    return state().views[n.refViewId]?.name ?? '';
  }

  override set name(v: string) {
    const n = this.node();
    if (n.nodeType === 'element') renameItem(n.elementId, v);
    else renameItem(this.id, v);
  }

  get text(): string {
    const n = this.node();
    return n.nodeType === 'note' ? n.content : this.name;
  }

  set text(v: string) {
    this.name = v;
  }

  get concept(): JConcept | undefined {
    const n = this.node();
    return n.nodeType === 'element' ? new JConcept(n.elementId) : undefined;
  }

  get view(): JView {
    return new JView(this.node().viewId);
  }

  get bounds(): { x: number; y: number; width: number; height: number } {
    return { ...this.node().bounds };
  }

  set bounds(b: { x?: number; y?: number; width?: number; height?: number }) {
    const cur = this.node().bounds;
    resizeNode(this.id, {
      x: b.x ?? cur.x,
      y: b.y ?? cur.y,
      width: b.width ?? cur.width,
      height: b.height ?? cur.height,
    });
  }

  get fillColor(): string | undefined {
    return this.node().fillColor;
  }

  set fillColor(v: string | undefined) {
    setNodeStyle([this.id], { fillColor: v });
  }

  get lineColor(): string | undefined {
    return this.node().lineColor;
  }

  set lineColor(v: string | undefined) {
    setNodeStyle([this.id], { lineColor: v });
  }

  get fontColor(): string | undefined {
    return this.node().fontColor;
  }

  set fontColor(v: string | undefined) {
    setNodeStyle([this.id], { fontColor: v });
  }

  get opacity(): number {
    return this.node().alpha ?? 255;
  }

  set opacity(v: number) {
    setNodeStyle([this.id], { alpha: Math.max(0, Math.min(255, v)) });
  }

  /** Nested add (bounds relative to this container). */
  add(element: JConcept, x: number, y: number, w: number, h: number): JVisual {
    const n = this.node();
    const nodeId = addElementNodeToView(
      n.viewId,
      element.id,
      this.id,
      { x, y, width: w, height: h },
      false,
    );
    return new JVisual(nodeId);
  }

  delete(): void {
    deleteViewObjects([this.id]);
  }
}

export class JConnection extends JObject {
  get kind(): JKind {
    return 'connection';
  }

  private conn() {
    const c = state().connections[this.id];
    if (!c) throw new Error(`Connection ${this.id} no longer exists`);
    return c;
  }

  get type(): string {
    const c = this.conn();
    if (c.relationshipId) {
      return toKebab(state().relationships[c.relationshipId]?.type ?? 'Connection');
    }
    return 'diagram-model-connection';
  }

  override get name(): string {
    const c = this.conn();
    return c.relationshipId ? (state().relationships[c.relationshipId]?.name ?? '') : '';
  }

  get concept(): JConcept | undefined {
    const c = this.conn();
    return c.relationshipId ? new JConcept(c.relationshipId) : undefined;
  }

  get view(): JView {
    return new JView(this.conn().viewId);
  }

  get source(): JVisual {
    return new JVisual(this.conn().sourceId);
  }

  get target(): JVisual {
    return new JVisual(this.conn().targetId);
  }

  get lineColor(): string | undefined {
    return this.conn().lineColor;
  }

  set lineColor(v: string | undefined) {
    setNodeStyle([this.id], { lineColor: v });
  }

  delete(): void {
    deleteViewObjects([this.id]);
  }
}

export class JModel extends JObject {
  get kind(): JKind {
    return 'model';
  }

  get type(): string {
    return 'archimate-model';
  }

  override get name(): string {
    return state().info.name;
  }

  override set name(v: string) {
    renameItem(state().info.id, v);
  }

  get purpose(): string {
    return state().info.documentation;
  }

  set purpose(v: string) {
    setDocumentation(state().info.id, v);
  }

  get documentation(): string {
    return this.purpose;
  }

  set documentation(v: string) {
    this.purpose = v;
  }

  prop(key?: string, value?: string, duplicate?: boolean): unknown {
    return propApi({ id: state().info.id }).prop(key, value, duplicate);
  }

  removeProp(key: string, value?: string): void {
    propApi({ id: state().info.id }).removeProp(key, value);
  }

  createElement(type: string, name?: string, folder?: JFolder): JConcept {
    const t = resolveType(type);
    if (!t || !isElementType(t)) throw new Error(`Unknown element type: ${type}`);
    return new JConcept(addElement(t as ElementType, name, folder?.id));
  }

  createRelationship(type: string, name: string, source: JConcept, target: JConcept, folder?: JFolder): JConcept {
    const t = resolveType(type);
    if (!t || !isRelationshipType(t)) throw new Error(`Unknown relationship type: ${type}`);
    const id = addRelationship(t as RelationshipType, source.id, target.id, name ?? '', folder?.id);
    if (!id) {
      throw new Error(
        `Relationship ${type} not allowed between ${source.type} and ${target.type}`,
      );
    }
    return new JConcept(id);
  }

  createArchimateView(name?: string, folder?: JFolder): JView {
    return new JView(addView(name ?? 'New View', folder?.id));
  }
}

export function wrap(id: string): JObject | undefined {
  const m = state();
  if (m.elements[id] || m.relationships[id]) return new JConcept(id);
  if (m.views[id]) return new JView(id);
  if (m.folders[id]) return new JFolder(id);
  if (m.nodes[id]) return new JVisual(id);
  if (m.connections[id]) return new JConnection(id);
  if (m.info.id === id) return new JModel(id);
  return undefined;
}
