// jArchi-compatible scripting API (https://github.com/archimatetool/archi-scripting-plugin).
// Wrappers hold ids and always read fresh state from the store, so scripts see
// their own mutations immediately.
import {
  fromKebab,
  isElementType,
  isRelationshipType,
  toKebab,
  type ElementType,
  type RelationshipType,
} from '../model/metamodel';
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
} from '../model/ops';
import { openView, useStore } from '../model/store';
import type { Concept, ModelState, Property } from '../model/types';

function state(): ModelState {
  const m = useStore.getState().model;
  if (!m) throw new Error('No model is open');
  return m;
}

// ---------------------------------------------------------------- wrappers

export type JKind = 'element' | 'relationship' | 'view' | 'folder' | 'visual' | 'connection' | 'model';

abstract class JObject {
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

  // relationship ends
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

function resolveType(type: string): string | undefined {
  if (isElementType(type) || isRelationshipType(type)) return type;
  let t = fromKebab(type.toLowerCase());
  if (t) return t;
  // allow "composition" as shorthand for "composition-relationship"
  t = fromKebab(type.toLowerCase() + '-relationship');
  return t;
}

// --------------------------------------------------------------- wrapping

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

// --------------------------------------------------------------- selector

function matchesSelector(obj: JObject, selector: string): boolean {
  if (selector === '*') return true;
  if (selector.startsWith('#')) return obj.id === selector.slice(1);
  if (selector.startsWith('.')) return obj.name === selector.slice(1);
  // type selector with optional .name suffix: "business-actor.Bob"
  const dot = selector.indexOf('.');
  const typePart = dot >= 0 ? selector.slice(0, dot) : selector;
  const namePart = dot >= 0 ? selector.slice(dot + 1) : undefined;
  let typeOk: boolean;
  switch (typePart) {
    case 'concept':
      typeOk = obj.kind === 'element' || obj.kind === 'relationship';
      break;
    case 'element':
      typeOk = obj.kind === 'element';
      break;
    case 'relationship':
      typeOk = obj.kind === 'relationship';
      break;
    case 'view':
      typeOk = obj.kind === 'view';
      break;
    case 'folder':
      typeOk = obj.kind === 'folder';
      break;
    default:
      typeOk = obj.type === typePart;
  }
  return typeOk && (namePart === undefined || obj.name === namePart);
}

// -------------------------------------------------------------- collection

export class JCollection {
  private items: JObject[];

  constructor(items: JObject[] = []) {
    // dedupe by id, keep order
    const seen = new Set<string>();
    this.items = items.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }

  size(): number {
    return this.items.length;
  }

