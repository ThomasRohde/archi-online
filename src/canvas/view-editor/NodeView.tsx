import { useStore } from '../../model/store';
import type { C4ViewType } from '../../model/c4';
import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';
import { NodeFigure } from '../figures/NodeFigure';

export function NodeView({
  model,
  nodeId,
  moveDelta,
  resize,
  dropParentId,
  connectSource,
  connectHover,
  c4ViewType,
}: {
  model: ModelState;
  nodeId: string;
  moveDelta: Map<string, Point>;
  resize: { nodeId: string; rel: Bounds } | null;
  dropParentId: string | null;
  connectSource: string | null;
  connectHover: { id: string; valid: boolean } | null;
  c4ViewType?: C4ViewType;
}) {
  const node = model.nodes[nodeId];
  const selected = useStore(
    (s) => s.selection.source === 'view' && s.selection.ids.includes(nodeId),
  );
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const delta = moveDelta.get(nodeId);
  const rel = resize?.nodeId === nodeId ? resize.rel : node.bounds;
  const x = rel.x + (delta?.x ?? 0);
  const y = rel.y + (delta?.y ?? 0);
  const { width, height } = rel;
  const highlight =
    dropParentId === nodeId ||
    connectSource === nodeId ||
    (connectHover?.id === nodeId && connectHover.valid);
  const invalid = connectHover?.id === nodeId && !connectHover.valid;

  return (
    <g transform={`translate(${x},${y})`} data-node-id={nodeId} opacity={delta ? 0.75 : 1}>
      <NodeFigure
        node={node}
        element={element}
        refView={refView}
        width={width}
        height={height}
        c4ViewType={c4ViewType}
      />
      {(selected || highlight || invalid) && (
        <rect
          x={-1.5}
          y={-1.5}
          width={width + 3}
          height={height + 3}
          fill="none"
          stroke={invalid ? '#c43a3a' : highlight ? '#1d9e46' : '#2a6cc4'}
          strokeWidth={highlight || invalid ? 2 : 1.2}
          pointerEvents="none"
        />
      )}
      {node.childIds.map((cid) => (
        <NodeView
          key={cid}
          model={model}
          nodeId={cid}
          moveDelta={moveDelta}
          resize={resize}
          dropParentId={dropParentId}
          connectSource={connectSource}
          connectHover={connectHover}
          c4ViewType={c4ViewType}
        />
      ))}
    </g>
  );
}
