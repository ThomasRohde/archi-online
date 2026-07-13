import {
  isElementType,
  isRelationshipType,
  toKebab,
  type ElementType,
  type RelationshipType,
} from '../../model/metamodel';
import {
  addConnectionToView,
  applyFindReplace,
  deletePropertyKey as applyPropertyKeyDelete,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addLegendToView,
  addNoteToView,
  addRelationship,
  addView,
  analyzeConceptTypeChange,
  analyzeConnectionReconnection,
  analyzeRelationshipInversion,
  applyConceptTypeChange,
  applyConnectionReconnection,
  applyRelationshipInversion,
  createNestedConnectionVisibilityResolver,
  createProfile,
  createPlainConnectionOnView,
  deleteItems,
  deleteProfile,
  deleteViewObjects,
  layoutView,
  renameItem,
  resizeNode,
  renamePropertyKey as applyPropertyKeyRename,
  setConnectionBendpoints,
  setViewConnectionRouterType,
  setDocumentation,
  setNodeStyle,
  setLabelExpression,
  setLegendOptimalSize,
  setLegendOptions,
  setProperties,
  setPlainConnectionAttributes,
  setRelationshipAttrs,
  setConceptProfiles,
  updateProfile,
} from '../../model/ops';
import { getActiveModelStore, openView, type ModelStore } from '../../model/store';
import {
  captureFindReplaceSession,
  previewFindReplace,
  type FindReplacePreview,
  type FindReplaceRow,
  type FindReplaceScope,
} from '../../model/find-replace';
import {
  capturePropertyManagerSession,
  inspectPropertyUsage,
  previewPropertyDelete,
  previewPropertyRename,
  type PropertyKeyUsage,
  type PropertyMutationPreview,
  type PropertyOccurrence,
} from '../../model/property-manager';
import {
  absoluteBounds as modelAbsoluteBounds,
  type Bendpoint,
  type Bounds,
  type Concept,
  type DiagramConnection,
  type ModelState,
  type ProfileDefinition,
  type Property,
} from '../../model/types';
import { isLegendNote, type LegendOptions } from '../../model/legend';
import { useSettingsStore } from '../../settings/app-settings';
import {
  bendpointPositions,
  createConnectionRouteResolver,
  createConnectionVisibilityResolver,
  toRelativeBendpoint,
} from '../../canvas/geometry';
import { state } from './state';
import { resolveType } from './type-resolution';

export type JKind = 'element' | 'relationship' | 'view' | 'folder' | 'visual' | 'connection' | 'model';

export type JConnectable = JVisual | JConnection;

export interface JPoint {
  x: number;
  y: number;
}

export type JBounds = Bounds;

export type JBendpoint = Bendpoint;

export interface JFindReplaceSearchOptions {
  find: string;
  scope?: FindReplaceScope;
  name?: boolean;
  documentation?: boolean;
  propertyValues?: boolean;
  matchCase?: boolean;
  regex?: boolean;
}

export interface JFindReplaceOptions extends JFindReplaceSearchOptions {
  replace: string;
}

export type JFindReplaceRow = FindReplaceRow;
export type JFindReplacePreview = FindReplacePreview;
export type JPropertyOccurrence = PropertyOccurrence;
export type JPropertyKeyUsage = PropertyKeyUsage;
export type JPropertyMutationPreview = PropertyMutationPreview;

function findReplaceOptions(
  options: JFindReplaceSearchOptions,
  replacement: string,
) {
  return {
    find: options.find,
    replace: replacement,
    scope: options.scope ?? 'model',
    searchName: options.name ?? true,
    searchDocumentation: options.documentation ?? true,
    searchPropertyValues: options.propertyValues ?? false,
    matchCase: options.matchCase ?? false,
    useRegex: options.regex ?? false,
  };
}

export interface ViewLayoutInput {
  nodes?: Record<string, Partial<JBounds>>;
  connections?: Record<string, { route?: JPoint[]; bendpoints?: JBendpoint[] }>;
}

export abstract class JObject {
  constructor(
    readonly id: string,
    readonly modelStore: ModelStore = getActiveModelStore(),
  ) {}
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
    return other instanceof JObject &&
      other.id === this.id &&
      other.modelStore === this.modelStore;
  }
}

interface ModelStoreBound {
  readonly modelStore: ModelStore;
}

function assertSameModelStore(
  owner: ModelStoreBound,
  ...others: (ModelStoreBound | undefined)[]
): void {
  if (others.some((other) => other && other.modelStore !== owner.modelStore)) {
    throw new Error('Cannot mix jArchi wrappers from different model sessions');
  }
}

function propsOf(id: string, store: ModelStore): Property[] {
  const m = state(store);
  return (
    m.elements[id]?.properties ??
    m.relationships[id]?.properties ??
    m.connections[id]?.properties ??
    m.views[id]?.properties ??
    m.folders[id]?.properties ??
    (m.info.id === id ? m.info.properties : []) ??
    []
  );
}

