import { useEffect, useState } from 'react';
import { newId } from '../model/id';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from '../model/metamodel';
import { profileUsageCount, replaceProfiles } from '../model/ops';
import type { ConceptType, ModelAsset, ProfileDefinition } from '../model/types';
import { useModelStoreApi, useStore } from './store-hooks';
import { assetDataUrl, createModelAsset, imageExtension } from '../model/assets';
import { ImageGallery } from './ImageGallery';

export function SpecializationsManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const modelStore = useModelStoreApi();
  const model = useStore((state) => state.model);
  const [profiles, setProfiles] = useState<ProfileDefinition[]>([]);
  const [stagedAssets, setStagedAssets] = useState<Record<string, ModelAsset>>({});
  const [imageEditorId, setImageEditorId] = useState<string>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !model) return;
    setProfiles(Object.values(model.profiles).map((profile) => ({ ...profile })));
    setStagedAssets({});
    setImageEditorId(undefined);
    setError('');
  }, [model, open]);

  if (!open || !model) return null;

  const update = (id: string, patch: Partial<ProfileDefinition>) => {
    setProfiles((current) => current.map((profile) =>
      profile.id === id ? { ...profile, ...patch } : profile,
    ));
  };

  const apply = () => {
    try {
      replaceProfiles(profiles, modelStore, Object.values(stagedAssets));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const stageAsset = async (
    bytes: Uint8Array,
    fileName: string,
    mediaType?: string,
  ): Promise<string> => {
    const extension = imageExtension(fileName);
    const path = `images/_${newId().slice(3, 25)}.${extension}`;
    const asset = await createModelAsset(path, bytes, mediaType);
    const duplicate = [
      ...Object.values(model.assets),
      ...Object.values(stagedAssets),
    ].find((candidate) => candidate.sha256 === asset.sha256);
    if (duplicate) return duplicate.path;
    setStagedAssets((current) => ({ ...current, [asset.path]: asset }));
    return asset.path;
  };

  return (
    <div className="modal-backdrop specializations-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="specializations-manager"
        role="dialog"
        aria-modal="true"
        aria-label="Specializations Manager"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="app-dialog-kicker">Model</div>
            <h2>Specializations Manager</h2>
          </div>
          <button className="tb-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="specializations-table">
          <div className="specializations-head">
            <span>Name</span><span>Base type</span><span>Instances</span><span>Image</span><span />
          </div>
          {profiles.map((profile) => {
            const asset = profile.imagePath
              ? (stagedAssets[profile.imagePath] ?? model.assets[profile.imagePath])
              : undefined;
            return <div className="specializations-row" key={profile.id}>
              <input
                className="prop-input specialization-name"
                data-profile-id={profile.id}
                value={profile.name}
                onChange={(event) => update(profile.id, { name: event.target.value })}
              />
              <select
                value={profile.conceptType}
                onChange={(event) => update(profile.id, {
                  conceptType: event.target.value as ConceptType,
                })}
              >
                <optgroup label="Elements">
                  {ELEMENT_TYPES.map((definition) => (
                    <option key={definition.type} value={definition.type}>{definition.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Relationships">
                  {RELATIONSHIP_TYPES.map((definition) => (
                    <option key={definition.type} value={definition.type}>{definition.label}</option>
                  ))}
                </optgroup>
              </select>
              <span className="specialization-count">{profileUsageCount(model, profile.id)}</span>
              <div className="specialization-image-controls">
                <button
                  className="specialization-image-preview"
                  title={profile.imagePath ?? 'Choose image'}
                  aria-label={`Choose image for ${profile.name}`}
                  onClick={() => setImageEditorId((current) => current === profile.id
                    ? undefined
                    : profile.id)}
                >
                  {asset ? <img src={assetDataUrl(asset)} alt="" /> : 'Choose…'}
                </button>
                {profile.imagePath && <button
                  className="tb-btn small"
                  aria-label={`Remove image from ${profile.name}`}
                  title="Remove image"
                  onClick={() => update(profile.id, { imagePath: undefined })}
                >×</button>}
              </div>
              <button
                className="tb-btn small"
                title="Delete specialization"
                onClick={() => setProfiles((current) => current.filter((item) => item.id !== profile.id))}
              >×</button>
            </div>;
          })}
        </div>
        {imageEditorId && profiles.some((profile) => profile.id === imageEditorId) && <div
          className="specialization-image-editor"
          aria-label="Specialization image chooser"
        >
          <ImageGallery
            selectedPath={profiles.find((profile) => profile.id === imageEditorId)?.imagePath}
            onSelect={(path) => update(imageEditorId, { imagePath: path })}
            importAsset={stageAsset}
          />
        </div>}
        <button
          className="tb-btn add-prop"
          onClick={() => setProfiles((current) => [...current, {
            id: newId(),
            name: 'New Specialization',
            conceptType: 'BusinessActor',
            specialization: true,
          }])}
        >+ Add specialization</button>
        {error && <div className="specializations-error" role="alert">{error}</div>}
        <footer>
          <button className="app-dialog-btn" onClick={onClose}>Cancel</button>
          <button className="app-dialog-btn primary" onClick={apply}>Apply</button>
        </footer>
      </section>
    </div>
  );
}
