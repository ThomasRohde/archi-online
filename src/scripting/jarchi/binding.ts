import { getActiveModelStore, type ModelStore } from '../../model/store';
import {
  getModelStoreWorkspaceLease,
  isModelStoreWorkspaceLeaseOpen,
  type ModelStoreWorkspaceLease,
} from '../../model/workspace';

interface ModelBinding {
  readonly store: ModelStore;
  readonly modelEpoch: number;
  readonly workspaceLease: ModelStoreWorkspaceLease | null;
}

const ownerBindings = new WeakMap<object, ModelBinding>();
const currentStoreBindings = new WeakMap<ModelStore, ModelBinding>();

function currentBinding(store: ModelStore): ModelBinding {
  const modelEpoch = store.getState().modelEpoch;
  const workspaceLease = getModelStoreWorkspaceLease(store) ?? null;
  const current = currentStoreBindings.get(store);
  if (
    current
    && current.modelEpoch === modelEpoch
    && current.workspaceLease === workspaceLease
  ) {
    return current;
  }
  const binding = Object.freeze({ store, modelEpoch, workspaceLease });
  currentStoreBindings.set(store, binding);
  return binding;
}

export function bindModelOwner(
  owner: object,
  store: ModelStore = getActiveModelStore(),
): void {
  ownerBindings.set(owner, currentBinding(store));
}

function requireBinding(owner: object): ModelBinding {
  const binding = ownerBindings.get(owner);
  if (!binding) throw new Error('jArchi object has no model session binding');
  const currentLease = getModelStoreWorkspaceLease(binding.store) ?? null;
  if (
    binding.store.getState().modelEpoch !== binding.modelEpoch
    || currentLease !== binding.workspaceLease
    || (
      binding.workspaceLease !== null
      && !isModelStoreWorkspaceLeaseOpen(binding.store, binding.workspaceLease)
    )
  ) {
    throw new Error('Stale jArchi model session binding');
  }
  return binding;
}

export function boundModelStore(owner: object): ModelStore {
  return requireBinding(owner).store;
}

export function assertSameModelBinding(
  owner: object,
  ...others: (object | undefined)[]
): void {
  const binding = requireBinding(owner);
  if (others.some((other) => {
    if (!other) return false;
    const candidate = requireBinding(other);
    return candidate.store !== binding.store
      || candidate.modelEpoch !== binding.modelEpoch
      || candidate.workspaceLease !== binding.workspaceLease;
  })) {
    throw new Error('Cannot mix jArchi wrappers from different model sessions');
  }
}

export function hasSameModelBinding(owner: object, other: object): boolean {
  const binding = requireBinding(owner);
  const candidate = requireBinding(other);
  return candidate.store === binding.store
    && candidate.modelEpoch === binding.modelEpoch
    && candidate.workspaceLease === binding.workspaceLease;
}