/** Shared prop()/removeProp() implementation (concepts, views, folders, model). */
function propApi(target: { id: string; modelStore: ModelStore }) {
  return {
    prop(key?: string, value?: string, duplicate?: boolean): unknown {
      const props = propsOf(target.id, target.modelStore);
      if (key === undefined) return [...new Set(props.map((p) => p.key))];
      if (value === undefined) return props.find((p) => p.key === key)?.value;
      if (duplicate || !props.some((p) => p.key === key)) {
        setProperties(target.id, [...props, { key, value }], target.modelStore);
      } else {
        setProperties(
          target.id,
          props.map((p) => (p.key === key ? { ...p, value } : p)),
          target.modelStore,
        );
      }
      return undefined;
    },
    removeProp(key: string, value?: string): void {
      const props = propsOf(target.id, target.modelStore);
      setProperties(
        target.id,
        props.filter((p) => p.key !== key || (value !== undefined && p.value !== value)),
        target.modelStore,
      );
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function optionalFiniteNumber(
  source: Record<string, unknown>,
  key: keyof Bounds,
  fallback: number,
  label: string,
): number {
  if (!(key in source) || source[key] === undefined) return fallback;
  return finiteNumber(source[key], `${label}.${key}`);
}

function validatePoint(value: unknown, label: string): JPoint {
  if (!isRecord(value)) throw new Error(`${label} must be a point`);
  return {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
  };
}

function validatePointArray(value: unknown, label: string): JPoint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((point, index) => validatePoint(point, `${label}[${index}]`));
}

function validateBendpoint(value: unknown, label: string): Bendpoint {
  if (!isRecord(value)) throw new Error(`${label} must be a bendpoint`);
  return {
    startX: finiteNumber(value.startX, `${label}.startX`),
    startY: finiteNumber(value.startY, `${label}.startY`),
    endX: finiteNumber(value.endX, `${label}.endX`),
    endY: finiteNumber(value.endY, `${label}.endY`),
  };
}

function validateBendpointArray(value: unknown, label: string): Bendpoint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((bp, index) => validateBendpoint(bp, `${label}[${index}]`));
}

function assertViewConnection(
  m: ModelState,
  viewId: string,
  connectionId: string,
): DiagramConnection {
  const conn = m.connections[connectionId];
  if (!conn || conn.viewId !== viewId) {
    throw new Error(`Connection ${connectionId} is not in view ${viewId}`);
  }
  return conn;
}

function connectionEndpointCenters(
  m: ModelState,
  conn: DiagramConnection,
  boundsForNode: (nodeId: string) => Bounds,
  connectionOverride?: (connectionId: string) => DiagramConnection | undefined,
): { source: JPoint; target: JPoint } {
  const bounds = new Map(
    Object.values(m.nodes)
      .filter((node) => node.viewId === conn.viewId)
      .map((node) => [node.id, boundsForNode(node.id)]),
  );
  const visible = createConnectionVisibilityResolver(m);
  const endpoints = createConnectionRouteResolver(m, bounds, {
    connection: connectionOverride,
    isVisible: visible,
  }).endpointPoints(conn.id);
  if (!endpoints) throw new Error(`Connection ${conn.id} has a missing endpoint`);
  return endpoints;
}

function absoluteRouteForConnection(
  m: ModelState,
  conn: DiagramConnection,
  boundsForNode: (nodeId: string) => Bounds = (nodeId) => modelAbsoluteBounds(m, nodeId),
): JPoint[] {
  const centers = connectionEndpointCenters(m, conn, boundsForNode);
  return bendpointPositions(conn.bendpoints, centers.source, centers.target)
    .map((point) => ({ ...point }));
}

function renderedRouteForConnection(m: ModelState, conn: DiagramConnection): JPoint[] {
  const bounds = new Map(
    Object.values(m.nodes)
      .filter((node) => node.viewId === conn.viewId)
      .map((node) => [node.id, modelAbsoluteBounds(m, node.id)]),
  );
  const route = createConnectionRouteResolver(m, bounds, {
    isVisible: createNestedConnectionVisibilityResolver(
      m,
      useSettingsStore.getState().settings,
    ),
  })(conn.id);
  if (!route) throw new Error(`Connection ${conn.id} has a missing endpoint`);
  return route.map((point) => ({ ...point }));
}

function routeToBendpoints(
  m: ModelState,
  conn: DiagramConnection,
  points: JPoint[],
  boundsForNode: (nodeId: string) => Bounds = (nodeId) => modelAbsoluteBounds(m, nodeId),
  connectionOverride?: (connectionId: string) => DiagramConnection | undefined,
): Bendpoint[] {
  const centers = connectionEndpointCenters(m, conn, boundsForNode, connectionOverride);
  return points.map((point) => toRelativeBendpoint(point, centers.source, centers.target));
}

export class JConcept extends JObject {
  get kind(): JKind {
    const m = state(this.modelStore);
    return m.relationships[this.id] ? 'relationship' : 'element';
  }

  private concept(): Concept {
    const m = state(this.modelStore);
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
    renameItem(this.id, v, this.modelStore);
  }

  get documentation(): string {
    return this.concept().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v, this.modelStore);
  }

  get source(): JConcept | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? new JConcept(c.sourceId, this.modelStore) : undefined;
  }

  get target(): JConcept | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? new JConcept(c.targetId, this.modelStore) : undefined;
  }

  setType(type: string): JConcept {
    const targetType = resolveType(type);
    if (!targetType || (!isElementType(targetType) && !isRelationshipType(targetType))) {
      throw new Error(`Unknown concept type: ${type}`);
    }
    const concept = this.concept();
    if (concept.type === targetType) return new JConcept(this.id, this.modelStore);
    const plan = analyzeConceptTypeChange(state(this.modelStore), {
      conceptIds: [this.id],
      targetType,
    });
    if (!plan.valid) throw new Error(plan.reason ?? 'Concept type change is not legal');
    const result = applyConceptTypeChange(
      plan,
      {
        convertInvalidRelationshipsToAssociation: plan.requiresConfirmation,
        addDocumentationNote:
          useSettingsStore.getState().settings.addDocumentationNoteOnRelationChange,
      },
      this.modelStore,
    );
    const replacementId = result?.idMap[this.id];
    if (!replacementId) throw new Error('Concept type change could not be applied');
    return new JConcept(replacementId, this.modelStore);
  }

  invert(): JConcept {
    const concept = this.concept();
    if (concept.kind !== 'relationship') {
      throw new Error('invert() is supported for relationships only');
    }
    const plan = analyzeRelationshipInversion(state(this.modelStore), { ids: [this.id] });
    if (!plan.valid) throw new Error(plan.reason ?? 'Relationship cannot be inverted');
    if (!applyRelationshipInversion(plan, this.modelStore)) {
      throw new Error('Relationship inversion could not be applied');
    }
    return new JConcept(this.id, this.modelStore);
  }

  get accessType(): string | undefined {
    const c = this.concept();
    if (c.kind !== 'relationship' || c.type !== 'AccessRelationship') return undefined;
    return (['write', 'read', 'access', 'readwrite'] as const)[c.accessType ?? 0];
  }

  set accessType(v: string | undefined) {
    const i = ['write', 'read', 'access', 'readwrite'].indexOf(v ?? 'write');
    setRelationshipAttrs(this.id, { accessType: i < 0 ? 0 : i }, this.modelStore);
  }

  get influenceStrength(): string | undefined {
    const c = this.concept();
    return c.kind === 'relationship' ? c.strength : undefined;
  }

  set influenceStrength(v: string | undefined) {
    setRelationshipAttrs(this.id, { strength: v ?? '' }, this.modelStore);
  }

  get associationDirected(): boolean {
    const c = this.concept();
    return c.kind === 'relationship' ? (c.directed ?? false) : false;
  }

  set associationDirected(v: boolean) {
    setRelationshipAttrs(this.id, { directed: v }, this.modelStore);
  }

  get specialization(): string | undefined {
    const concept = this.concept();
    return state(this.modelStore).profiles[concept.profileIds[0]]?.name;
  }

  set specialization(name: string | undefined) {
    const concept = this.concept();
    if (name !== undefined && name.trim() === '') {
      throw new Error('Specialization name must not be empty');
    }
    if (name === undefined || name === null) {
      setConceptProfiles(this.id, concept.profileIds.slice(1), this.modelStore);
      return;
    }
    const profile = Object.values(state(this.modelStore).profiles).find(
      (candidate) =>
        candidate.conceptType === concept.type &&
        candidate.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (!profile) throw new Error(`Specialization not found: ${name} (${concept.type})`);
    setConceptProfiles(
      this.id,
      [profile.id, ...concept.profileIds.filter((id) => id !== profile.id)],
      this.modelStore,
    );
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  delete(): void {
    deleteItems([this.id], this.modelStore);
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
    const f = state(this.modelStore).folders[this.id];
    if (!f) throw new Error(`Folder ${this.id} no longer exists`);
    return f;
  }

  override get name(): string {
    return this.folder().name;
  }

  override set name(v: string) {
    renameItem(this.id, v, this.modelStore);
  }

  get documentation(): string {
    return this.folder().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v, this.modelStore);
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  get labelExpression(): string | undefined { return this.folder().labelExpression; }
  set labelExpression(value: string | undefined) {
    setLabelExpression(this.id, value, this.modelStore);
  }

  delete(): void {
    deleteItems([this.id], this.modelStore);
  }
}

export class JProfile {
  constructor(
    readonly id: string,
    readonly modelStore: ModelStore = getActiveModelStore(),
  ) {}

  private profile(): ProfileDefinition {
    const profile = state(this.modelStore).profiles[this.id];
    if (!profile) throw new Error(`Specialization ${this.id} no longer exists`);
    return profile;
  }

  get name(): string {
    return this.profile().name;
  }

  set name(value: string) {
    updateProfile(this.id, { name: value }, this.modelStore);
  }

  get type(): string {
    return toKebab(this.profile().conceptType);
  }

  set type(value: string) {
    const conceptType = resolveType(value);
    if (!conceptType || (!isElementType(conceptType) && !isRelationshipType(conceptType))) {
      throw new Error(`Unknown profile concept type: ${value}`);
    }
    updateProfile(this.id, { conceptType }, this.modelStore);
  }

  get image(): { path: string } | undefined {
    const path = this.profile().imagePath;
    return path ? { path } : undefined;
  }

  set image(value: { path: string } | undefined) {
    updateProfile(this.id, { imagePath: value?.path }, this.modelStore);
  }

  delete(): void {
    deleteProfile(this.id, this.modelStore);
  }

  toString(): string {
    return `${this.name}: ${this.type}`;
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
    const v = state(this.modelStore).views[this.id];
    if (!v) throw new Error(`View ${this.id} no longer exists`);
    return v;
  }

  override get name(): string {
    return this.view().name;
  }

  override set name(v: string) {
    renameItem(this.id, v, this.modelStore);
  }

  get documentation(): string {
    return this.view().documentation;
  }

  set documentation(v: string) {
    setDocumentation(this.id, v, this.modelStore);
  }

  get viewpoint(): string | undefined {
    return this.view().viewpoint;
  }

  get routerType(): 'manual' | 'manhattan' {
    return this.view().connectionRouterType === 2 ? 'manhattan' : 'manual';
  }

  set routerType(value: 'manual' | 'manhattan') {
    if (value !== 'manual' && value !== 'manhattan') {
      throw new Error(`Unknown connection router: ${String(value)}`);
    }
    setViewConnectionRouterType(
      this.id,
      value === 'manhattan' ? 2 : 0,
      this.modelStore,
    );
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  /**
   * view.add(element, x, y, w, h) -> visual object
   * view.add(relationship, sourceVisual, targetVisual) -> visual connection
   */
  add(
    obj: JConcept,
    a: number | JConnectable,
    b: number | JConnectable,
    w?: number,
    h?: number,
  ): JVisual | JConnection {
    assertSameModelStore(this, obj);
    const m = state(this.modelStore);
    if (m.relationships[obj.id]) {
      if (!isJConnectable(a) || !isJConnectable(b)) {
        throw new Error('view.add(relationship, sourceConnectable, targetConnectable)');
      }
      assertSameModelStore(this, a, b);
      const connId = addConnectionToView(this.id, obj.id, a.id, b.id, this.modelStore);
      return new JConnection(connId, this.modelStore);
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
      {},
      this.modelStore,
    );
    return new JVisual(nodeId, this.modelStore);
  }

  createObject(type: string, x: number, y: number, w: number, h: number): JVisual {
    const t = type.toLowerCase();
    if (t.includes('note')) {
      return new JVisual(
        addNoteToView(
          this.id,
          this.id,
          { x, y, width: w, height: h },
          '',
          {},
          this.modelStore,
        ),
        this.modelStore,
      );
    }
    if (t.includes('group')) {
      return new JVisual(
        addGroupToView(
          this.id,
          this.id,
          { x, y, width: w, height: h },
          'Group',
          {},
          this.modelStore,
        ),
        this.modelStore,
      );
    }
    throw new Error(`Unsupported view object type: ${type}`);
  }

  createLegend(
    x: number,
    y: number,
    options: Partial<LegendOptions> = {},
  ): JVisual {
    if (!isRecord(options)) throw new Error('view.createLegend options must be an object');
    const settings = useSettingsStore.getState().settings;
    const legendId = addLegendToView(
      this.id,
      this.id,
      { x, y, width: 210, height: 320 },
      {
        rowsPerColumn: settings.legendRowsPerColumn,
        colorScheme: settings.legendColorScheme as 0 | 1 | 2,
        sortMethod: settings.legendSortMethod as 0 | 1,
        ...options,
      },
      {},
      this.modelStore,
    );
    if (!legendId) throw new Error(`Could not create legend in view ${this.id}`);
    return new JVisual(legendId, this.modelStore);
  }

  createPlainConnection(
    source: JConnectable,
    target: JConnectable,
    connectionType = 0,
  ): JConnection {
    if (!isJConnectable(source) || !isJConnectable(target)) {
      throw new Error('view.createPlainConnection(source, target, connectionType?)');
    }
    assertSameModelStore(this, source, target);
    const connectionId = createPlainConnectionOnView(
      this.id,
      source.id,
      target.id,
      this.modelStore,
      connectionType,
    );
    if (!connectionId) {
      throw new Error('Plain connection requires a Note endpoint in this view');
    }
    return new JConnection(connectionId, this.modelStore);
  }

  nodes(options?: { recursive?: boolean }): JVisual[] {
    const m = state(this.modelStore);
    const view = this.view();
    const recursive = options?.recursive ?? false;
    const ids: string[] = [];
    const collect = (childIds: string[]) => {
      for (const id of childIds) {
        const node = m.nodes[id];
        if (!node) continue;
        ids.push(id);
        if (recursive) collect(node.childIds);
      }
    };
    collect(view.childIds);
    return ids.map((id) => new JVisual(id, this.modelStore));
  }

  connections(): JConnection[] {
    return Object.values(state(this.modelStore).connections)
      .filter((conn) => conn.viewId === this.id)
      .map((conn) => new JConnection(conn.id, this.modelStore));
  }

  bounds(options?: { recursive?: boolean }): JBounds | null {
    const m = state(this.modelStore);
    const nodes = this.nodes({ recursive: options?.recursive ?? true });
    if (nodes.length === 0) return null;
    let union: Bounds | null = null;
    for (const node of nodes) {
      const bounds = modelAbsoluteBounds(m, node.id);
      if (!union) {
        union = { ...bounds };
      } else {
        const x1 = Math.min(union.x, bounds.x);
        const y1 = Math.min(union.y, bounds.y);
        const x2 = Math.max(union.x + union.width, bounds.x + bounds.width);
        const y2 = Math.max(union.y + union.height, bounds.y + bounds.height);
        union = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      }
    }
    return union;
  }

  layout(layout: ViewLayoutInput): void {
    if (!isRecord(layout)) throw new Error('view.layout(layout) expects an object');
    const m = state(this.modelStore);
    this.view();
    const minNodeSize = useSettingsStore.getState().settings.minNodeSize;
    const nodeInputs = layout.nodes ?? {};
    const connectionInputs = layout.connections ?? {};
    if (!isRecord(nodeInputs)) throw new Error('view.layout nodes must be an object');
    if (!isRecord(connectionInputs)) throw new Error('view.layout connections must be an object');

    const absoluteUpdates = new Map<string, Bounds>();
    for (const [nodeId, patch] of Object.entries(nodeInputs)) {
      const node = m.nodes[nodeId];
      if (!node || node.viewId !== this.id) {
        throw new Error(`Node ${nodeId} is not in view ${this.id}`);
      }
      if (!isRecord(patch)) throw new Error(`Node layout for ${nodeId} must be an object`);
      const current = modelAbsoluteBounds(m, nodeId);
      const width = Math.max(
        minNodeSize,
        optionalFiniteNumber(patch, 'width', current.width, `nodes.${nodeId}`),
      );
      const height = Math.max(
        minNodeSize,
        optionalFiniteNumber(patch, 'height', current.height, `nodes.${nodeId}`),
      );
      absoluteUpdates.set(nodeId, {
        x: optionalFiniteNumber(patch, 'x', current.x, `nodes.${nodeId}`),
        y: optionalFiniteNumber(patch, 'y', current.y, `nodes.${nodeId}`),
        width,
        height,
      });
    }

    const absoluteCache = new Map<string, Bounds>();
    const finalAbsoluteBounds = (nodeId: string): Bounds => {
      const updated = absoluteUpdates.get(nodeId);
      if (updated) return updated;
      const cached = absoluteCache.get(nodeId);
      if (cached) return cached;
      const node = m.nodes[nodeId];
      if (!node) throw new Error(`Node ${nodeId} no longer exists`);
      const bounds =
        node.parentId === node.viewId
          ? { ...node.bounds }
          : {
              x: finalAbsoluteBounds(node.parentId).x + node.bounds.x,
              y: finalAbsoluteBounds(node.parentId).y + node.bounds.y,
              width: node.bounds.width,
              height: node.bounds.height,
            };
      absoluteCache.set(nodeId, bounds);
      return bounds;
    };

    const pendingConnectionUpdates: {
      id: string;
      connection: DiagramConnection;
      route?: JPoint[];
      bendpoints?: Bendpoint[];
    }[] = [];
    for (const [connectionId, patch] of Object.entries(connectionInputs)) {
      const conn = assertViewConnection(m, this.id, connectionId);
      if (!isRecord(patch)) throw new Error(`Connection layout for ${connectionId} must be an object`);
      const hasRoute = Object.hasOwn(patch, 'route') && patch.route !== undefined;
      const hasBendpoints = Object.hasOwn(patch, 'bendpoints') && patch.bendpoints !== undefined;
      if (hasRoute && hasBendpoints) {
        throw new Error(`Connection ${connectionId} cannot specify both route and bendpoints`);
      }
      if (hasRoute) {
        pendingConnectionUpdates.push({
          id: connectionId,
          connection: conn,
          route: validatePointArray(patch.route, `connections.${connectionId}.route`),
        });
      } else if (hasBendpoints) {
        pendingConnectionUpdates.push({
          id: connectionId,
          connection: conn,
          bendpoints: validateBendpointArray(
            patch.bendpoints,
            `connections.${connectionId}.bendpoints`,
          ),
        });
      }
    }

    const stagedConnections = new Map<string, DiagramConnection>();
    for (const update of pendingConnectionUpdates) {
      if (update.bendpoints) {
        stagedConnections.set(update.id, {
          ...update.connection,
          bendpoints: update.bendpoints,
        });
      }
    }
    const pendingRoutes = new Map(
      pendingConnectionUpdates
        .filter((update): update is typeof update & { route: JPoint[] } => Boolean(update.route))
        .map((update) => [update.id, update]),
    );
    const dependsOnPendingRoute = (
      connectionId: string,
      visited: Set<string> = new Set(),
    ): boolean => {
      if (visited.has(connectionId)) return false;
      visited.add(connectionId);
      const connection = stagedConnections.get(connectionId) ?? m.connections[connectionId];
      if (!connection) return false;
      return [connection.sourceId, connection.targetId].some((endpointId) => {
        if (pendingRoutes.has(endpointId)) return true;
        return Boolean(m.connections[endpointId]) && dependsOnPendingRoute(endpointId, visited);
      });
    };
    while (pendingRoutes.size > 0) {
      let progressed = false;
      for (const [connectionId, update] of [...pendingRoutes]) {
        const waitsForEndpoint = [update.connection.sourceId, update.connection.targetId]
          .some((endpointId) => (
            pendingRoutes.has(endpointId) || dependsOnPendingRoute(endpointId)
          ));
        if (waitsForEndpoint) continue;
        const bendpoints = routeToBendpoints(
          m,
          update.connection,
          update.route,
          finalAbsoluteBounds,
          (id) => stagedConnections.get(id),
        );
        stagedConnections.set(connectionId, {
          ...update.connection,
          bendpoints,
        });
        pendingRoutes.delete(connectionId);
        progressed = true;
      }
      if (!progressed) throw new Error('Connection layout dependency cycle');
    }
    const connectionUpdates = pendingConnectionUpdates.map((update) => ({
      id: update.id,
      bendpoints: stagedConnections.get(update.id)!.bendpoints.map((bendpoint) => ({
        ...bendpoint,
      })),
    }));

    const nodeUpdates = [...absoluteUpdates.entries()].map(([nodeId, bounds]) => {
      const node = m.nodes[nodeId]!;
      const parentBounds =
        node.parentId === node.viewId ? { x: 0, y: 0 } : finalAbsoluteBounds(node.parentId);
      return {
        id: nodeId,
        bounds: {
          x: bounds.x - parentBounds.x,
          y: bounds.y - parentBounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      };
    });

    layoutView(nodeUpdates, connectionUpdates, this.modelStore);
  }

  openInUI(): void {
    openView(this.id, this.modelStore);
  }

  delete(): void {
    deleteItems([this.id], this.modelStore);
  }
}

export class JVisual extends JObject {
  get kind(): JKind {
    return 'visual';
  }

  node() {
    const n = state(this.modelStore).nodes[this.id];
    if (!n) throw new Error(`Diagram object ${this.id} no longer exists`);
    return n;
  }

  get type(): string {
    const n = this.node();
    switch (n.nodeType) {
      case 'element':
        return toKebab(state(this.modelStore).elements[n.elementId]?.type ?? 'DiagramObject');
      case 'group':
        return 'diagram-model-group';
      case 'note':
        return isLegendNote(n) ? 'diagram-model-legend' : 'diagram-model-note';
      case 'ref':
        return 'archimate-diagram-model-reference';
      case 'image':
        return 'diagram-model-image';
    }
  }

  override get name(): string {
    const n = this.node();
    if (n.nodeType === 'element') {
      return state(this.modelStore).elements[n.elementId]?.name ?? '';
    }
    if (n.nodeType === 'group') return n.name;
    if (n.nodeType === 'note') return isLegendNote(n) ? n.name ?? 'Legend' : n.content;
    if (n.nodeType === 'image') return '';
    return state(this.modelStore).views[n.refViewId]?.name ?? '';
  }

  override set name(v: string) {
    const n = this.node();
    if (n.nodeType === 'element') renameItem(n.elementId, v, this.modelStore);
    else if (isLegendNote(n)) throw new Error('Legend name is fixed');
    else renameItem(this.id, v, this.modelStore);
  }

  get text(): string {
    const n = this.node();
    return n.nodeType === 'note' ? n.content : this.name;
  }

  set text(v: string) {
    this.name = v;
  }

  get legendOptions(): LegendOptions | undefined {
    const n = this.node();
    return isLegendNote(n) ? { ...n.legendOptions } : undefined;
  }

  set legendOptions(value: LegendOptions | undefined) {
    const n = this.node();
    if (!isLegendNote(n) || value === undefined || !isRecord(value)) {
      throw new Error('legendOptions are only available on native legends');
    }
    setLegendOptions(this.id, value, this.modelStore);
  }

  setLegendOptimalSize(): void {
    const n = this.node();
    if (!isLegendNote(n)) throw new Error('setLegendOptimalSize() requires a native legend');
    const settings = useSettingsStore.getState().settings;
    setLegendOptimalSize(this.id, {
      labels: settings.legendLabels,
      userColors: settings.legendUserColors,
    }, undefined, this.modelStore);
  }

  get concept(): JConcept | undefined {
    const n = this.node();
    return n.nodeType === 'element'
      ? new JConcept(n.elementId, this.modelStore)
      : undefined;
  }

  get view(): JView {
    return new JView(this.node().viewId, this.modelStore);
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
    }, this.modelStore);
  }

  parent(): JView | JVisual {
    const n = this.node();
    return n.parentId === n.viewId
      ? new JView(n.viewId, this.modelStore)
      : new JVisual(n.parentId, this.modelStore);
  }

  children(): JVisual[] {
    return this.node().childIds
      .filter((id) => !!state(this.modelStore).nodes[id])
      .map((id) => new JVisual(id, this.modelStore));
  }

  absoluteBounds(): JBounds {
    return modelAbsoluteBounds(state(this.modelStore), this.id);
  }

  connections(options?: { incoming?: boolean; outgoing?: boolean }): JConnection[] {
    const n = this.node();
    const includeIncoming = options?.incoming ?? true;
    const includeOutgoing = options?.outgoing ?? true;
    const ids: string[] = [];
    if (includeOutgoing) ids.push(...n.sourceConnectionIds);
    if (includeIncoming) ids.push(...n.targetConnectionIds);
    const seen = new Set<string>();
    return ids
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return !!state(this.modelStore).connections[id];
      })
      .map((id) => new JConnection(id, this.modelStore));
  }

  get fillColor(): string | undefined {
    return this.node().fillColor;
  }

  set fillColor(v: string | undefined) {
    setNodeStyle([this.id], { fillColor: v }, this.modelStore);
  }

  get lineColor(): string | undefined {
    return this.node().lineColor;
  }

  set lineColor(v: string | undefined) {
    setNodeStyle([this.id], { lineColor: v }, this.modelStore);
  }

  get fontColor(): string | undefined {
    return this.node().fontColor;
  }

  set fontColor(v: string | undefined) {
    setNodeStyle([this.id], { fontColor: v }, this.modelStore);
  }

  get opacity(): number {
    return this.node().alpha ?? 255;
  }

  set opacity(v: number) {
    setNodeStyle([this.id], { alpha: Math.max(0, Math.min(255, v)) }, this.modelStore);
  }

  get labelExpression(): string | undefined { return this.node().labelExpression; }
  set labelExpression(value: string | undefined) {
    setLabelExpression(this.id, value, this.modelStore);
  }

  get gradient(): number { return this.node().gradient ?? -1; }
  set gradient(value: number) {
    setNodeStyle(
      [this.id],
      { gradient: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 },
      this.modelStore,
    );
  }

  get lineStyle(): number { return this.node().lineStyle ?? -1; }
  set lineStyle(value: number) {
    setNodeStyle(
      [this.id],
      { lineStyle: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 },
      this.modelStore,
    );
  }

  get lineWidth(): number { return this.node().lineWidth ?? 1; }
  set lineWidth(value: number) {
    setNodeStyle(
      [this.id],
      { lineWidth: Math.max(1, Math.min(3, value)) as 1 | 2 | 3 },
      this.modelStore,
    );
  }

  get imageSource(): number { return this.node().imageSource ?? 0; }
  set imageSource(value: number) {
    setNodeStyle([this.id], { imageSource: value === 1 ? 1 : 0 }, this.modelStore);
  }

  get imagePosition(): number { return this.node().imagePosition ?? 2; }
  set imagePosition(value: number) {
    setNodeStyle(
      [this.id],
      { imagePosition: Math.max(0, Math.min(9, value)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 },
      this.modelStore,
    );
  }

  /** Nested add (bounds relative to this container). */
  add(element: JConcept, x: number, y: number, w: number, h: number): JVisual {
    assertSameModelStore(this, element);
    const n = this.node();
    const nodeId = addElementNodeToView(
      n.viewId,
      element.id,
      this.id,
      { x, y, width: w, height: h },
      false,
      {},
      this.modelStore,
    );
    return new JVisual(nodeId, this.modelStore);
  }

  delete(): void {
    deleteViewObjects([this.id], this.modelStore);
  }
}

