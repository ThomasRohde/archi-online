import { createModelAsset, imageExtension } from '../assets';
import { newId } from '../id';
import { getActiveModelStore, transact, type ModelStore } from '../store';

export async function importModelAsset(
  bytes: Uint8Array,
  fileName: string,
  mediaType?: string,
  store: ModelStore = getActiveModelStore(),
): Promise<string> {
  const extension = imageExtension(fileName);
  const provisionalPath = `images/_${newId().slice(3, 25)}.${extension}`;
  const asset = await createModelAsset(provisionalPath, bytes, mediaType);
  const existing = Object.values(store.getState().model?.assets ?? {})
    .find((candidate) => candidate.sha256 === asset.sha256);
  if (existing) return existing.path;
  transact('Import Image', (draft) => {
    const duplicate = Object.values(draft.assets).find(
      (candidate) => candidate.sha256 === asset.sha256,
    );
    if (!duplicate) draft.assets[asset.path] = asset;
  }, store);
  return Object.values(store.getState().model?.assets ?? {})
    .find((candidate) => candidate.sha256 === asset.sha256)?.path ?? asset.path;
}
