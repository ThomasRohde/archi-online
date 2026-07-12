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
  analyzeConnectionReconnection,
  applyConnectionReconnection,
  createNestedConnectionVisibilityResolver,
  createProfile,
  deleteItems,
  deleteProfile,
  deleteViewObjects,
  layoutView,
  renameItem,
  resizeNode,
  setConnectionBendpoints,
  setViewConnectionRouterType,
  setDocumentation,
  setNodeStyle,
  setLabelExpression,
  setProperties,
  setRelationshipAttrs,
  setConceptProfiles,
  updateProfile,
} from '../../model/ops';
import { openView } from '../../model/store';
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

export interface ViewLayoutInput {
  nodes?: Record<string, Partial<JBounds>>;
  connections?: Record<string, { route?: JPoint[]; bendpoints?: JBendpoint[] }>;
}

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
    m.connections[id]?.properties ??
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

  get specialization(): string | undefined {
    const concept = this.concept();
    return state().profiles[concept.profileIds[0]]?.name;
  }

  set specialization(name: string | undefined) {
    const concept = this.concept();
    if (name !== undefined && name.trim() === '') {
      throw new Error('Specialization name must not be empty');
    }
    if (name === undefined || name === null) {
      setConceptProfiles(this.id, concept.profileIds.slice(1));
      return;
    }
    const profile = Object.values(state().profiles).find(
      (candidate) =>
        candidate.conceptType === concept.type &&
        candidate.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (!profile) throw new Error(`Specialization not found: ${name} (${concept.type})`);
    setConceptProfiles(this.id, [profile.id, ...concept.profileIds.filter((id) => id !== profile.id)]);
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

  get labelExpression(): string | undefined { return this.folder().labelExpression; }
  set labelExpression(value: string | undefined) { setLabelExpression(this.id, value); }

  delete(): void {
    deleteItems([this.id]);
  }
}

export class JProfile {
  constructor(readonly id: string) {}

  private profile(): ProfileDefinition {
    const profile = state().profiles[this.id];
    if (!profile) throw new Error(`Specialization ${this.id} no longer exists`);
    return profile;
  }

  get name(): string {
    return this.profile().name;
  }

  set name(value: string) {
    updateProfile(this.id, { name: value });
  }

  get type(): string {
    return toKebab(this.profile().conceptType);
  }

  set type(value: string) {
    const conceptType = resolveType(value);
    if (!conceptType || (!isElementType(conceptType) && !isRelationshipType(conceptType))) {
      throw new Error(`Unknown profile concept type: ${value}`);
    }
    updateProfile(this.id, { conceptType });
  }

  get image(): { path: string } | undefined {
    const path = this.profile().imagePath;
    return path ? { path } : undefined;
  }

  set image(value: { path: string } | undefined) {
    updateProfile(this.id, { imagePath: value?.path });
  }

  delete(): void {
    deleteProfile(this.id);
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

  get routerType(): 'manual' | 'manhattan' {
    return this.view().connectionRouterType === 2 ? 'manhattan' : 'manual';
  }

  set routerType(value: 'manual' | 'manhattan') {
    if (value !== 'manual' && value !== 'manhattan') {
      throw new Error(`Unknown connection router: ${String(value)}`);
    }
    setViewConnectionRouterType(this.id, value === 'manhattan' ? 2 : 0);
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
    const m = state();
    if (m.relationships[obj.id]) {
      if (!isJConnectable(a) || !isJConnectable(b)) {
        throw new Error('view.add(relationship, sourceConnectable, targetConnectable)');
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

  nodes(options?: { recursive?: boolean }): JVisual[] {
    const m = state();
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
    return ids.map((id) => new JVisual(id));
  }

  connections(): JConnection[] {
    return Object.values(state().connections)
      .filter((conn) => conn.viewId === this.id)
      .map((conn) => new JConnection(conn.id));
  }

  bounds(options?: { recursive?: boolean }): JBounds | null {
    const m = state();
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
    const m = state();
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

    layoutView(nodeUpdates, connectionUpdates);
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
      case 'image':
        return 'diagram-model-image';
    }
  }

  override get name(): string {
    const n = this.node();
    if (n.nodeType === 'element') return state().elements[n.elementId]?.name ?? '';
    if (n.nodeType === 'group') return n.name;
    if (n.nodeType === 'note') return n.content;
    if (n.nodeType === 'image') return '';
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

  parent(): JView | JVisual {
    const n = this.node();
    return n.parentId === n.viewId ? new JView(n.viewId) : new JVisual(n.parentId);
  }

  children(): JVisual[] {
    return this.node().childIds
      .filter((id) => !!state().nodes[id])
      .map((id) => new JVisual(id));
  }

  absoluteBounds(): JBounds {
    return modelAbsoluteBounds(state(), this.id);
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
        return !!state().connections[id];
      })
      .map((id) => new JConnection(id));
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

  get labelExpression(): string | undefined { return this.node().labelExpression; }
  set labelExpression(value: string | undefined) { setLabelExpression(this.id, value); }

  get gradient(): number { return this.node().gradient ?? -1; }
  set gradient(value: number) { setNodeStyle([this.id], { gradient: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 }); }

  get lineStyle(): number { return this.node().lineStyle ?? -1; }
  set lineStyle(value: number) { setNodeStyle([this.id], { lineStyle: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 }); }

  get lineWidth(): number { return this.node().lineWidth ?? 1; }
  set lineWidth(value: number) { setNodeStyle([this.id], { lineWidth: Math.max(1, Math.min(3, value)) as 1 | 2 | 3 }); }

  get imageSource(): number { return this.node().imageSource ?? 0; }
  set imageSource(value: number) { setNodeStyle([this.id], { imageSource: value === 1 ? 1 : 0 }); }

  get imagePosition(): number { return this.node().imagePosition ?? 2; }
  set imagePosition(value: number) { setNodeStyle([this.id], { imagePosition: Math.max(0, Math.min(9, value)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }); }

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
    return this.conn().name;
  }

  override set name(value: string) {
    renameItem(this.id, value);
  }

  get documentation(): string {
    return this.conn().documentation;
  }

  set documentation(value: string) {
    setDocumentation(this.id, value);
  }

  prop = propApi(this).prop;
  removeProp = propApi(this).removeProp;

  get concept(): JConcept | undefined {
    const c = this.conn();
    return c.relationshipId ? new JConcept(c.relationshipId) : undefined;
  }

  get view(): JView {
    return new JView(this.conn().viewId);
  }

  get source(): JConnectable {
    return wrapConnectable(this.conn().sourceId);
  }

  get target(): JConnectable {
    return wrapConnectable(this.conn().targetId);
  }

  get lineColor(): string | undefined {
    return this.conn().lineColor;
  }

  set lineColor(v: string | undefined) {
    setNodeStyle([this.id], { lineColor: v });
  }

  get labelExpression(): string | undefined { return this.conn().labelExpression; }
  set labelExpression(value: string | undefined) { setLabelExpression(this.id, value); }

  get lineStyle(): number { return this.conn().lineStyle ?? -1; }
  set lineStyle(value: number) { setNodeStyle([this.id], { lineStyle: Math.max(-1, Math.min(3, value)) as -1 | 0 | 1 | 2 | 3 }); }

  get lineWidth(): number { return this.conn().lineWidth ?? 1; }
  set lineWidth(value: number) { setNodeStyle([this.id], { lineWidth: Math.max(1, Math.min(3, value)) as 1 | 2 | 3 }); }

  get bendpoints(): JBendpoint[] {
    return this.conn().bendpoints.map((bp) => ({ ...bp }));
  }

  set bendpoints(value: JBendpoint[]) {
    setConnectionBendpoints(this.id, validateBendpointArray(value, `connection.${this.id}.bendpoints`));
  }

  absoluteRoute(): JPoint[] {
    const m = state();
    return absoluteRouteForConnection(m, this.conn());
  }

  setAbsoluteRoute(points: JPoint[]): void {
    const m = state();
    setConnectionBendpoints(
      this.id,
      routeToBendpoints(
        m,
        this.conn(),
        validatePointArray(points, `connection.${this.id}.route`),
      ),
    );
  }

  routedPoints(): JPoint[] {
    const m = state();
    return renderedRouteForConnection(m, this.conn());
  }

  reconnect(end: 'source' | 'target', endpoint: JConnectable): void {
    if ((end !== 'source' && end !== 'target') || !isJConnectable(endpoint)) {
      throw new Error('connection.reconnect(end, endpoint)');
    }
    const plan = analyzeConnectionReconnection(state(), {
      connectionId: this.id,
      end,
      endpointId: endpoint.id,
    });
    if (!plan.valid) throw new Error(plan.reason ?? 'Connection cannot be reconnected');
    if (!applyConnectionReconnection(plan)) {
      throw new Error('Connection reconnection was not applied');
    }
  }

  delete(): void {
    deleteViewObjects([this.id]);
  }
}

function isJConnectable(value: unknown): value is JConnectable {
  return value instanceof JVisual || value instanceof JConnection;
}

function wrapConnectable(id: string): JConnectable {
  const model = state();
  if (model.nodes[id]) return new JVisual(id);
  if (model.connections[id]) return new JConnection(id);
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

  get specializations(): JProfile[] {
    return Object.values(state().profiles).map((profile) => new JProfile(profile.id));
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
    return new JProfile(createProfile({
      name,
      conceptType: resolved,
      imagePath: image?.path,
    }));
  }

  findSpecialization(name: string, conceptType: string): JProfile | undefined {
    const resolved = resolveType(conceptType);
    if (!resolved || (!isElementType(resolved) && !isRelationshipType(resolved))) return undefined;
    const profile = Object.values(state().profiles).find(
      (candidate) =>
        candidate.conceptType === resolved &&
        candidate.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    return profile ? new JProfile(profile.id) : undefined;
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
