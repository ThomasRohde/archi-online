import { transact, type ModelStore } from '../store';
import type { DiagramConnection, FontStyle, ImagePosition } from '../types';
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
  fontStyle?: FontStyle | undefined;
  fontAlpha?: number | undefined;
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
