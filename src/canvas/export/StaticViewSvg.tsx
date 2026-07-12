import type { ModelState } from '../../model/types';
import { ConnectionView } from '../ConnectionView';
import {
  createConnectionRouteResolver,
  createConnectionVisibilityResolver,
} from '../geometry';
import { NodeFigure } from '../figures/NodeFigure';
import { computeAbsBounds } from '../view-editor/bounds';
import { assetDataUrl } from '../../model/assets';
import { evaluateLabelExpression } from '../../model/label-expression';

function StaticNode({ model, nodeId }: { model: ModelState; nodeId: string }) {
  const node = model.nodes[nodeId];
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const imagePath = node.nodeType === 'element' && (node.imageSource ?? 0) === 0
    ? model.profiles[element?.profileIds[0] ?? '']?.imagePath
    : node.imagePath;
  const imageUrl = imagePath && model.assets[imagePath]
    ? assetDataUrl(model.assets[imagePath])
    : undefined;
  const { x, y, width, height } = node.bounds;
  return (
    <g transform={`translate(${x},${y})`}>
      <NodeFigure
        node={node}
        element={element}
        refView={refView}
        width={width}
        height={height}
        imageUrl={imageUrl}
        displayLabel={node.labelExpression !== undefined ? evaluateLabelExpression(model, nodeId, node.labelExpression).text : undefined}
      />
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
  const isConnectionVisible = createConnectionVisibilityResolver(model);
  const route = createConnectionRouteResolver(model, absBounds, {
    isVisible: isConnectionVisible,
  });
  return (
    <>
      {view.childIds.map((id) => (
        <StaticNode key={id} model={model} nodeId={id} />
      ))}
      <g>
        {connections.map((conn) => {
          const points = route(conn.id);
          if (!points) return null;
          return (
            <ConnectionView
              key={conn.id}
              conn={conn}
              rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
              points={points}
              selected={false}
              displayLabel={conn.labelExpression !== undefined ? evaluateLabelExpression(model, conn.id, conn.labelExpression).text : undefined}
            />
          );
        })}
      </g>
    </>
  );
}
