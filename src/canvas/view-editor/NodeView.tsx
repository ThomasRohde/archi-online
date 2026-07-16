import { memo } from 'react';
import { useStore } from '../../ui/store-hooks';
import type { C4ViewType } from '../../model/c4';
import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';
import { NodeFigure } from '../figures/NodeFigure';
import { GHOST_OPACITY, isNodeGhosted } from './viewpoint-ghost';
import { assetDataUrl } from '../../model/assets';
import { evaluateLabelExpression } from '../../model/label-expression';
import { useSettingsStore } from '../../settings/app-settings';
import { evaluateCachedLabelExpression } from './label-cache';
import {
  reconnectIntentTone,
  type ReconnectIntent,
} from './reconnect-intent';

interface NodeViewProps {
  model: ModelState;
  nodeId: string;
  moveDelta: Map<string, Point>;
  resize: { nodeId: string; rel: Bounds } | null;
  dropParentId: string | null;
  connectSource: string | null;
  connectHover: { id: string; valid: boolean } | null;
  reconnectIntent?: ReconnectIntent | null;
  interactionVersions?: Map<string, string>;
  anchorId?: string | null;
  c4ViewType?: C4ViewType;
  viewpoint?: string;
}

const EMPTY_INTERACTION_VERSIONS = new Map<string, string>();

function NodeViewComponent({
  model,
  nodeId,
  moveDelta,
  resize,
  dropParentId,
  connectSource,
  connectHover,
  reconnectIntent = null,
  interactionVersions = EMPTY_INTERACTION_VERSIONS,
  anchorId,
  c4ViewType,
  viewpoint,
}: NodeViewProps) {
  const node = model.nodes[nodeId];
  const legendLabels = useSettingsStore((state) => state.settings.legendLabels);
  const legendUserColors = useSettingsStore(
    (state) => state.settings.legendUserColors,
  );
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
  const reconnectTone =
    reconnectIntent?.targetId === nodeId
      ? reconnectIntentTone(reconnectIntent)
      : null;
  const invalid =
    (connectHover?.id === nodeId && !connectHover.valid) ||
    reconnectTone === 'invalid';
  const positive = highlight || reconnectTone === 'valid' || reconnectTone === 'anchor';
  // The align/match anchor (key object) gets a distinct amber outline plus
  // filled corner handles so it is clear which element the rest snaps to.
  const anchorCue = selected && anchorId === nodeId && !highlight && !invalid;
  // Grey out element nodes whose type the view's viewpoint disallows (Archi's
  // ghosting). Only the figure dims — the selection outline and nested child
  // nodes keep their own opacity.
  const ghosted = isNodeGhosted(model, nodeId, viewpoint);
  const displayLabel = node.labelExpression !== undefined
    ? evaluateCachedLabelExpression(
        model,
        nodeId,
        node.labelExpression,
        evaluateLabelExpression,
      ).text
    : undefined;

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
          displayLabel={displayLabel}
          model={model}
          legendPreferences={{
            labels: legendLabels,
            userColors: legendUserColors,
          }}
        />
      </g>
      {(selected || positive || invalid) && (
        <rect
          x={-1.5}
          y={-1.5}
          width={width + 3}
          height={height + 3}
          fill="none"
          stroke={
            invalid
              ? 'var(--canvas-invalid)'
              : reconnectTone === 'anchor'
                ? 'var(--canvas-anchor)'
                : positive
                  ? 'var(--canvas-valid)'
                  : anchorCue
                    ? 'var(--canvas-anchor)'
                    : 'var(--canvas-selection)'
          }
          strokeWidth={positive || invalid ? 2 : anchorCue ? 1.8 : 1.2}
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
            fill="var(--canvas-anchor)"
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
          reconnectIntent={reconnectIntent}
          interactionVersions={interactionVersions}
          anchorId={anchorId}
          c4ViewType={c4ViewType}
          viewpoint={viewpoint}
        />
      ))}
    </g>
  );
}

export const NodeView = memo(NodeViewComponent, (previous, next) =>
  previous.model === next.model &&
  previous.nodeId === next.nodeId &&
  previous.interactionVersions?.get(previous.nodeId) ===
    next.interactionVersions?.get(next.nodeId) &&
  previous.anchorId === next.anchorId &&
  previous.c4ViewType === next.c4ViewType &&
  previous.viewpoint === next.viewpoint
);
