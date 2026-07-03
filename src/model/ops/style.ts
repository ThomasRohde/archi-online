import { transact } from '../store';
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
}

export function setNodeStyle(ids: string[], style: NodeStyle): void {
  transact('Change Style', (draft) => {
    for (const id of ids) {
      const node = draft.nodes[id];
      if (node) {
        Object.assign(node, style);
        continue;
      }
      const conn = draft.connections[id];
      if (conn) {
        if (style.lineColor !== undefined) conn.lineColor = style.lineColor;
        if (style.fontColor !== undefined) conn.fontColor = style.fontColor;
        if (style.font !== undefined) conn.font = style.font;
      }
    }
  });
}

export function setConnectionBendpoints(id: string, bendpoints: DiagramConnection['bendpoints']): void {
  transact('Edit Bendpoints', (draft) => {
    const conn = draft.connections[id];
    if (conn) conn.bendpoints = bendpoints;
  });
}
