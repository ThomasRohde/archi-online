import { useStore } from '../../ui/store-hooks';
import type { C4ViewType } from '../../model/c4';
import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';
import { NodeFigure } from '../figures/NodeFigure';
import { GHOST_OPACITY, isNodeGhosted } from './viewpoint-ghost';
import { assetDataUrl } from '../../model/assets';

export function NodeView({
  model,
  nodeId,
  moveDelta,
  resize,
  dropParentId,
  connectSource,
  connectHover,
  anchorId,
  c4ViewType,
  viewpoint,
}: {
  model: ModelState;
  nodeId: string;
  moveDelta: Map<string, Point>;
  resize: { nodeId: string; rel: Bounds } | null;
  dropParentId: string | null;
  connectSource: string | null;
  connectHover: { id: string; valid: boolean } | null;
  anchorId?: string | null;
  c4ViewType?: C4ViewType;
  viewpoint?: string;
}) {
  const node = model.nodes[nodeId];
  const selected = useStore(
    (s) => s.selection.source === 'view' && s.selection.ids.includes(nodeId),
  );
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const imagePath = node.nodeType === 'element' && (node.imageSource ?? 0) === 0
    ? model.profiles[element?.profileIds[0] ?? '']?.imagePath
    : node.imagePath;
  const imageUrl = imagePath && model.assets[imagePath]
    ? assetDataUrl(model.assets[imagePath])
    : undefined;
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
  // The align/match anchor (key object) gets a distinct amber outline plus
  // filled corner handles so it is clear which element the rest snaps to.
  const anchorCue = selected && anchorId === nodeId && !highlight && !invalid;
  // Grey out element nodes whose type the view's viewpoint disallows (Archi's
  // ghosting). Only the figure dims — the selection outline and nested child
  // nodes keep their own opacity.
  const ghosted = isNodeGhosted(model, nodeId, viewpoint);

  return (
    <g transform={`translate(${x},${y})`} data-node-id={nodeId} opacity={delta ? 0.75 : 1}>
      <g opacity={ghosted ? GHOST_OPACITY : undefined} data-ghosted={ghosted ? 'true' : undefined}>
        <NodeFigure
          node={node}
          element={element}
          refView={refView}
          width={width}
          height={height}
          c4ViewType={c4ViewType}
          imageUrl={imageUrl}
        />
      </g>
      {(selected || highlight || invalid) && (
        <rect
          x={-1.5}
          y={-1.5}
          width={width + 3}
          height={height + 3}
          fill="none"
          stroke={invalid ? '#c43a3a' : highlight ? '#1d9e46' : anchorCue ? '#e8820c' : '#2a6cc4'}
          strokeWidth={highlight || invalid ? 2 : anchorCue ? 1.8 : 1.2}
          pointerEvents="none"
        />
      )}
      {anchorCue &&
        [
          [0, 0],
          [width, 0],
          [0, height],
          [width, height],
        ].map(([cx, cy], i) => (
          <rect
            key={i}
            x={cx - 3}
            y={cy - 3}
            width={6}
            height={6}
            fill="#e8820c"
            pointerEvents="none"
          />
        ))}
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
          anchorId={anchorId}
          c4ViewType={c4ViewType}
          viewpoint={viewpoint}
        />
      ))}
    </g>
  );
}