export class JConnection extends JObject {
  get kind(): JKind {
    return 'connection';
  }

  private conn() {
    const c = state(this.modelStore).connections[this.id];
    if (!c) throw new Error(`Connection ${this.id} no longer exists`);
    return c;
  }

  get type(): string {
    const c = this.conn();
    if (c.relationshipId) {
      return toKebab(
        state(this.modelStore).relationships[c.relationshipId]?.type ?? 'Connection',
      );
    }
    return 'diagram-model-connection';
  }

  override get name(): string {
    return this.conn().name;
  }

  override set name(value: string) {
    renameItem(this.id, value, this.modelStore);
  }

  get documentation(): string {
    return this.conn().documentation;
  }

  set documentation(value: string) {
    setDocumentation(this.id, value, this.modelStore);
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  get concept(): JConcept | undefined {
    const c = this.conn();
    return c.relationshipId ? new JConcept(c.relationshipId, this.modelStore) : undefined;
  }

  get view(): JView {
    return new JView(this.conn().viewId, this.modelStore);
  }

  get source(): JConnectable {
    return wrapConnectable(this.conn().sourceId, this.modelStore);
  }

  get target(): JConnectable {
    return wrapConnectable(this.conn().targetId, this.modelStore);
  }

  get lineColor(): string | undefined {
    return this.conn().lineColor;
  }

  set lineColor(v: string | undefined) {
    setNodeStyle([this.id], { lineColor: v }, this.modelStore);
  }

  get fontColor(): string | undefined { return this.conn().fontColor; }
  set fontColor(value: string | undefined) {
    setNodeStyle([this.id], { fontColor: value }, this.modelStore);
  }

  get font(): string | undefined { return this.conn().font; }
  set font(value: string | undefined) {
    setNodeStyle([this.id], { font: value }, this.modelStore);
  }

  get textPosition(): number { return this.conn().textPosition ?? 1; }
  set textPosition(value: number) {
    setNodeStyle(
      [this.id],
      { textPosition: Math.max(0, Math.min(2, Math.trunc(value))) },
      this.modelStore,
    );
  }

  get connectionType(): number { return this.conn().connectionType ?? 0; }
  set connectionType(value: number) {
    this.assertPlain();
    setPlainConnectionAttributes(this.id, { connectionType: value }, this.modelStore);
  }

  get nameVisible(): boolean { return this.conn().nameVisible !== false; }
  set nameVisible(value: boolean) {
    this.assertPlain();
    setPlainConnectionAttributes(this.id, { nameVisible: value }, this.modelStore);
  }

  get labelExpression(): string | undefined { return this.conn().labelExpression; }
  set labelExpression(value: string | undefined) {
    setLabelExpression(this.id, value, this.modelStore);
  }

  get lineStyle(): number { return this.conn().lineStyle ?? -1; }
  set lineStyle(value: number) {
    setNodeStyle(
      [this.id],
      { lineStyle: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 },
      this.modelStore,
    );
  }

  get lineWidth(): number { return this.conn().lineWidth ?? 1; }
  set lineWidth(value: number) {
    setNodeStyle(
      [this.id],
      { lineWidth: Math.max(1, Math.min(3, value)) as 1 | 2 | 3 },
      this.modelStore,
    );
  }

  get bendpoints(): JBendpoint[] {
    return this.conn().bendpoints.map((bp) => ({ ...bp }));
  }

  set bendpoints(value: JBendpoint[]) {
    setConnectionBendpoints(
      this.id,
      validateBendpointArray(value, `connection.${this.id}.bendpoints`),
      this.modelStore,
    );
  }

  absoluteRoute(): JPoint[] {
    const m = state(this.modelStore);
    return absoluteRouteForConnection(m, this.conn());
  }

  setAbsoluteRoute(points: JPoint[]): void {
    const m = state(this.modelStore);
    setConnectionBendpoints(
      this.id,
      routeToBendpoints(
        m,
        this.conn(),
        validatePointArray(points, `connection.${this.id}.route`),
      ),
      this.modelStore,
    );
  }

  routedPoints(): JPoint[] {
    const m = state(this.modelStore);
    return renderedRouteForConnection(m, this.conn());
  }

  reconnect(end: 'source' | 'target', endpoint: JConnectable): void {
    if ((end !== 'source' && end !== 'target') || !isJConnectable(endpoint)) {
      throw new Error('connection.reconnect(end, endpoint)');
    }
    assertSameModelStore(this, endpoint);
    const plan = analyzeConnectionReconnection(state(this.modelStore), {
      connectionId: this.id,
      end,
      endpointId: endpoint.id,
    });
    if (!plan.valid) throw new Error(plan.reason ?? 'Connection cannot be reconnected');
    if (!applyConnectionReconnection(plan, this.modelStore)) {
      throw new Error('Connection reconnection was not applied');
    }
  }

  delete(): void {
    deleteViewObjects([this.id], this.modelStore);
  }

  private assertPlain(): void {
    if (this.conn().connType !== 'plain') {
      throw new Error('Field is only writable on plain connections');
    }
  }
}

function isJConnectable(value: unknown): value is JConnectable {
  return value instanceof JVisual || value instanceof JConnection;
}

function wrapConnectable(id: string, store: ModelStore): JConnectable {
  const model = state(store);
  if (model.nodes[id]) return new JVisual(id, store);
  if (model.connections[id]) return new JConnection(id, store);
  throw new Error(`Diagram connectable ${id} no longer exists`);
}

export class JModel extends JObject {
  get kind(): JKind {
    return 'model';
  }

