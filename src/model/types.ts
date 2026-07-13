import type { ElementType, RelationshipType } from './metamodel';
import type { LegendOptions } from './legend';

export type ConceptType = ElementType | RelationshipType;

export interface ProfileDefinition {
  id: string;
  name: string;
  conceptType: ConceptType;
  specialization: boolean;
  imagePath?: string;
}

export interface ModelAsset {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
  renderMediaType: string;
  renderBytes: Uint8Array;
  sha256: string;
}

export interface Property {
  key: string;
  value: string;
}

export const DUBLIN_CORE_FIELDS = [
  'title', 'creator', 'subject', 'description', 'publisher', 'contributor', 'date',
  'type', 'format', 'identifier', 'source', 'language', 'relation', 'coverage', 'rights',
] as const;
export type DublinCoreField = (typeof DUBLIN_CORE_FIELDS)[number];
export interface DublinCoreEntry {
  name: DublinCoreField;
  value: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FontStyle {
  family: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
}

export type Gradient = -1 | 0 | 1 | 2 | 3;
export type LineStyle = -1 | 0 | 1 | 2 | 3;
export type LineWidth = 1 | 2 | 3;
export type IconVisibility = 0 | 1 | 2;
export type ImageSource = 0 | 1;
export type ImagePosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ConnectionRouterType = 0 | 2;

/** Native Archi IDiagramModelConnection.type flags (release_5.9.0). */
export const PLAIN_CONNECTION_TYPE = {
  TARGET_FILLED: 1,
  DASHED: 2,
  DOTTED: 4,
  SOURCE_FILLED: 8,
  TARGET_HOLLOW: 16,
  SOURCE_HOLLOW: 32,
  TARGET_OPEN: 64,
  SOURCE_OPEN: 128,
} as const;

export const PLAIN_CONNECTION_LINE_MASK =
  PLAIN_CONNECTION_TYPE.DASHED | PLAIN_CONNECTION_TYPE.DOTTED;
export const PLAIN_CONNECTION_SOURCE_ARROW_MASK =
  PLAIN_CONNECTION_TYPE.SOURCE_FILLED |
  PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW |
  PLAIN_CONNECTION_TYPE.SOURCE_OPEN;
export const PLAIN_CONNECTION_TARGET_ARROW_MASK =
  PLAIN_CONNECTION_TYPE.TARGET_FILLED |
  PLAIN_CONNECTION_TYPE.TARGET_HOLLOW |
  PLAIN_CONNECTION_TYPE.TARGET_OPEN;

export interface ConnectableRefs {
  /** Ordered connections for which this connectable is the source. */
  sourceConnectionIds: string[];
  /** Ordered connections for which this connectable is the target. */
  targetConnectionIds: string[];
}

/**
 * Bendpoint stored Archi-style: offsets from the source and target anchor
 * (figure centers) captured at edit time. Absolute position is computed at
 * render time with GEF's weighted blend, matching desktop Archi.
 */
export interface Bendpoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface ArchimateElement {
  id: string;
  kind: 'element';
  type: ElementType;
  name: string;
  documentation: string;
  properties: Property[];
  /** Ordered profile references. The first assignment is the primary specialization. */
  profileIds: string[];
  folderId: string;
  /** Junction only. Archi stores type="or"; "and" is the default. */
  junctionType?: 'and' | 'or';
}

export interface ArchimateRelationship {
  id: string;
  kind: 'relationship';
  type: RelationshipType;
  name: string;
  documentation: string;
  properties: Property[];
  /** Ordered profile references. The first assignment is the primary specialization. */
  profileIds: string[];
  folderId: string;
  sourceId: string;
  targetId: string;
  /** AccessRelationship: 0=write (default), 1=read, 2=none, 3=read/write */
  accessType?: number;
  /** InfluenceRelationship strength, e.g. "+", "++", "-" */
  strength?: string;
  /** AssociationRelationship directed flag */
  directed?: boolean;
}

export type Concept = ArchimateElement | ArchimateRelationship;

export type FolderType =
  | 'strategy'
  | 'business'
  | 'application'
  | 'technology'
  | 'motivation'
  | 'implementation_migration'
  | 'other'
  | 'relations'
  | 'diagrams';

export interface Folder {
  id: string;
  kind: 'folder';
  name: string;
  /** Set only on the fixed top-level folders. */
  folderType?: FolderType;
  documentation: string;
  properties: Property[];
  labelExpression?: string;
  parentId: string | null;
  folderIds: string[];
  itemIds: string[];
}

export interface DiagramView {
  id: string;
  kind: 'view';
  name: string;
  documentation: string;
  properties: Property[];
  folderId: string;
  viewpoint?: string;
  /** Top-level diagram node ids in z-order (first = back). */
  childIds: string[];
  connectionRouterType?: ConnectionRouterType;
}

export interface DiagramNodeBase extends ConnectableRefs {
  id: string;
  viewId: string;
  /** Parent node id, or the view id for top-level nodes. */
  parentId: string;
  /** Bounds relative to parent. */
  bounds: Bounds;
  childIds: string[];
  fillColor?: string;
  lineColor?: string;
  fontColor?: string;
  font?: string;
  fontStyle?: FontStyle;
  fontAlpha?: number;
  /** Fill opacity 0-255 (Archi default 255). */
  alpha?: number;
  lineAlpha?: number;
  gradient?: Gradient;
  lineStyle?: LineStyle;
  lineWidth?: LineWidth;
  iconVisible?: IconVisibility;
  iconColor?: string;
  derivedLineColor?: boolean;
  labelExpression?: string;
  /** SWT alignment: 1=left, 2=center, 4=right */
  textAlignment?: number;
  /** 0=top, 1=center, 2=bottom */
  textPosition?: number;
  imagePath?: string;
  /** 0=specialization image, 1=custom image. */
  imageSource?: ImageSource;
  /** Archi image placement: 0..8 anchors, 9=fill. */
  imagePosition?: ImagePosition;
}

export interface ElementNode extends DiagramNodeBase {
  nodeType: 'element';
  elementId: string;
  /** Alternate figure (0=default, 1=alternate). */
  figureType?: number;
}

export interface GroupNode extends DiagramNodeBase {
  nodeType: 'group';
  name: string;
  documentation: string;
  properties: Property[];
  /** 0=tabbed (default), 1=rectangle */
  borderType?: number;
}

export interface NoteNode extends DiagramNodeBase {
  nodeType: 'note';
  /** Native component name. Legends use "Legend" while their text content stays empty. */
  name?: string;
  content: string;
  properties: Property[];
  /** Present only when this native Note is repurposed as an Archi 5.8+ live legend. */
  legendOptions?: LegendOptions;
  /** 0=dog-ear (default), 1=rectangle, 2=none */
  borderType?: number;
}

export interface RefNode extends DiagramNodeBase {
  nodeType: 'ref';
  refViewId: string;
}

export interface ImageNode extends DiagramNodeBase {
  nodeType: 'image';
  imagePath: string;
}

export type DiagramNode = ElementNode | GroupNode | NoteNode | RefNode | ImageNode;

export interface DiagramConnection extends ConnectableRefs {
  id: string;
  viewId: string;
  connType: 'relationship' | 'plain';
  /** Set when connType === 'relationship'. */
  relationshipId?: string;
  name: string;
  documentation: string;
  /** Ordered editable properties. */
  properties: Property[];
  /** Diagram node or connection ids. */
  sourceId: string;
  targetId: string;
  /** Native plain-connection arrow/line bitmask. Defaults to 0. */
  connectionType?: number;
  /** Native nameVisible feature. Defaults to true. */
  nameVisible?: boolean;
  bendpoints: Bendpoint[];
  lineColor?: string;
  fontColor?: string;
  font?: string;
  fontStyle?: FontStyle;
  fontAlpha?: number;
  lineWidth?: LineWidth;
  lineStyle?: LineStyle;
  labelExpression?: string;
  /** 0=source, 1=middle (default), 2=target */
  textPosition?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  documentation: string;
  properties: Property[];
  metadata: DublinCoreEntry[];
  language?: string;
  version?: string;
}

/** The full persistent state of one open ArchiMate model (undo/redo tracked). */
export interface ModelState {
  info: ModelInfo;
  profiles: Record<string, ProfileDefinition>;
  assets: Record<string, ModelAsset>;
  folders: Record<string, Folder>;
  /** Ordered top-level folder ids. */
  rootFolderIds: string[];
  elements: Record<string, ArchimateElement>;
  relationships: Record<string, ArchimateRelationship>;
  views: Record<string, DiagramView>;
  nodes: Record<string, DiagramNode>;
  connections: Record<string, DiagramConnection>;
}

export type ModelItem =
  | ArchimateElement
  | ArchimateRelationship
  | DiagramView
  | Folder;

export type DiagramConnectable = DiagramNode | DiagramConnection;

/** Look up a diagram node or connection through their shared topology. */
export function getConnectable(state: ModelState, id: string): DiagramConnectable | undefined {
  return state.nodes[id] ?? state.connections[id];
}

/** Resolve the ArchiMate concept represented by a visual endpoint, if any. */
export function resolveSemanticEndpoint(state: ModelState, id: string): Concept | undefined {
  const connectable = getConnectable(state, id);
  if (!connectable) return undefined;
  if ('nodeType' in connectable) {
    return connectable.nodeType === 'element' ? state.elements[connectable.elementId] : undefined;
  }
  return connectable.connType === 'relationship' && connectable.relationshipId
    ? state.relationships[connectable.relationshipId]
    : undefined;
}

/** Alias for callers that prefer an explicit getter name. */
export const getSemanticEndpoint = resolveSemanticEndpoint;

/** Resolve only the represented ArchiMate concept id for endpoint comparisons. */
export function connectableConceptId(state: ModelState, id: string): string | undefined {
  return resolveSemanticEndpoint(state, id)?.id;
}

/** Return a missing-endpoint or recursive connection-dependency error. */
export function connectionGraphError(state: ModelState): string | undefined {
  for (const connection of Object.values(state.connections)) {
    const source = getConnectable(state, connection.sourceId);
    const target = getConnectable(state, connection.targetId);
    if (!source) {
      return `Connection endpoint missing: ${connection.id} source ${connection.sourceId}`;
    }
    if (!target) {
      return `Connection endpoint missing: ${connection.id} target ${connection.targetId}`;
    }
    if (source.viewId !== connection.viewId || target.viewId !== connection.viewId) {
      return `Connection endpoint belongs to another view: ${connection.id}`;
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (connectionId: string): string | undefined => {
    if (visiting.has(connectionId)) return `Connection endpoint cycle: ${connectionId}`;
    if (visited.has(connectionId)) return undefined;
    const connection = state.connections[connectionId];
    if (!connection) return undefined;
    visiting.add(connectionId);
    for (const endpointId of [connection.sourceId, connection.targetId]) {
      if (!state.connections[endpointId]) continue;
      const error = visit(endpointId);
      if (error) return error;
    }
    visiting.delete(connectionId);
    visited.add(connectionId);
    return undefined;
  };
  for (const connectionId of Object.keys(state.connections)) {
    const error = visit(connectionId);
    if (error) return error;
  }
  return undefined;
}

/** Look up any identifiable object in the model. */
export function getItem(state: ModelState, id: string): ModelItem | DiagramNode | DiagramConnection | undefined {
  return (
    state.elements[id] ??
    state.relationships[id] ??
    state.views[id] ??
    state.folders[id] ??
    getConnectable(state, id)
  );
}

export function getConcept(state: ModelState, id: string): Concept | undefined {
  return state.elements[id] ?? state.relationships[id];
}

/** Absolute (view-space) bounds of a diagram node. */
export function absoluteBounds(state: ModelState, nodeId: string): Bounds {
  const node = state.nodes[nodeId];
  if (!node) return { x: 0, y: 0, width: 0, height: 0 };
  let { x, y } = node.bounds;
  let parent = state.nodes[node.parentId];
  while (parent) {
    x += parent.bounds.x;
    y += parent.bounds.y;
    parent = state.nodes[parent.parentId];
  }
  return { x, y, width: node.bounds.width, height: node.bounds.height };
}

export function centerOf(b: Bounds): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
