import { useMemo, useState } from 'react';
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
          </section>
        ))}
      </div>
    </div>
  );
}
