import type { Bounds } from '../../model/types';
import type { Point } from '../geometry';

export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

export type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'maybe-move'; start: Point; nodeId: string }
  | { kind: 'maybe-bend'; start: Point; connId: string }
  | {
      kind: 'move';
      start: Point;
      current: Point;
      rootIds: string[];
      dropParentId: string | null;
    }
  | {
      kind: 'resize';
      nodeId: string;
      handle: string;
      startAbs: Bounds;
      currentAbs: Bounds;
    }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean }
  | { kind: 'connect'; sourceNodeId: string; current: Point; hoverNodeId: string | null }
  | { kind: 'bend'; connId: string; index: number; current: Point; isNew: boolean };

export interface EditState {
  nodeId: string;
  initial: string;
}
