import { newId } from '../id';
import {
  DEFAULT_LEGEND_OPTIONS,
  legendOptimalSize,
  normalizeLegendOptions,
  type LegendOptions,
  type LegendPreferences,
  type MeasureLegendLabel,
} from '../legend';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import type { Bounds, NoteNode } from '../types';
import type { DiagramNodeDefaults } from './view';
import { attachNode } from './draft';

export function addLegendToView(
  viewId: string,
  parentId: string,
  bounds: Bounds,
  options?: Partial<LegendOptions>,
  defaults: DiagramNodeDefaults = {},
  store: ModelStore = getActiveModelStore(),
): string | null {
  const state = store.getState();
  if (state.readOnly || !state.model?.views[viewId]) return null;
  if (parentId !== viewId && state.model.nodes[parentId]?.viewId !== viewId) return null;
  const id = newId();
  transact('Create Legend', (draft) => {
    const node: NoteNode = {
      id,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      name: 'Legend',
      content: '',
      properties: [],
      borderType: 1,
      ...defaults,
      textAlignment: 1,
      textPosition: 0,
      legendOptions: normalizeLegendOptions(options ?? DEFAULT_LEGEND_OPTIONS),
    };
    attachNode(draft, node);
  }, store);
  return id;
}

export function setLegendOptions(
  legendId: string,
  patch: Partial<LegendOptions>,
  store?: ModelStore,
): void {
  transact('Set Legend Options', (draft) => {
    const node = draft.nodes[legendId];
    if (node?.nodeType !== 'note' || !node.legendOptions) return;
    node.legendOptions = normalizeLegendOptions({ ...node.legendOptions, ...patch });
  }, store);
}

export function setLegendOptimalSize(
  legendId: string,
  preferences: LegendPreferences,
  measure?: MeasureLegendLabel,
  store: ModelStore = getActiveModelStore(),
): void {
  const state = store.getState();
  if (!state.model || state.readOnly) return;
  const node = state.model.nodes[legendId];
  if (node?.nodeType !== 'note' || !node.legendOptions) return;
  const fontSizePx = (node.fontStyle?.sizePt ?? 9) * (4 / 3);
  const size = legendOptimalSize(
    state.model,
    legendId,
    preferences,
    measure ?? ((label) => label.length * fontSizePx * 0.56),
    fontSizePx * 1.2,
  );
  transact('Set Legend Optimal Size', (draft) => {
    const node = draft.nodes[legendId];
    if (node?.nodeType !== 'note' || !node.legendOptions) return;
    node.bounds.width = size.width;
    node.bounds.height = size.height;
  }, store);
}
