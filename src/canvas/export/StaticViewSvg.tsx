import type { ModelState } from '../../model/types';
import { ConnectionView } from '../ConnectionView';
import { connectionPolyline } from '../geometry';
import { NodeFigure } from '../figures/NodeFigure';
import { computeAbsBounds } from '../view-editor/bounds';

function StaticNode({ model, nodeId }: { model: ModelState; nodeId: string }) {
  const node = model.nodes[nodeId];
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const { x, y, width, height } = node.bounds;
  return (
    <g transform={`translate(${x},${y})`}>
      <NodeFigure node={node} element={element} refView={refView} width={width} height={height} />
      {node.childIds.map((cid) => (
        <StaticNode key={cid} model={model} nodeId={cid} />
      ))}
    </g>
  );
}

/**
 * Pure, store-free render of a view's full content in model coordinates.
 * Mirrors the read-only editor's scene graph (nodes in z-order, then
 * connections) without selection, handles, or overlays — used for image
 * export and anywhere a view must be drawn outside the live canvas.
 */
export function StaticViewContent({ model, viewId }: { model: ModelState; viewId: string }) {
  const view = model.views[viewId];
  if (!view) return null;
  const absBounds = computeAbsBounds(model, viewId);
  const connections = Object.values(model.connections).filter((c) => c.viewId === viewId);
  return (
    <>
      {view.childIds.map((id) => (
        <StaticNode key={id} model={model} nodeId={id} />
      ))}
      <g>
        {connections.map((conn) => {
          const src = absBounds.get(conn.sourceId);
          const tgt = absBounds.get(conn.targetId);
          if (!src || !tgt) return null;
          return (
            <ConnectionView
              key={conn.id}
              conn={conn}
              rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
              points={connectionPolyline(src, tgt, conn.bendpoints)}
              selected={false}
            />
          );
        })}
      </g>
    </>
  );
}
