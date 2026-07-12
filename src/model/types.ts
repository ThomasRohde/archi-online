import type { ElementType, RelationshipType } from './metamodel';

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
  connectionRouterType?: number;
}

export interface DiagramNodeBase {
  id: string;
  viewId: string;
  /** Parent node id, or the view id for top-level nodes. */
  parentId: string;
  /** Bounds relative to parent. */
  bounds: Bounds;
  childIds: string[];
  sourceConnectionIds: string[];
  targetConnectionIds: string[];
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
  content: string;
  properties: Property[];
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

export interface DiagramConnection {
  id: string;
  viewId: string;
  connType: 'relationship' | 'plain';
  /** Set when connType === 'relationship'. */
  relationshipId?: string;
  /** Diagram node ids (Archi also allows connection ends; not supported yet). */
  sourceId: string;
  targetId: string;
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

/** Look up any identifiable object in the model. */
export function getItem(state: ModelState, id: string): ModelItem | DiagramNode | DiagramConnection | undefined {
  return (
    state.elements[id] ??
    state.relationships[id] ??
    state.views[id] ??
    state.folders[id] ??
    state.nodes[id] ??
    state.connections[id]
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
