import { useEffect, useMemo, useState } from 'react';
import { ARM_RELATIONSHIP_BITS, ARM_RELATIONSHIP_ORDER } from '../model/automatic-relationships';
import {
  ELEMENT_TYPES,
  RELATIONSHIP_TYPES,
  relationshipLabel,
  type ConceptType,
} from '../model/metamodel';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  SETTING_SECTIONS,
  isSettingAtDefault,
  type AppSettings,
  type SettingKey,
  type SettingRow,
} from '../settings/app-settings';
import { useSettingsStore } from '../settings/app-settings';

function formatValue(value: AppSettings[SettingKey], row: SettingRow): string {
  if (row.kind === 'boolean') return value ? 'On' : 'Off';
  if (row.kind === 'select') {
    return row.options.find((option) => option.value === value)?.label ?? String(value);
  }
  if (row.kind === 'relationship-mask') {
    const count = ARM_RELATIONSHIP_ORDER.filter(
      (type) => ((value as number) & ARM_RELATIONSHIP_BITS[type]) !== 0,
    ).length;
    return `${count} selected`;
  }
  return `${value}${row.unit ? ` ${row.unit}` : ''}`;
}

function SettingsRow({
  row,
  settings,
  setSetting,
  resetSetting,
}: {
  row: SettingRow;
  settings: AppSettings;
  setSetting: (key: SettingKey, value: unknown) => void;
  resetSetting: (key: SettingKey) => void;
}) {
  const value = settings[row.key];
  const atDefault = isSettingAtDefault(settings, row.key);

  return (
    <div className="settings-row">
      <div className="settings-copy">
        <div className="settings-label">{row.label}</div>
        <div className="settings-desc">{row.description}</div>
        <div className="settings-default">Default: {formatValue(DEFAULT_SETTINGS[row.key], row)}</div>
      </div>
      <div className="settings-control">
        {row.kind === 'boolean' ? (
          <label className="settings-check">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => setSetting(row.key, e.target.checked)}
            />
            <span>{value ? 'On' : 'Off'}</span>
          </label>
        ) : row.kind === 'select' ? (
          <select
            className="prop-input settings-select"
            value={value as number}
            onChange={(e) => setSetting(row.key, Number(e.target.value))}
          >
            {row.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : row.kind === 'relationship-mask' ? (
          <div
            className="settings-relationship-mask"
            role="group"
            aria-label={row.label}
            data-setting-mask={row.key}
          >
            {ARM_RELATIONSHIP_ORDER.map((type) => {
              const bit = ARM_RELATIONSHIP_BITS[type];
              const checked = ((value as number) & bit) !== 0;
              return (
                <label className="settings-mask-option" key={type}>
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`${relationshipLabel(type)} ${row.label.toLowerCase()}`}
                    onChange={(event) =>
                      setSetting(
                        row.key,
                        event.target.checked ? (value as number) | bit : (value as number) & ~bit,
                      )
                    }
                  />
                  <span>{relationshipLabel(type)}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="settings-number">
            <input
              type="range"
              min={row.min}
              max={row.max}
              step={row.step}
              value={value as number}
              onChange={(e) => setSetting(row.key, Number(e.target.value))}
            />
            <input
              type="number"
              min={row.min}
              max={row.max}
              step={row.step}
              value={value as number}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) setSetting(row.key, next);
              }}
            />
            {row.unit && <span className="settings-unit">{row.unit}</span>}
          </div>
        )}
      </div>
      <button
        className="tb-btn small settings-reset-row"
        disabled={atDefault}
        title={`Reset ${row.label}`}
        onClick={() => resetSetting(row.key)}
      >
        Reset
      </button>
    </div>
  );
}

const LEGEND_PREFERENCE_ROWS = [
  ...[...ELEMENT_TYPES]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((definition) => ({
      type: definition.type as ConceptType,
      label: definition.label,
      color: definition.fill,
    })),
  ...[...RELATIONSHIP_TYPES]
    .map((definition) => ({
      type: definition.type as ConceptType,
      label: `${relationshipLabel(definition.type)} relation`,
      color: undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

type LegendPreferenceRow = (typeof LEGEND_PREFERENCE_ROWS)[number];

function LegendCustomPreferenceRow({
  row,
  settings,
  updateLabel,
  updateColor,
}: {
  row: LegendPreferenceRow;
  settings: AppSettings;
  updateLabel: (type: ConceptType, value: string) => void;
  updateColor: (type: ConceptType, value: string | undefined) => void;
}) {
  const committedLabel = settings.legendLabels[row.type] ?? '';
  const [labelDraft, setLabelDraft] = useState(committedLabel);
  useEffect(() => setLabelDraft(committedLabel), [committedLabel]);
  const hasLabel = Boolean(committedLabel);
  const hasColor = Boolean(settings.legendUserColors[row.type]);
  const commitLabel = () => updateLabel(row.type, labelDraft);
  return (
    <div className="settings-legend-row">
      <span className="settings-legend-name">{row.label}</span>
      <input
        className="prop-input"
        aria-label={`${row.label} legend label`}
        value={labelDraft}
        placeholder={row.label}
        onChange={(event) => setLabelDraft(event.target.value)}
        onBlur={commitLabel}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitLabel();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setLabelDraft(committedLabel);
          }
        }}
      />
      {row.color ? (
        <input
          type="color"
          aria-label={`${row.label} legend user color`}
          value={settings.legendUserColors[row.type] ?? row.color}
          onChange={(event) => updateColor(row.type, event.target.value)}
        />
      ) : <span className="settings-legend-na">—</span>}
      <button
        className="tb-btn small"
        aria-label={`Reset ${row.label} legend preferences`}
        disabled={!hasLabel && !hasColor && !labelDraft}
        onClick={() => {
          setLabelDraft('');
          updateLabel(row.type, '');
          updateColor(row.type, undefined);
        }}
      >
        Reset
      </button>
    </div>
  );
}

function LegendCustomPreferences({
  settings,
  setSetting,
}: {
  settings: AppSettings;
  setSetting: (key: SettingKey, value: unknown) => void;
}) {
  const updateLabel = (type: ConceptType, value: string) => {
    const next = { ...settings.legendLabels };
    if (value.trim()) next[type] = value;
    else delete next[type];
    setSetting('legendLabels', next);
  };
  const updateColor = (type: ConceptType, value: string | undefined) => {
    const next = { ...settings.legendUserColors };
    if (value) next[type] = value;
    else delete next[type];
    setSetting('legendUserColors', next);
  };
  return (
    <details className="settings-legend-custom">
      <summary>Custom labels and user colours</summary>
      <div className="settings-legend-head" aria-hidden="true">
        <span>Concept</span><span>Legend label</span><span>User colour</span><span />
      </div>
      <div className="settings-legend-grid">
        {LEGEND_PREFERENCE_ROWS.map((row) => (
          <LegendCustomPreferenceRow
            key={row.type}
            row={row}
            settings={settings}
            updateLabel={updateLabel}
            updateColor={updateColor}
          />
        ))}
      </div>
    </details>
  );
}

export function SettingsPanel() {
  const [query, setQuery] = useState('');
  const settings = useSettingsStore((s) => s.settings);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const resetSetting = useSettingsStore((s) => s.resetSetting);
  const resetAll = useSettingsStore((s) => s.resetAll);
  const changedCount = SETTING_KEYS.filter((key) => !isSettingAtDefault(settings, key)).length;
  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTING_SECTIONS;
    return SETTING_SECTIONS.map((section) => ({
      ...section,
      rows: section.rows.filter((row) =>
        [section.title, section.description, row.label, row.description, row.key]
          .join(' ')
          .toLowerCase()
          .includes(q),
      ),
    })).filter((section) => section.rows.length > 0);
  }, [query]);

  return (
    <div className="settings-panel">
      <div className="settings-head">
        <div>
          <div className="settings-title">Settings</div>
          <div className="settings-summary">{changedCount} changed</div>
        </div>
        <button className="tb-btn small" disabled={changedCount === 0} onClick={resetAll}>
          Reset all
        </button>
      </div>
      <div className="settings-filter">
        <input
          className="prop-input"
          value={query}
          placeholder="Search settings"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="settings-scroll">
        {visibleSections.length === 0 && <div className="empty-hint">No settings match.</div>}
        {visibleSections.map((section) => (
          <section className="settings-section" key={section.id}>
            <div className="settings-section-head">
              <div className="settings-section-title">{section.title}</div>
              <div className="settings-section-desc">{section.description}</div>
            </div>
            {section.rows.map((row) => (
              <SettingsRow
                key={row.key}
                row={row}
                settings={settings}
                setSetting={setSetting}
                resetSetting={resetSetting}
              />
            ))}
            {section.id === 'legends' && (
              <LegendCustomPreferences settings={settings} setSetting={setSetting} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
