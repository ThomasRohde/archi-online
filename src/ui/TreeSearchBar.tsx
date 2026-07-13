import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, type ConceptType } from '../model/metamodel';
import type {
  CompiledTreeSearch,
  TreeSearchCatalog,
  TreeSearchCriteria,
} from './tree-filter';
import { treeSearchProfileKey } from './tree-filter';

function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

const TYPE_LABELS = new Map<ConceptType, string>([
  ...ELEMENT_TYPES.map((definition) => [definition.type, definition.label] as const),
  ...RELATIONSHIP_TYPES.map((definition) => [definition.type, definition.label] as const),
]);

export function TreeSearchBar({
  criteria,
  setCriteria,
  compiled,
  catalog,
  matchCount,
  setPreference,
  onReset,
  onRefresh,
  filtering,
  onExpandAll,
  onCollapseAll,
}: {
  criteria: TreeSearchCriteria;
  setCriteria: Dispatch<SetStateAction<TreeSearchCriteria>>;
  compiled: CompiledTreeSearch;
  catalog: TreeSearchCatalog;
  matchCount: number;
  setPreference: (
    key: 'searchName' | 'searchDocumentation' | 'searchPropertyValues' | 'includeViews'
      | 'showAllFolders' | 'matchCase' | 'useRegex',
    value: boolean,
  ) => void;
  onReset: () => void;
  onRefresh: () => void;
  filtering: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const selectedProfiles = new Set(criteria.specializations.map(treeSearchProfileKey));
  const setMultiSelect = (event: ChangeEvent<HTMLSelectElement>, kind: 'keys' | 'profiles') => {
    const selected = [...event.currentTarget.selectedOptions].map((option) => option.value);
    if (kind === 'keys') {
      setCriteria((current) => ({ ...current, propertyKeys: selected }));
      return;
    }
    const byValue = new Map(catalog.specializations.map((profile) => [treeSearchProfileKey(profile), profile]));
    setCriteria((current) => ({
      ...current,
      specializations: selected.flatMap((value) => {
        const profile = byValue.get(value);
        return profile ? [profile] : [];
      }),
    }));
  };

  return (
    <div className="tree-filter" role="search" aria-label="Model tree search">
      <input
        className="tree-filter-input"
        type="search"
        aria-label="Search models"
        aria-invalid={!compiled.valid}
        aria-describedby={!compiled.valid ? 'tree-search-error' : 'tree-search-status'}
        placeholder="Search models (Ctrl+F)"
        value={criteria.query}
        onChange={(event) => setCriteria((current) => ({ ...current, query: event.target.value }))}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setCriteria((current) => ({ ...current, query: '' }));
            event.currentTarget.blur();
          }
        }}
      />
      <details className="tree-search-options">
        <summary
          className="tree-filter-btn tree-search-options-button"
          aria-label="Search options"
          title="Search options"
        >
          <span aria-hidden="true">⌕</span>
        </summary>
        <div className="tree-search-menu" role="group" aria-label="Search criteria">
          <fieldset className="tree-search-fields">
            <legend>Text fields</legend>
            {([
              ['searchName', 'Name'],
              ['searchDocumentation', 'Documentation'],
              ['searchPropertyValues', 'Property Value'],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={criteria[key]}
                  onChange={(event) => setPreference(key, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <label className="tree-search-select-label">
            <span>Property keys</span>
            <select
              multiple
              size={Math.min(4, Math.max(2, catalog.propertyKeys.length))}
              aria-label="Property keys"
              value={[...criteria.propertyKeys]}
              onChange={(event) => setMultiSelect(event, 'keys')}
            >
              {catalog.propertyKeys.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </label>

          <label className="tree-search-select-label">
            <span>Specializations</span>
            <select
              multiple
              size={Math.min(4, Math.max(2, catalog.specializations.length))}
              aria-label="Specializations"
              value={[...selectedProfiles]}
              onChange={(event) => setMultiSelect(event, 'profiles')}
            >
              {catalog.specializations.map((profile) => (
                <option key={treeSearchProfileKey(profile)} value={treeSearchProfileKey(profile)}>
                  {profile.name} — {TYPE_LABELS.get(profile.conceptType) ?? profile.conceptType}
                </option>
              ))}
            </select>
          </label>

          <details className="tree-search-types">
            <summary>Concept types ({criteria.conceptTypes.length})</summary>
            <div className="tree-search-type-list">
              {[...ELEMENT_TYPES, ...RELATIONSHIP_TYPES].map((definition) => (
                <label key={definition.type}>
                  <input
                    type="checkbox"
                    aria-label={`${definition.label} type`}
                    checked={criteria.conceptTypes.includes(definition.type)}
                    onChange={() => setCriteria((current) => ({
                      ...current,
                      conceptTypes: toggleValue(current.conceptTypes, definition.type),
                    }))}
                  />
                  <span>{definition.label}</span>
                </label>
              ))}
            </div>
          </details>

          <fieldset className="tree-search-fields tree-search-modifiers">
            <legend>Options</legend>
            {([
              ['includeViews', 'Views'],
              ['showAllFolders', 'Show All Folders'],
              ['matchCase', 'Match Case'],
              ['useRegex', 'Regular Expression'],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={criteria[key]}
                  onChange={(event) => setPreference(key, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <div className="tree-search-menu-actions">
            <button className="tb-btn small" aria-label="Reset search" onClick={onReset}>Reset</button>
            <button
              className="tb-btn small"
              aria-label="Refresh search"
              disabled={!filtering}
              onClick={onRefresh}
            >Refresh</button>
          </div>
        </div>
      </details>
      <button
        className="tree-filter-btn"
        aria-label="Expand all"
        title={filtering ? 'Expand All (unavailable while filtering)' : 'Expand All'}
        disabled={filtering}
        onClick={onExpandAll}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 3.5 L8 7.5 L12 3.5 M4 8.5 L8 12.5 L12 8.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <button
        className="tree-filter-btn"
        aria-label="Collapse all"
        title={filtering ? 'Collapse All (unavailable while filtering)' : 'Collapse All'}
        disabled={filtering}
        onClick={onCollapseAll}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 7.5 L8 3.5 L12 7.5 M4 12.5 L8 8.5 L12 12.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {criteria.query.length > 0 && (
        <button
          className="tree-filter-clear"
          aria-label="Clear search text"
          title="Clear search text"
          onClick={() => setCriteria((current) => ({ ...current, query: '' }))}
        >✕</button>
      )}
      {!compiled.valid && (
        <div id="tree-search-error" className="tree-search-error" role="alert">
          {compiled.error}
        </div>
      )}
      <div id="tree-search-status" className="tree-search-status" role="status" aria-live="polite">
        {filtering ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : 'Search inactive'}
      </div>
    </div>
  );
}