  get type(): string {
    return 'archimate-model';
  }

  override get name(): string {
    return state(this.modelStore).info.name;
  }

  override set name(v: string) {
    renameItem(state(this.modelStore).info.id, v, this.modelStore);
  }

  get purpose(): string {
    return state(this.modelStore).info.documentation;
  }

  set purpose(v: string) {
    setDocumentation(state(this.modelStore).info.id, v, this.modelStore);
  }

  get documentation(): string {
    return this.purpose;
  }

  set documentation(v: string) {
    this.purpose = v;
  }

  prop(key?: string, value?: string, duplicate?: boolean): unknown {
    return propApi({
      id: state(this.modelStore).info.id,
      modelStore: this.modelStore,
    }).prop(key, value, duplicate);
  }

  removeProp(key: string, value?: string): void {
    propApi({
      id: state(this.modelStore).info.id,
      modelStore: this.modelStore,
    }).removeProp(key, value);
  }

  /** Search the captured active model without changing it. */
  search(options: JFindReplaceSearchOptions): JFindReplaceRow[] {
    const preview = previewFindReplace(
      captureFindReplaceSession(this.modelStore),
      findReplaceOptions(options, ''),
    );
    if (!preview.valid) throw new Error(preview.error ?? 'Search failed.');
    return preview.rows.map((row) => ({ ...row, after: row.before }));
  }

