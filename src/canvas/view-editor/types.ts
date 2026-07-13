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
  | { kind: 'connect'; sourceId: string; current: Point; hoverConnectableId: string | null }
  | {
      kind: 'reconnect';
      connId: string;
      end: 'source' | 'target';
      current: Point;
      hoverConnectableId: string | null;
    }
  | { kind: 'bend'; connId: string; index: number; start: Point; current: Point; isNew: boolean };

export interface EditState {
  nodeId: string;
  initial: string;
}
