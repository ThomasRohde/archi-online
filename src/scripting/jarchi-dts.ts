/** Type declarations injected into Monaco for script IntelliSense. */
export const JARCHI_DTS = `
declare interface JObject {
  readonly id: string;
  readonly type: string;
  name: string;
  documentation: string;
  /** Get property names (no args), get a value (key) or set a value (key, value). */
  prop(): string[];
  prop(key: string): string | undefined;
  prop(key: string, value: string, duplicate?: boolean): void;
  removeProp(key: string, value?: string): void;
  delete(): void;
}

declare interface JConcept extends JObject {
  /** Relationship source/target (relationships only) */
  readonly source?: JConcept;
  readonly target?: JConcept;
  /** Access relationships: "write" | "read" | "access" | "readwrite" */
  accessType?: string;
  influenceStrength?: string;
  associationDirected?: boolean;
}

declare interface JBounds { x: number; y: number; width: number; height: number }

declare interface JVisual extends JObject {
  readonly concept?: JConcept;
  readonly view: JView;
  bounds: Partial<JBounds>;
  fillColor: string | undefined;
  lineColor: string | undefined;
  fontColor: string | undefined;
  opacity: number;
  text: string;
  /** Add a nested element (coordinates relative to this container). */
  add(element: JConcept, x: number, y: number, width: number, height: number): JVisual;
}

declare interface JConnection extends JObject {
  readonly concept?: JConcept;
  readonly view: JView;
  readonly source: JVisual;
  readonly target: JVisual;
  lineColor: string | undefined;
}

declare interface JView extends JObject {
  readonly viewpoint?: string;
  /** Add an element to the view, or a relationship between two visual objects. */
  add(element: JConcept, x: number, y: number, width: number, height: number): JVisual;
  add(relationship: JConcept, source: JVisual, target: JVisual): JConnection;
  createObject(type: 'note' | 'group', x: number, y: number, width: number, height: number): JVisual;
  openInUI(): void;
}

declare interface JFolder extends JObject {}

declare interface JCollection {
  size(): number;
  readonly length: number;
  isEmpty(): boolean;
  get(i: number): JObject | undefined;
  first(): any;
  last(): any;
  toArray(): JObject[];
  each(fn: (obj: any, index: number) => void): JCollection;
  map<T>(fn: (obj: any, index: number) => T): T[];
  filter(selector: string | ((obj: any) => boolean)): JCollection;
  not(selector: string): JCollection;
  is(selector: string): boolean;
  add(other: JCollection | JObject | string): JCollection;
  children(selector?: string): JCollection;
  find(selector?: string): JCollection;
  parent(selector?: string): JCollection;
  parents(selector?: string): JCollection;
  rels(selector?: string): JCollection;
  inRels(selector?: string): JCollection;
  outRels(selector?: string): JCollection;
  ends(selector?: string): JCollection;
  sourceEnds(selector?: string): JCollection;
  targetEnds(selector?: string): JCollection;
  objectRefs(selector?: string): JCollection;
  viewRefs(selector?: string): JCollection;
  attr(name: string, value?: unknown): unknown;
  prop(key?: string, value?: string, duplicate?: boolean): unknown;
  removeProp(key: string, value?: string): JCollection;
  delete(): void;
}

declare interface JModel {
  name: string;
  purpose: string;
  prop(): string[];
  prop(key: string): string | undefined;
  prop(key: string, value: string, duplicate?: boolean): void;
  removeProp(key: string, value?: string): void;
  createElement(type: string, name?: string, folder?: JFolder): JConcept;
  createRelationship(type: string, name: string, source: JConcept, target: JConcept, folder?: JFolder): JConcept;
  createArchimateView(name?: string, folder?: JFolder): JView;
}

/** Select objects: "*", "element", "relationship", "view", "folder", "concept",
 *  a type like "business-actor", "#id", ".Name", or "business-actor.Bob". */
declare function $(selector: string | JObject | JCollection): JCollection;
declare namespace $ {
  const model: JModel;
}
declare const model: JModel;
declare function exit(): never;
`;
