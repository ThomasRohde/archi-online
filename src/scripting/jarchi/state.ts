import { useStore } from '../../model/store';
import type { ModelState } from '../../model/types';

export function state(): ModelState {
  const m = useStore.getState().model;
  if (!m) throw new Error('No model is open');
  return m;
}
