import { assetDataUrl } from '../model/assets';
import { importModelAsset } from '../model/ops';
import type { ModelAsset } from '../model/types';
import { useModelStoreApi, useStore, useWorkspaceStore } from './store-hooks';

interface GalleryEntry {
  sessionId: string;
  modelName: string;
  asset: ModelAsset;
}

export function ImageGallery({
  selectedPath,
  onSelect,
}: {
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}) {
  const modelStore = useModelStoreApi();
  const activeModel = useStore((state) => state.model);
  const sessions = useWorkspaceStore((state) => state.sessions);
  const entries: GalleryEntry[] = [];
  const seenModels = new Set<object>();
  if (activeModel) {
    seenModels.add(activeModel);
    for (const asset of Object.values(activeModel.assets)) {
      entries.push({ sessionId: 'active', modelName: activeModel.info.name, asset });
    }
  }
  for (const [sessionId, session] of Object.entries(sessions)) {
    const model = session.store.getState().model;
    if (!model || seenModels.has(model)) continue;
    seenModels.add(model);
    for (const asset of Object.values(model.assets)) {
      entries.push({ sessionId, modelName: model.info.name, asset });
    }
  }

  const choose = async (entry: GalleryEntry) => {
    const path = await importModelAsset(
      entry.asset.bytes,
      entry.asset.path,
      entry.asset.mediaType,
      modelStore,
    );
    onSelect(path);
  };

  const importFile = async (file: File) => {
    const path = await importModelAsset(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      file.type || undefined,
      modelStore,
    );
    onSelect(path);
  };

  return (
    <div className="image-gallery">
      <label className="tb-btn image-import-btn">
        Import image…
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.tif,.tiff,.bmp,.ico"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </label>
      <div className="image-gallery-grid">
        {entries.map((entry) => (
          <button
            key={`${entry.sessionId}:${entry.asset.path}`}
            className={`image-gallery-item${selectedPath === entry.asset.path ? ' selected' : ''}`}
            data-image-session-id={entry.sessionId}
            data-image-path={entry.asset.path}
            title={`${entry.modelName} — ${entry.asset.path}`}
            onClick={() => void choose(entry)}
          >
            <img src={assetDataUrl(entry.asset)} alt="" />
            <span>{entry.modelName}</span>
          </button>
        ))}
      </div>
      {entries.length === 0 && <div className="empty-hint">No images in open models.</div>}
    </div>
  );
}
