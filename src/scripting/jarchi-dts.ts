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
  /** Replace this concept with a new concept of another ArchiMate type. */
  setType(type: string): JConcept;
  /** Invert a relationship in place. Throws for elements or illegal reversals. */
  invert(): JConcept;
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

declare interface JLegendOptions {
  displayElements: boolean;
  displayRelations: boolean;
  displaySpecializationElements: boolean;
  displaySpecializationRelations: boolean;
  rowsPerColumn: number;
  widthOffset: number;
  /** 0=None, 1=Core, 2=User. */
  colorScheme: 0 | 1 | 2;
  /** 0=Name, 1=Category. */
  sortMethod: 0 | 1;
}

type JConnectable = JVisual | JConnection;

declare interface JPackedTreeOptions {
  /** 'grid' tiles uniform cells (default); 'treemap' sizes leaves by weight. */
  mode?: 'grid' | 'treemap';
  /** Treemap tiling; 'auto' = squarify when sorting by weight, else order-preserving strip. */
  algorithm?: 'auto' | 'squarify' | 'strip';
  leafWidth?: number;
  leafHeight?: number;
  padding?: number;
  gutter?: number;
  /** Container label strip kept clear of children. */
  titleBandHeight?: number;
  /** Width/height goal for containers (default 1.6). */
  targetAspect?: number;
  /** Sorting is a pre-step; packing never permutes sibling order. */
  sort?: 'name' | 'weight' | 'none';
  /** Grid: fixed items per row. */
  columns?: number;
  aesthetics?: { aspect?: number; raggedness?: number; whitespace?: number };
  minCellWidth?: number;
  minCellHeight?: number;
}

declare interface JPackedMapStyle {
  levelFills?: string[];
  baseFill?: string;
  /** Font size in points per depth; deeper levels clamp to the last entry. */
  fontSizes?: number[];
  parentTextAlignment?: number;
  parentTextPosition?: number;
  leafTextAlignment?: number;
  leafTextPosition?: number;
  iconVisible?: 0 | 1 | 2;
  /** false = geometry only. */
  applyStyling?: boolean;
}

declare interface JPackedMapOptions {
  elementTypes?: string[];
  relationshipTypes?: string[];
  depth?: number;
  direction?: 'source-is-parent' | 'target-is-parent';
  /** Element property parsed as a number for treemap weights. */
  weightProperty?: string;
  mode?: 'grid' | 'treemap';
  layout?: JPackedTreeOptions;
  style?: JPackedMapStyle;
}

declare interface JPackedViewOptions extends JPackedMapOptions {
  roots: JConcept | JConcept[] | string[];
  name?: string;
  open?: boolean;
}

declare interface JPackedSyncOptions extends JPackedMapOptions {
  roots?: JConcept | JConcept[] | string[];
}

declare interface JPackedLayoutOptions extends JPackedTreeOptions {
  weightProperty?: string;
  scope?: JVisual[];
}

declare interface JHeatmapBucket { label: string; color: string }

declare interface JHeatmapOptions {
  /** Element property to color by. */
  property: string;
  scope?: JVisual[];
  /** auto = numeric iff every present value parses as a finite number. */
  mode?: 'auto' | 'numeric' | 'enum';
  palette?: string[];
  min?: number;
  max?: number;
  missingColor?: string;
  legend?: { x?: number; y?: number; title?: string } | false;
}

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
  /** Font size in points. */
  fontSize: number;
  fontName: string;
  fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic';
  /** SWT alignment: 1=left, 2=center, 4=right. */
  textAlignment: number;
  /** 0=top, 1=center, 2=bottom. */
  textPosition: number;
  /** 0=default figure, 1=alternate figure (element visuals only). */
  figureType: number;
  /** Group: 0=tabbed, 1=rectangle. Note: 0=dog-ear, 1=rectangle, 2=none. */
  borderType: number;
  /** 0=visible unless an image replaces it, 1=always visible, 2=hidden. */
  iconVisible: number;
  /** 0 uses the specialization image; 1 uses a custom image. */
  imageSource: number;
  imagePosition: number;
  text: string;
  get legendOptions(): JLegendOptions | undefined;
  set legendOptions(value: JLegendOptions);
  setLegendOptimalSize(): void;
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
  fontColor: string | undefined;
  font: string | undefined;
  labelExpression: string | undefined;
  lineStyle: number;
  lineWidth: number;
  connectionType: number;
  nameVisible: boolean;
  textPosition: number;
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
  createLegend(x: number, y: number, options?: Partial<JLegendOptions>): JVisual;
  createPlainConnection(source: JConnectable, target: JConnectable, connectionType?: number): JConnection;
  nodes(options?: { recursive?: boolean }): JVisual[];
  connections(): JConnection[];
  bounds(options?: { recursive?: boolean }): JBounds | null;
  layout(layout: {
    nodes?: Record<string, Partial<JBounds>>;
    connections?: Record<string, { route?: JPoint[]; bendpoints?: JBendpoint[] }>;
  }): void;
  /** Repack nested element nodes into a packed capability-map layout (Archi Online API). */
  layoutPacked(options?: JPackedLayoutOptions): { nodeCount: number; size: { width: number; height: number } };
  /** Reconcile a packed map with the model: add, remove, reparent, repack (Archi Online API). */
  syncPacked(options?: JPackedSyncOptions): { added: number; removed: number; reparented: number };
  /** Color element nodes from an element property and add a bucket legend (Archi Online API). */
  applyHeatmap(options: JHeatmapOptions): { painted: number; missing: number; buckets: JHeatmapBucket[] };
  openInUI(): void;
}

