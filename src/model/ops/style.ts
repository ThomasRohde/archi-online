import { getActiveModelStore, transact, type ModelStore } from '../store';
import type {
  DiagramConnection,
  DiagramNode,
  FontStyle,
  ImagePosition,
  ModelState,
} from '../types';
import { pruneUnreferencedAssets } from '../assets';

export interface NodeStyle {
  fillColor?: string | undefined;
  lineColor?: string | undefined;
  fontColor?: string | undefined;
  font?: string | undefined;
  alpha?: number | undefined;
  lineAlpha?: number | undefined;
  textAlignment?: number | undefined;
  textPosition?: number | undefined;
  figureType?: number | undefined;
  lineWidth?: 1 | 2 | 3 | undefined;
  imagePath?: string | undefined;
  imageSource?: 0 | 1 | undefined;
  imagePosition?: ImagePosition | undefined;
  gradient?: -1 | 0 | 1 | 2 | 3 | undefined;
  lineStyle?: -1 | 0 | 1 | 2 | 3 | undefined;
  iconVisible?: 0 | 1 | 2 | undefined;
  iconColor?: string | undefined;
  derivedLineColor?: boolean | undefined;
  borderType?: number | undefined;
  fontStyle?: FontStyle | undefined;
  fontAlpha?: number | undefined;
}

export interface DiagramStyleSnapshot {
  sourceKind: 'node' | 'connection';
  sourceNodeType?: DiagramNode['nodeType'];
  sourceConnectionType?: DiagramConnection['connType'];
  style: NodeStyle;
  plainConnectionType?: number;
}

const SHARED_STYLE_KEYS = [
  'lineColor',
  'fontColor',
  'font',
  'fontStyle',
  'fontAlpha',
  'lineWidth',
  'lineStyle',
  'textPosition',
] as const satisfies readonly (keyof NodeStyle)[];

function typographyStyle(
  source: Pick<DiagramNode | DiagramConnection, 'font' | 'fontStyle'>,
): Pick<NodeStyle, 'font' | 'fontStyle'> {
  return source.fontStyle !== undefined
    ? { fontStyle: source.fontStyle }
    : { font: source.font };
}

export function captureDiagramStyleSnapshot(
  model: ModelState,
  id: string,
): DiagramStyleSnapshot | undefined {
  const node = model.nodes[id];
  if (node) {
    return {
      sourceKind: 'node',
      sourceNodeType: node.nodeType,
      style: {
        fillColor: node.fillColor,
        lineColor: node.lineColor,
        fontColor: node.fontColor,
        ...typographyStyle(node),
        alpha: node.alpha,
        lineAlpha: node.lineAlpha,
        textAlignment: node.textAlignment,
        textPosition: node.textPosition,
        figureType: node.nodeType === 'element' ? node.figureType : undefined,
        lineWidth: node.lineWidth,
        imagePath: node.nodeType === 'image' ? undefined : node.imagePath,
        imageSource: node.nodeType === 'image' ? undefined : node.imageSource,
        imagePosition: node.nodeType === 'image' ? undefined : node.imagePosition,
        gradient: node.gradient,
        lineStyle: node.lineStyle,
        iconVisible: node.nodeType === 'element' ? node.iconVisible : undefined,
        iconColor: node.nodeType === 'element' ? node.iconColor : undefined,
        derivedLineColor: node.derivedLineColor,
        fontAlpha: node.fontAlpha,
      },
    };
  }
  const connection = model.connections[id];
  if (!connection) return undefined;
  return {
    sourceKind: 'connection',
    sourceConnectionType: connection.connType,
    style: {
      lineColor: connection.lineColor,
      fontColor: connection.fontColor,
      ...typographyStyle(connection),
      fontAlpha: connection.fontAlpha,
      lineWidth: connection.lineWidth,
      lineStyle: connection.lineStyle,
      textPosition: connection.textPosition,
    },
    plainConnectionType: connection.connType === 'plain'
      ? connection.connectionType
      : undefined,
  };
}

