import type { ModelState } from './types';

/**
 * Derive connection visibility without mutating stored state. Directly hidden
 * endpoint connections recursively hide every connection that depends on them.
 */
export function createConnectionVisibilityResolver(
  model: ModelState,
  directlyVisible: (connectableId: string) => boolean = () => true,
): (connectionId: string) => boolean {
  const cache = new Map<string, boolean>();
  const resolving = new Set<string>();
  const resolve = (connectionId: string): boolean => {
    const cached = cache.get(connectionId);
    if (cached !== undefined) return cached;
    if (resolving.has(connectionId)) return false;
    const connection = model.connections[connectionId];
    if (!connection || !directlyVisible(connectionId)) {
      cache.set(connectionId, false);
      return false;
    }
    resolving.add(connectionId);
    const visible = [connection.sourceId, connection.targetId].every((endpointId) => {
      if (!directlyVisible(endpointId)) return false;
      if (model.nodes[endpointId]) return true;
      return Boolean(model.connections[endpointId]) && resolve(endpointId);
    });
    resolving.delete(connectionId);
    cache.set(connectionId, visible);
    return visible;
  };
  return resolve;
}
