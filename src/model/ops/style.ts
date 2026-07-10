import { transact, type ModelStore } from '../store';
import type { DiagramConnection } from '../types';

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
  lineWidth?: number | undefined;
}

export function setNodeStyle(ids: string[], style: NodeStyle, store?: ModelStore): void {
  transact('Change Style', (draft) => {
    for (const id of ids) {
      const node = draft.nodes[id];
      if (node) {
        const nodeStyle = { ...style };
        delete nodeStyle.lineWidth;
        Object.assign(node, nodeStyle);
        continue;
      }
      const conn = draft.connections[id];
      if (conn) {
        if ('lineColor' in style) conn.lineColor = style.lineColor;
        if ('fontColor' in style) conn.fontColor = style.fontColor;
        if ('font' in style) conn.font = style.font;
        if ('lineWidth' in style) conn.lineWidth = style.lineWidth;
        if ('textPosition' in style) conn.textPosition = style.textPosition;
      }
    }
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