function pickStyle(style: NodeStyle, keys: readonly (keyof NodeStyle)[]): NodeStyle {
  return Object.fromEntries(
    keys.filter((key) => key in style).map((key) => [key, style[key]]),
  ) as NodeStyle;
}

export function applyFormatPainterSnapshot(
  targetId: string,
  snapshot: DiagramStyleSnapshot,
  store?: ModelStore,
): boolean {
  const targetStore = store ?? getActiveModelStore();
  const model = targetStore.getState().model;
  if (!model || targetStore.getState().readOnly) return false;
  const node = model.nodes[targetId];
  const connection = model.connections[targetId];
  if (!node && !connection) return false;

  const style = connection || snapshot.sourceKind === 'connection'
    ? pickStyle(snapshot.style, SHARED_STYLE_KEYS)
    : { ...snapshot.style };
  if (node) {
    if (node.nodeType !== 'element' || snapshot.sourceNodeType !== 'element') {
      delete style.figureType;
      delete style.iconVisible;
      delete style.iconColor;
    }
    if (node.nodeType === 'image' || snapshot.sourceNodeType === 'image') {
      delete style.imagePath;
      delete style.imageSource;
      delete style.imagePosition;
    }
    if (style.imagePath && !model.assets[style.imagePath]) {
      delete style.imagePath;
      delete style.imageSource;
      delete style.imagePosition;
    }
    if (style.imageSource === 0) {
      const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
      const hasProfileImage = element?.profileIds.some((profileId) =>
        Boolean(model.profiles[profileId]?.imagePath),
      ) ?? false;
      if (!hasProfileImage) {
        delete style.imagePath;
        delete style.imageSource;
        delete style.imagePosition;
      }
    }
  }

  targetStore.runBatch('Apply Format', () => {
    setNodeStyle([targetId], style, targetStore);
    if (
      connection?.connType === 'plain' &&
      snapshot.sourceConnectionType === 'plain'
    ) {
      transact('Apply Plain Connection Format', (draft) => {
        const target = draft.connections[targetId];
        if (target?.connType === 'plain') target.connectionType = snapshot.plainConnectionType;
      }, targetStore);
    }
  });
  return true;
}

export function setNodeStyle(ids: string[], style: NodeStyle, store?: ModelStore): void {
  transact('Change Style', (draft) => {
    for (const id of ids) {
      const node = draft.nodes[id];
      if (node) {
        const nodeStyle = { ...style };
        delete nodeStyle.lineWidth;
        if ('lineWidth' in style) node.lineWidth = style.lineWidth;
        Object.assign(node, nodeStyle);
        if ('fontStyle' in style) node.font = undefined;
        continue;
      }
      const conn = draft.connections[id];
      if (conn) {
        if ('lineColor' in style) conn.lineColor = style.lineColor;
        if ('fontColor' in style) conn.fontColor = style.fontColor;
        if ('font' in style) conn.font = style.font;
        if ('font' in style) conn.fontStyle = undefined;
        if ('lineWidth' in style) conn.lineWidth = style.lineWidth;
        if ('textPosition' in style) conn.textPosition = style.textPosition;
        if ('lineStyle' in style) conn.lineStyle = style.lineStyle;
        if ('fontStyle' in style) conn.fontStyle = style.fontStyle;
        if ('fontStyle' in style) conn.font = undefined;
        if ('fontAlpha' in style) conn.fontAlpha = style.fontAlpha;
      }
    }
    pruneUnreferencedAssets(draft);
  }, store);
}

export function setLabelExpression(id: string, expression: string | undefined, store?: ModelStore): void {
  transact('Change Label Expression', (draft) => {
    const target = draft.nodes[id] ?? draft.connections[id] ?? draft.folders[id];
    if (target) target.labelExpression = expression || undefined;
  }, store);
}

export function setConnectionBendpoints(
  id: string,
  bendpoints: DiagramConnection['bendpoints'],
  store?: ModelStore,
): void {
  transact('Edit Bendpoints', (draft) => {
    const conn = draft.connections[id];
    if (conn) conn.bendpoints = bendpoints;
  }, store);
}
