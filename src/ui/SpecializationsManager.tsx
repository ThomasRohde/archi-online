import { useEffect, useState } from 'react';
import { newId } from '../model/id';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from '../model/metamodel';
import { profileUsageCount, replaceProfiles } from '../model/ops';
import type { ConceptType, ProfileDefinition } from '../model/types';
import { useModelStoreApi, useStore } from './store-hooks';

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
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !model) return;
    setProfiles(Object.values(model.profiles).map((profile) => ({ ...profile })));
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
      replaceProfiles(profiles, modelStore);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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
          {profiles.map((profile) => (
            <div className="specializations-row" key={profile.id}>
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
              <div className="specialization-image-preview" title={profile.imagePath ?? 'No image'}>
                {profile.imagePath ? <img src={profile.imagePath} alt="" /> : '—'}
              </div>
              <button
                className="tb-btn small"
                title="Delete specialization"
                onClick={() => setProfiles((current) => current.filter((item) => item.id !== profile.id))}
              >×</button>
            </div>
          ))}
        </div>
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