declare interface JFolder extends JObject {
  labelExpression: string | undefined;
}

declare interface JFindReplaceSearchOptions {
  find: string;
  scope?: 'model' | 'active-view';
  name?: boolean;
  documentation?: boolean;
  propertyValues?: boolean;
  matchCase?: boolean;
  regex?: boolean;
}

declare interface JFindReplaceOptions extends JFindReplaceSearchOptions {
  replace: string;
}

declare interface JFindReplaceRow {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerKind: 'model' | 'folder' | 'element' | 'relationship' | 'view' | 'group' | 'note' | 'plain-connection';
  readonly ownerType: string;
  readonly location: string;
  readonly field: string;
  readonly before: string;
  readonly after: string;
  readonly count: number;
}

declare interface JFindReplacePreview {
  readonly valid: boolean;
  readonly error: string | null;
  readonly rows: readonly JFindReplaceRow[];
}

declare interface JPropertyOccurrence {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerKind: 'model' | 'folder' | 'element' | 'relationship' | 'view' | 'group' | 'note' | 'plain-connection';
  readonly ownerType: string;
  readonly location: string;
  readonly propertyIndex: number;
  readonly key: string;
  readonly value: string;
}

declare interface JPropertyKeyUsage {
  readonly key: string;
  readonly displayKey: string;
  readonly occurrenceCount: number;
  readonly ownerCount: number;
  readonly occurrences: readonly JPropertyOccurrence[];
}

declare interface JPropertyMutationPreview {
  readonly valid: boolean;
  readonly error: string | null;
  readonly warning: string | null;
  readonly operation: 'rename' | 'delete';
  readonly key: string;
  readonly newKey: string | null;
  readonly collision: boolean;
  readonly collisionAcknowledged: boolean;
  readonly occurrences: readonly JPropertyOccurrence[];
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
  search(options: JFindReplaceSearchOptions): JFindReplaceRow[];
  previewReplace(options: JFindReplaceOptions): JFindReplacePreview;
  applyReplace(preview: JFindReplacePreview, selectedRowIds?: readonly string[]): number;
  propertyUsage(search?: string): readonly JPropertyKeyUsage[];
  previewRenamePropertyKey(key: string, newKey: string, collisionAcknowledged?: boolean): JPropertyMutationPreview;
  renamePropertyKey(preview: JPropertyMutationPreview): number;
  previewDeletePropertyKey(key: string): JPropertyMutationPreview;
  deletePropertyKey(preview: JPropertyMutationPreview): number;
  readonly specializations: JProfile[];
  createSpecialization(name: string, conceptType: string, image?: { path: string }): JProfile;
  findSpecialization(name: string, conceptType: string): JProfile | undefined;
  createElement(type: string, name?: string, folder?: JFolder): JConcept;
  createRelationship(type: string, name: string, source: JConcept, target: JConcept, folder?: JFolder): JConcept;
  createArchimateView(name?: string, folder?: JFolder): JView;
  /** Generate a packed capability-map view from whole -> part relationships (Archi Online API). */
  createPackedView(options: JPackedViewOptions): JView;
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