  /** Build the mandatory preview consumed by applyReplace(). */
  previewReplace(options: JFindReplaceOptions): JFindReplacePreview {
    return previewFindReplace(
      captureFindReplaceSession(this.modelStore),
      findReplaceOptions(options, options.replace),
    );
  }

  /** Apply all or selected preview rows in one Find and Replace transaction. */
  applyReplace(
    preview: JFindReplacePreview,
    selectedRowIds?: readonly string[],
  ): number {
    return applyFindReplace(preview, selectedRowIds);
  }

  /** Inspect ordered property-key usage across the captured active model. */
  propertyUsage(search = ''): readonly JPropertyKeyUsage[] {
    return inspectPropertyUsage(capturePropertyManagerSession(this.modelStore), search);
  }

  /** Build the mandatory preview consumed by renamePropertyKey(). */
  previewRenamePropertyKey(
    key: string,
    newKey: string,
    collisionAcknowledged = false,
  ): JPropertyMutationPreview {
    return previewPropertyRename(
      capturePropertyManagerSession(this.modelStore),
      key,
      newKey,
      collisionAcknowledged,
    );
  }

  /** Rename every exact occurrence through its preview's captured store. */
  renamePropertyKey(preview: JPropertyMutationPreview): number {
    return applyPropertyKeyRename(preview);
  }

