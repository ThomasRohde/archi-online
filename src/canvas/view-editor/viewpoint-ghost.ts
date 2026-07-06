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
