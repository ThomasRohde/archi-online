import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';

export interface NodeInteractionInput {
  moveDelta: Map<string, Point>;
  resize: { nodeId: string; rel: Bounds } | null;
  dropParentId: string | null;
  connectSourceId: string | null;
  connectHover: { id: string; valid: boolean } | null;
}

function appendVersion(
  model: ModelState,
  versions: Map<string, string[]>,
  nodeId: string | null,
  value: string,
): void {
  let current = nodeId;
  while (current && model.nodes[current]) {
    versions.set(current, [...(versions.get(current) ?? []), value]);
    current = model.nodes[current].parentId;
  }
}

/**
 * Build small invalidation keys for the node subtrees affected by live input.
 * Unrelated top-level NodeView components keep an empty, stable key and can be
 * skipped by React.memo even though the interaction maps themselves changed.
 */
export function createNodeInteractionVersions(
  model: ModelState,
  input: NodeInteractionInput,
): Map<string, string> {
  const versions = new Map<string, string[]>();
  for (const [nodeId, delta] of input.moveDelta) {
    appendVersion(model, versions, nodeId, `move:${delta.x}:${delta.y}`);
  }
  if (input.resize) {
    const { x, y, width, height } = input.resize.rel;
    appendVersion(
      model,
      versions,
      input.resize.nodeId,
      `resize:${x}:${y}:${width}:${height}`,
    );
  }
  appendVersion(model, versions, input.dropParentId, 'drop-target');
  appendVersion(model, versions, input.connectSourceId, 'connect-source');
  appendVersion(
    model,
    versions,
    input.connectHover?.id ?? null,
    input.connectHover?.valid ? 'connect-valid' : 'connect-invalid',
  );
  return new Map([...versions].map(([id, values]) => [id, values.sort().join('|')]));
}

export function stableRoutePoints(previous: Point[] | undefined, next: Point[]): Point[] {
  if (
    previous?.length === next.length &&
    previous.every((point, index) => point.x === next[index].x && point.y === next[index].y)
  ) {
    return previous;
  }
  return next;
}
