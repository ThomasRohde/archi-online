import { createHash } from 'node:crypto';

/**
 * Canonical persistent Phase 2 semantics. Records are sorted by id while every
 * model-defined order (folders, items, children, adjacency, properties, and
 * bendpoints) is retained. The few defaults below are Archi 5.9 persistence
 * defaults that Desktop may materialize when it saves an otherwise equivalent
 * object; they are documented beside the fixture baselines.
 */
export function canonicalizePhase2Model(model) {
  const compact = (value) => JSON.parse(JSON.stringify(value));
  const sorted = (record, map) => Object.values(record)
    .map(map)
    .sort((left, right) => left.id.localeCompare(right.id));
  const node = (item) => ({
    ...item,
    lineWidth: item.lineWidth ?? 1,
    alpha: item.alpha ?? 255,
    lineAlpha: item.lineAlpha ?? 255,
    fontAlpha: item.fontAlpha ?? 255,
    imagePosition: item.imagePosition ?? (item.nodeType === 'image' ? 9 : 2),
  });
  const connection = (item) => ({
    ...item,
    connectionType: item.connType === 'plain' ? (item.connectionType ?? 0) : undefined,
    nameVisible: item.nameVisible ?? true,
    lineWidth: item.lineWidth ?? 1,
    fontAlpha: item.fontAlpha ?? 255,
    textPosition: item.textPosition ?? 1,
  });

  return compact({
    info: { ...model.info },
    rootFolderIds: [...model.rootFolderIds],
    folders: sorted(model.folders, (item) => ({ ...item })),
    profiles: sorted(model.profiles, (item) => ({ ...item })),
    elements: sorted(model.elements, (item) => ({ ...item })),
    relationships: sorted(model.relationships, (item) => ({ ...item })),
    views: sorted(model.views, (item) => ({ ...item, connectionRouterType: item.connectionRouterType ?? 0 })),
    nodes: sorted(model.nodes, node),
    connections: sorted(model.connections, connection),
    assets: sorted(model.assets, (asset) => ({
      id: asset.path,
      mediaType: asset.mediaType,
      renderMediaType: asset.renderMediaType,
      sha256: asset.sha256,
      renderSha256: createHash('sha256').update(asset.renderBytes).digest('hex'),
      byteLength: asset.bytes.length,
      renderByteLength: asset.renderBytes.length,
    })),
  });
}

export function comparePhase2Semantics(expected, actual, path = '$') {
  if (Object.is(expected, actual)) return [];
  if (typeof expected !== typeof actual || expected === null || actual === null) {
    return [`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array`];
    const length = expected.length === actual.length
      ? []
      : [`${path}.length: ${expected.length} != ${actual.length}`];
    return [
      ...length,
      ...expected.flatMap((value, index) => comparePhase2Semantics(value, actual[index], `${path}[${index}]`)),
    ];
  }
  if (typeof expected === 'object') {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .sort()
      .flatMap((key) => comparePhase2Semantics(expected[key], actual[key], `${path}.${key}`));
  }
  return [`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`];
}

export function assertPhase2Semantics(expected, actual, label = 'Phase 2 semantics') {
  const differences = comparePhase2Semantics(expected, actual);
  if (differences.length > 0) {
    throw new Error(`${label} failed:\n${differences.slice(0, 80).join('\n')}`);
  }
}
