import { transact, type ModelStore } from '../store';
import type { Bendpoint, Bounds } from '../types';

export interface DiagramNodeLayoutUpdate {
  id: string;
  bounds: Bounds;
}

export interface DiagramConnectionLayoutUpdate {
  id: string;
  bendpoints: Bendpoint[];
}

export function layoutView(
  nodeUpdates: DiagramNodeLayoutUpdate[],
  connectionUpdates: DiagramConnectionLayoutUpdate[],
  store?: ModelStore,
): void {
  transact('Layout View', (draft) => {
    for (const update of nodeUpdates) {
      const node = draft.nodes[update.id];
      if (node) node.bounds = { ...update.bounds };
    }
    for (const update of connectionUpdates) {
      const conn = draft.connections[update.id];
      if (conn) conn.bendpoints = update.bendpoints.map((bp) => ({ ...bp }));
    }
  }, store);
}
