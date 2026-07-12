import { isAllowedElementInViewpoint } from '../../model/data/viewpoints';
import type { ModelState } from '../../model/types';

// Ported from Archi (VIEWPOINTS_GHOST_DIAGRAM_ELEMENTS, default on): diagram
// objects whose element type is not allowed in the view's viewpoint are drawn
// "ghosted". AbstractDiagramModelObjectFigure.getAlpha() caps a disabled
// figure's alpha at min(100, alpha), i.e. ~100/255 ≈ 0.4.
export const GHOST_OPACITY = 0.4;

/**
 * True when the node is an element node whose type is disallowed by the view's
 * viewpoint. Only ArchiMate element nodes ghost — notes, groups and refs are
 * never concepts, and junctions/groupings are always allowed (Archi defaultList).
 */
export function isNodeGhosted(
  model: ModelState,
  nodeId: string,
  viewpoint: string | undefined,
): boolean {
  if (!viewpoint) return false;
  const node = model.nodes[nodeId];
  if (!node || node.nodeType !== 'element') return false;
  const el = model.elements[node.elementId];
  return !!el && !isAllowedElementInViewpoint(viewpoint, el.type);
}

/**
 * Connections inherit viewpoint ghosting from both endpoints. Connection
 * endpoints are followed recursively so every dependent edge projects the
 * same ghost state; corrupt cycles terminate without mutating the model.
 */
export function isConnectableGhosted(
  model: ModelState,
  connectableId: string,
  viewpoint: string | undefined,
): boolean {
  const cache = new Map<string, boolean>();
  const visiting = new Set<string>();
  const resolve = (id: string): boolean => {
    if (model.nodes[id]) return isNodeGhosted(model, id, viewpoint);
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const connection = model.connections[id];
    if (!connection || visiting.has(id)) return false;
    visiting.add(id);
    const ghosted = resolve(connection.sourceId) || resolve(connection.targetId);
    visiting.delete(id);
    cache.set(id, ghosted);
    return ghosted;
  };
  return resolve(connectableId);
}
