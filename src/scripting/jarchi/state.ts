import { getActiveModelStore, type ModelStore } from '../../model/store';
import type { ModelState } from '../../model/types';

export function state(store: ModelStore = getActiveModelStore()): ModelState {
  const m = store.getState().model;
  if (!m) throw new Error('No model is open');
  return m;
}