  get length(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  get(i: number): JObject | undefined {
    return this.items[i];
  }

  first(): JObject | undefined {
    return this.items[0];
  }

  last(): JObject | undefined {
    return this.items[this.items.length - 1];
  }

  toArray(): JObject[] {
    return [...this.items];
  }

  each(fn: (obj: JObject, index: number) => void): JCollection {
    this.items.forEach((o, i) => fn(o, i));
    return this;
  }

  map<T>(fn: (obj: JObject, index: number) => T): T[] {
    return this.items.map(fn);
  }

  filter(arg: string | ((obj: JObject) => boolean)): JCollection {
    if (typeof arg === 'function') return new JCollection(this.items.filter((o) => arg(o)));
    return new JCollection(this.items.filter((o) => matchesSelector(o, arg)));
  }

  not(selector: string): JCollection {
    return new JCollection(this.items.filter((o) => !matchesSelector(o, selector)));
  }

  is(selector: string): boolean {
    return this.items.some((o) => matchesSelector(o, selector));
  }

  add(other: JCollection | JObject | string): JCollection {
    if (typeof other === 'string') return new JCollection([...this.items, ...$$(other).items]);
    if (other instanceof JCollection) return new JCollection([...this.items, ...other.items]);
    return new JCollection([...this.items, other]);
  }

  /** children of views/visual containers/folders */
  children(selector?: string): JCollection {
    const m = state();
    const out: JObject[] = [];
    for (const o of this.items) {
      if (o instanceof JView) {
        for (const cid of m.views[o.id]?.childIds ?? []) out.push(new JVisual(cid));
      } else if (o instanceof JVisual) {
        for (const cid of m.nodes[o.id]?.childIds ?? []) out.push(new JVisual(cid));
      } else if (o instanceof JFolder) {
        const f = m.folders[o.id];
        for (const fid of f?.folderIds ?? []) out.push(new JFolder(fid));
        for (const iid of f?.itemIds ?? []) {
          const w = wrap(iid);
          if (w) out.push(w);
        }
      } else if (o instanceof JModel) {
        for (const fid of m.rootFolderIds) out.push(new JFolder(fid));
      }
    }
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  /** all descendants */
  find(selector?: string): JCollection {
    const out: JObject[] = [];
    const walk = (coll: JCollection) => {
      for (const o of coll.toArray()) {
        out.push(o);
        walk(new JCollection([o]).children());
      }
    };
    walk(this.children());
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  parent(selector?: string): JCollection {
    const m = state();
    const out: JObject[] = [];
    for (const o of this.items) {
      if (o instanceof JVisual) {
        const n = m.nodes[o.id];
        if (n) {
          const p = n.parentId === n.viewId ? new JView(n.viewId) : new JVisual(n.parentId);
          out.push(p);
        }
      } else if (o instanceof JFolder) {
        const f = m.folders[o.id];
        if (f?.parentId) out.push(new JFolder(f.parentId));
      } else if (o instanceof JConcept || o instanceof JView) {
        const item = m.elements[o.id] ?? m.relationships[o.id] ?? m.views[o.id];
        if (item) out.push(new JFolder(item.folderId));
      }
    }
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  parents(selector?: string): JCollection {
    const out: JObject[] = [];
    let cur: JCollection = this.parent();
    while (!cur.isEmpty()) {
      out.push(...cur.toArray());
      cur = cur.parent();
    }
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  /** relationships attached to concepts in this collection */
  rels(selector?: string): JCollection {
    return this.relsWhere(() => true, selector);
  }

  inRels(selector?: string): JCollection {
    const ids = new Set(this.conceptIds());
    return this.relsWhere((r) => ids.has(r.targetId), selector);
  }

  outRels(selector?: string): JCollection {
    const ids = new Set(this.conceptIds());
    return this.relsWhere((r) => ids.has(r.sourceId), selector);
  }

  private conceptIds(): string[] {
    return this.items
      .map((o) => (o instanceof JVisual ? (o.concept?.id ?? '') : o.id))
      .filter(Boolean);
  }

  private relsWhere(
    pred: (r: { sourceId: string; targetId: string }) => boolean,
    selector?: string,
  ): JCollection {
    const m = state();
    const ids = new Set(this.conceptIds());
    const out: JObject[] = [];
    for (const rel of Object.values(m.relationships)) {
      if ((ids.has(rel.sourceId) || ids.has(rel.targetId)) && pred(rel)) {
        out.push(new JConcept(rel.id));
      }
    }
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  /** source/target concepts of relationships in this collection */
  sourceEnds(selector?: string): JCollection {
    const m = state();
    const out = this.items
      .filter((o): o is JConcept => o instanceof JConcept && !!m.relationships[o.id])
      .map((o) => new JConcept(m.relationships[o.id].sourceId));
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  targetEnds(selector?: string): JCollection {
    const m = state();
    const out = this.items
      .filter((o): o is JConcept => o instanceof JConcept && !!m.relationships[o.id])
      .map((o) => new JConcept(m.relationships[o.id].targetId));
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  ends(selector?: string): JCollection {
    return this.sourceEnds(selector).add(this.targetEnds(selector));
  }

  /** visual objects referencing concepts in this collection */
  objectRefs(selector?: string): JCollection {
    const m = state();
    const ids = new Set(this.conceptIds());
    const out: JObject[] = [];
    for (const node of Object.values(m.nodes)) {
      if (node.nodeType === 'element' && ids.has(node.elementId)) out.push(new JVisual(node.id));
    }
    for (const conn of Object.values(m.connections)) {
      if (conn.relationshipId && ids.has(conn.relationshipId)) out.push(new JConnection(conn.id));
    }
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  /** views containing concepts in this collection */
  viewRefs(selector?: string): JCollection {
    const out = this.objectRefs()
      .toArray()
      .map((o) => (o as JVisual | JConnection).view);
    const coll = new JCollection(out);
    return selector ? coll.filter(selector) : coll;
  }

  attr(name: string, value?: unknown): unknown {
    if (value === undefined) {
      const first = this.items[0] as unknown as Record<string, unknown> | undefined;
      return first?.[name];
    }
    for (const o of this.items) {
      (o as unknown as Record<string, unknown>)[name] = value;
    }
    return this;
  }

  prop(key?: string, value?: string, duplicate?: boolean): unknown {
    if (key !== undefined && value !== undefined) {
      for (const o of this.items) {
        (o as JConcept).prop?.(key, value, duplicate);
      }
      return this;
    }
    const first = this.items[0] as JConcept | undefined;
    return first?.prop?.(key, value);
  }

  removeProp(key: string, value?: string): JCollection {
    for (const o of this.items) (o as JConcept).removeProp?.(key, value);
    return this;
  }

  delete(): void {
    for (const o of this.items) {
      (o as JConcept).delete?.();
    }
  }

  clone(): JCollection {
    return new JCollection(this.items);
  }
}

// ------------------------------------------------------------------- $()

function allObjects(): JObject[] {
  const m = state();
  const out: JObject[] = [];
  for (const id of Object.keys(m.folders)) out.push(new JFolder(id));
  for (const id of Object.keys(m.elements)) out.push(new JConcept(id));
  for (const id of Object.keys(m.relationships)) out.push(new JConcept(id));
  for (const id of Object.keys(m.views)) out.push(new JView(id));
  return out;
}

export function $$(selector: string | JObject | JCollection): JCollection {
  if (selector instanceof JCollection) return selector.clone();
  if (selector instanceof JObject) return new JCollection([selector]);
  if (typeof selector !== 'string') return new JCollection();
  return new JCollection(allObjects().filter((o) => matchesSelector(o, selector)));
}

export function createJArchiGlobals() {
  const model = new JModel('model');
  const $ = (selector: string | JObject | JCollection) => $$(selector);
  $.model = model;
  return { $, model };
}
