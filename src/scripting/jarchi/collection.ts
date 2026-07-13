import { getActiveModelStore, type ModelStore } from '../../model/store';
import { state } from './state';
import { allObjects, matchesSelector } from './selectors';
import { assertSameModelBinding, bindModelOwner, boundModelStore } from './binding';
import {
  JConcept,
  JConnection,
  JFolder,
  JModel,
  JObject,
  JView,
  JVisual,
  wrap,
} from './wrappers';

export class JCollection {
  private items: JObject[];

  constructor(items: JObject[] = [], modelStore?: ModelStore) {
    const store = modelStore ?? (items[0] ? boundModelStore(items[0]) : getActiveModelStore());
    bindModelOwner(this, store);
    assertSameModelBinding(this, ...items);
    // Dedupe by id, keep order.
    const seen = new Set<string>();
    this.items = items.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }

  size(): number {
    boundModelStore(this);
    return this.items.length;
  }

  get length(): number {
    boundModelStore(this);
    return this.items.length;
  }

  isEmpty(): boolean {
    boundModelStore(this);
    return this.items.length === 0;
  }

  get(i: number): JObject | undefined {
    boundModelStore(this);
    return this.items[i];
  }

  first(): JObject | undefined {
    boundModelStore(this);
    return this.items[0];
  }

  last(): JObject | undefined {
    boundModelStore(this);
    return this.items[this.items.length - 1];
  }

  toArray(): JObject[] {
    boundModelStore(this);
    return [...this.items];
  }

  each(fn: (obj: JObject, index: number) => void): JCollection {
    boundModelStore(this);
    this.items.forEach((o, i) => fn(o, i));
    return this;
  }

  map<T>(fn: (obj: JObject, index: number) => T): T[] {
    boundModelStore(this);
    return this.items.map(fn);
  }

  filter(arg: string | ((obj: JObject) => boolean)): JCollection {
    const store = boundModelStore(this);
    if (typeof arg === 'function') {
      return new JCollection(this.items.filter((o) => arg(o)), store);
    }
    return new JCollection(
      this.items.filter((o) => matchesSelector(o, arg)),
      store,
    );
  }

  not(selector: string): JCollection {
    const store = boundModelStore(this);
    return new JCollection(
      this.items.filter((o) => !matchesSelector(o, selector)),
      store,
    );
  }

  is(selector: string): boolean {
    boundModelStore(this);
    return this.items.some((o) => matchesSelector(o, selector));
  }

  add(other: JCollection | JObject | string): JCollection {
    const store = boundModelStore(this);
    if (typeof other === 'string') {
      return new JCollection(
        [
          ...this.items,
          ...allObjects(store).filter((o) => matchesSelector(o, other)),
        ],
        store,
      );
    }
    if (other instanceof JCollection) {
      this.assertSameModelStore(other);
      return new JCollection([...this.items, ...other.items], store);
    }
    this.assertSameModelStore(other);
    return new JCollection([...this.items, other], store);
  }

