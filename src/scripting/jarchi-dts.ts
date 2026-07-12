/** Type declarations injected into Monaco for script IntelliSense. */
export const JARCHI_SCRIPT_DTS = `
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
  specialization?: string;
  /** Relationship source/target (relationships only) */
  readonly source?: JConcept;
  readonly target?: JConcept;
  /** Access relationships: "write" | "read" | "access" | "readwrite" */
  accessType?: string;
  influenceStrength?: string;
  associationDirected?: boolean;
}

declare interface JBounds { x: number; y: number; width: number; height: number }
declare interface JPoint { x: number; y: number }
declare interface JBendpoint { startX: number; startY: number; endX: number; endY: number }

type JConnectable = JVisual | JConnection;

declare interface JVisual extends JObject {
  readonly concept?: JConcept;
  readonly view: JView;
  bounds: Partial<JBounds>;
  fillColor: string | undefined;
  lineColor: string | undefined;
  fontColor: string | undefined;
  opacity: number;
  labelExpression: string | undefined;
  gradient: number;
  lineStyle: number;
  lineWidth: number;
  /** 0 uses the specialization image; 1 uses a custom image. */
  imageSource: number;
  imagePosition: number;
  text: string;
  /** Add a nested element (coordinates relative to this container). */
  add(element: JConcept, x: number, y: number, width: number, height: number): JVisual;
  parent(): JView | JVisual;
  children(): JVisual[];
  absoluteBounds(): JBounds;
  connections(options?: { incoming?: boolean; outgoing?: boolean }): JConnection[];
}

declare interface JConnection extends JObject {
  readonly concept?: JConcept;
  readonly view: JView;
  readonly source: JConnectable;
  readonly target: JConnectable;
  lineColor: string | undefined;
  labelExpression: string | undefined;
  lineStyle: number;
  lineWidth: number;
  bendpoints: JBendpoint[];
  absoluteRoute(): JPoint[];
  setAbsoluteRoute(points: JPoint[]): void;
  routedPoints(): JPoint[];
  reconnect(end: 'source' | 'target', endpoint: JConnectable): void;
}

declare interface JView extends JObject {
  readonly viewpoint?: string;
  routerType: 'manual' | 'manhattan';
  /** Add an element to the view, or a relationship between two visual objects. */
  add(element: JConcept, x: number, y: number, width: number, height: number): JVisual;
  add(relationship: JConcept, source: JConnectable, target: JConnectable): JConnection;
  createObject(type: 'note' | 'group', x: number, y: number, width: number, height: number): JVisual;
  nodes(options?: { recursive?: boolean }): JVisual[];
  connections(): JConnection[];
  bounds(options?: { recursive?: boolean }): JBounds | null;
  layout(layout: {
    nodes?: Record<string, Partial<JBounds>>;
    connections?: Record<string, { route?: JPoint[]; bendpoints?: JBendpoint[] }>;
  }): void;
  openInUI(): void;
}

declare interface JFolder extends JObject {
  labelExpression: string | undefined;
}

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
  readonly specializations: JProfile[];
  createSpecialization(name: string, conceptType: string, image?: { path: string }): JProfile;
  findSpecialization(name: string, conceptType: string): JProfile | undefined;
  createElement(type: string, name?: string, folder?: JFolder): JConcept;
  createRelationship(type: string, name: string, source: JConcept, target: JConcept, folder?: JFolder): JConcept;
  createArchimateView(name?: string, folder?: JFolder): JView;
}

declare interface JProfile {
  name: string;
  type: string;
  image: { path: string } | undefined;
  delete(): void;
}

declare interface JElkLayoutOptions {
  view?: JView;
  scope?: 'selection-or-view' | 'selection' | 'view';
  direction?: 'right' | 'down' | 'left' | 'up';
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeRouting?: 'preserve' | 'orthogonal' | 'splines';
  recursive?: boolean;
}

declare interface JElkLayoutResult {
  scope: 'selection' | 'view';
  nodeCount: number;
  connectionCount: number;
  routedConnectionCount: number;
  elapsedMs: number;
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

export const JARCHI_EXTENSION_DTS = `
declare const app: {
  extension: {
    (meta: { id: string; name: string; version: string }): void;
    package(): {
      id: string;
      name: string;
      version: string;
      description?: string;
      main: string;
      files: string[];
      installedAt: number;
      updatedAt: number;
    } | null;
  };
  manifest: {
    get(): {
      schemaVersion: 2;
      id: string;
      name: string;
      version: string;
      description?: string;
      main: string;
      contributes?: unknown;
    };
  };
  assets: {
    text(path: string): string;
    json(path: string): unknown;
    url(path: string): string;
  };
  views: {
    active(): JView | null;
    open(id: string): JView | null;
    get(id: string): JView | null;
    all(): JView[];
  };
  selection: {
    ids(): string[];
    items(): JObject[];
    visuals(): JVisual[];
    clear(): void;
  };
  layout: {
    elk(options?: JElkLayoutOptions): Promise<JElkLayoutResult>;
  };
  commands: {
    register(id: string, options: {
      title: string;
      description?: string;
      run(context: unknown, args?: unknown): unknown;
    }): void;
    run(id: string, args?: unknown): Promise<unknown>;
  };
  toolbar: {
    addButton(options: { id: string; label: string; command: string }): void;
  };
  menus: {
    addItem(
      location: 'extensions.menu' | 'model-tree.context' | 'view.context' | 'selection.context',
      options: { id?: string; label: string; command: string; danger?: boolean },
    ): void;
  };
  panels: {
    register(
      id: string,
      options: { title: string; render(container: HTMLElement): void | (() => void) },
    ): void;
    show(id: string): void;
  };
  events: {
    on(
      name:
        | 'app.ready'
        | 'model.opened'
        | 'model.changed'
        | 'model.saved'
        | 'model.activated'
        | 'model.closed'
        | 'selection.changed'
        | 'view.opened'
        | 'view.activated'
        | 'view.contextMenu'
        | 'tree.contextMenu'
        | 'script.error',
      handler: (payload: unknown) => unknown,
    ): void;
    off(
      name:
        | 'app.ready'
        | 'model.opened'
        | 'model.changed'
        | 'model.saved'
        | 'model.activated'
        | 'model.closed'
        | 'selection.changed'
        | 'view.opened'
        | 'view.activated'
        | 'view.contextMenu'
        | 'tree.contextMenu'
        | 'script.error',
      handler: (payload: unknown) => unknown,
    ): void;
  };
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
  dialogs: {
    info(title: string, message?: string): Promise<void>;
    confirm(title: string, message?: string): Promise<boolean>;
  };
  model: {
    current(): unknown;
  };
};
`;

export const JARCHI_DTS = JARCHI_SCRIPT_DTS;