  /** Build the mandatory preview consumed by deletePropertyKey(). */
  previewDeletePropertyKey(key: string): JPropertyMutationPreview {
    return previewPropertyDelete(capturePropertyManagerSession(this.modelStore), key);
  }

  /** Delete every exact occurrence through its preview's captured store. */
  deletePropertyKey(preview: JPropertyMutationPreview): number {
    return applyPropertyKeyDelete(preview);
  }

  get specializations(): JProfile[] {
    return Object.values(state(this.modelStore).profiles)
      .map((profile) => new JProfile(profile.id, this.modelStore));
  }

  createSpecialization(
    name: string,
    conceptType: string,
    image?: { path: string },
  ): JProfile {
    const resolved = resolveType(conceptType);
    if (!resolved || (!isElementType(resolved) && !isRelationshipType(resolved))) {
      throw new Error(`Unknown profile concept type: ${conceptType}`);
    }
    return new JProfile(
      createProfile({
        name,
        conceptType: resolved,
        imagePath: image?.path,
      }, this.modelStore),
      this.modelStore,
    );
  }

  findSpecialization(name: string, conceptType: string): JProfile | undefined {
    const resolved = resolveType(conceptType);
    if (!resolved || (!isElementType(resolved) && !isRelationshipType(resolved))) return undefined;
    const profile = Object.values(state(this.modelStore).profiles).find(
      (candidate) =>
        candidate.conceptType === resolved &&
        candidate.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    return profile ? new JProfile(profile.id, this.modelStore) : undefined;
  }

  createElement(type: string, name?: string, folder?: JFolder): JConcept {
    const t = resolveType(type);
    if (!t || !isElementType(t)) throw new Error(`Unknown element type: ${type}`);
    assertSameModelStore(this, folder);
    return new JConcept(
      addElement(t as ElementType, name, folder?.id, this.modelStore),
      this.modelStore,
    );
  }

  createRelationship(type: string, name: string, source: JConcept, target: JConcept, folder?: JFolder): JConcept {
    const t = resolveType(type);
    if (!t || !isRelationshipType(t)) throw new Error(`Unknown relationship type: ${type}`);
    assertSameModelStore(this, source, target, folder);
    const id = addRelationship(
      t as RelationshipType,
      source.id,
      target.id,
      name ?? '',
      folder?.id,
      this.modelStore,
    );
    if (!id) {
      throw new Error(
        `Relationship ${type} not allowed between ${source.type} and ${target.type}`,
      );
    }
    return new JConcept(id, this.modelStore);
  }

  createArchimateView(name?: string, folder?: JFolder): JView {
    assertSameModelStore(this, folder);
    return new JView(
      addView(name ?? 'New View', folder?.id, this.modelStore),
      this.modelStore,
    );
  }
}

export function wrap(
  id: string,
  store: ModelStore = getActiveModelStore(),
): JObject | undefined {
  const m = state(store);
  if (m.elements[id] || m.relationships[id]) return new JConcept(id, store);
  if (m.views[id]) return new JView(id, store);
  if (m.folders[id]) return new JFolder(id, store);
  if (m.nodes[id]) return new JVisual(id, store);
  if (m.connections[id]) return new JConnection(id, store);
  if (m.info.id === id) return new JModel(id, store);
  return undefined;
}