  /** Children of views/visual containers/folders. */
  children(selector?: string): JCollection {
    const m = state(boundModelStore(this));
    const out: JObject[] = [];
    for (const o of this.items) {
      if (o instanceof JView) {
        for (const cid of m.views[o.id]?.childIds ?? []) {
          out.push(new JVisual(cid, boundModelStore(this)));
        }
      } else if (o instanceof JVisual) {
        for (const cid of m.nodes[o.id]?.childIds ?? []) {
          out.push(new JVisual(cid, boundModelStore(this)));
        }
      } else if (o instanceof JFolder) {
        const f = m.folders[o.id];
        for (const fid of f?.folderIds ?? []) out.push(new JFolder(fid, boundModelStore(this)));
        for (const iid of f?.itemIds ?? []) {
          const w = wrap(iid, boundModelStore(this));
          if (w) out.push(w);
        }
      } else if (o instanceof JModel) {
        for (const fid of m.rootFolderIds) out.push(new JFolder(fid, boundModelStore(this)));
      }
    }
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  /** All descendants. */
  find(selector?: string): JCollection {
    const out: JObject[] = [];
    const walk = (coll: JCollection) => {
      for (const o of coll.toArray()) {
        out.push(o);
        walk(new JCollection([o], boundModelStore(this)).children());
      }
    };
    walk(this.children());
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  parent(selector?: string): JCollection {
    const m = state(boundModelStore(this));
    const out: JObject[] = [];
    for (const o of this.items) {
      if (o instanceof JVisual) {
        const n = m.nodes[o.id];
        if (n) {
          const p = n.parentId === n.viewId
            ? new JView(n.viewId, boundModelStore(this))
            : new JVisual(n.parentId, boundModelStore(this));
          out.push(p);
        }
      } else if (o instanceof JFolder) {
        const f = m.folders[o.id];
        if (f?.parentId) out.push(new JFolder(f.parentId, boundModelStore(this)));
      } else if (o instanceof JConcept || o instanceof JView) {
        const item = m.elements[o.id] ?? m.relationships[o.id] ?? m.views[o.id];
        if (item) out.push(new JFolder(item.folderId, boundModelStore(this)));
      }
    }
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  parents(selector?: string): JCollection {
    const out: JObject[] = [];
    let cur: JCollection = this.parent();
    while (!cur.isEmpty()) {
      out.push(...cur.toArray());
      cur = cur.parent();
    }
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  /** Relationships attached to concepts in this collection. */
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
    const m = state(boundModelStore(this));
    const ids = new Set(this.conceptIds());
    const out: JObject[] = [];
    for (const rel of Object.values(m.relationships)) {
      if ((ids.has(rel.sourceId) || ids.has(rel.targetId)) && pred(rel)) {
        out.push(new JConcept(rel.id, boundModelStore(this)));
      }
    }
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  /** Source/target concepts of relationships in this collection. */
  sourceEnds(selector?: string): JCollection {
    const m = state(boundModelStore(this));
    const out = this.items
      .filter((o): o is JConcept => o instanceof JConcept && !!m.relationships[o.id])
      .map((o) => new JConcept(m.relationships[o.id].sourceId, boundModelStore(this)));
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  targetEnds(selector?: string): JCollection {
    const m = state(boundModelStore(this));
    const out = this.items
      .filter((o): o is JConcept => o instanceof JConcept && !!m.relationships[o.id])
      .map((o) => new JConcept(m.relationships[o.id].targetId, boundModelStore(this)));
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  ends(selector?: string): JCollection {
    return this.sourceEnds(selector).add(this.targetEnds(selector));
  }

  /** Visual objects referencing concepts in this collection. */
  objectRefs(selector?: string): JCollection {
    const m = state(boundModelStore(this));
    const ids = new Set(this.conceptIds());
    const out: JObject[] = [];
    for (const node of Object.values(m.nodes)) {
      if (node.nodeType === 'element' && ids.has(node.elementId)) {
        out.push(new JVisual(node.id, boundModelStore(this)));
      }
    }
    for (const conn of Object.values(m.connections)) {
      if (conn.relationshipId && ids.has(conn.relationshipId)) {
        out.push(new JConnection(conn.id, boundModelStore(this)));
      }
    }
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  /** Views containing concepts in this collection. */
  viewRefs(selector?: string): JCollection {
    const out = this.objectRefs()
      .toArray()
      .map((o) => (o as JVisual | JConnection).view);
    const coll = new JCollection(out, boundModelStore(this));
    return selector ? coll.filter(selector) : coll;
  }

  attr(name: string, value?: unknown): unknown {
    boundModelStore(this);
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
    boundModelStore(this);
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
    boundModelStore(this);
    for (const o of this.items) (o as JConcept).removeProp?.(key, value);
    return this;
  }

  delete(): void {
    boundModelStore(this);
    for (const o of this.items) {
      (o as JConcept).delete?.();
    }
  }

  clone(): JCollection {
    return new JCollection(this.items, boundModelStore(this));
  }

  private assertSameModelStore(other: object): void {
    assertSameModelBinding(this, other);
  }
}
