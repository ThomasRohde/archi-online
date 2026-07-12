import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  defaultElementSize,
  defaultGroupSize,
  defaultNoteSize,
  defaultTextStyle,
  defaultViewReferenceSize,
  loadSettings,
  normalizeSettings,
  persistSettings,
  resetAllSettings,
  resetSetting,
  updateSetting,
  type AppSettings,
} from '../src/settings/app-settings';
import { memoryKeyValueStore } from '../src/persistence/keyval';

describe('app settings', () => {
  it('loads defaults when no settings are stored', async () => {
    await expect(loadSettings(memoryKeyValueStore())).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('defaults the Desktop documentation note preference off and persists booleans', async () => {
    const defaults = DEFAULT_SETTINGS as typeof DEFAULT_SETTINGS & {
      addDocumentationNoteOnRelationChange?: boolean;
    };
    expect(defaults.addDocumentationNoteOnRelationChange).toBe(false);

    const loaded = await loadSettings(memoryKeyValueStore([[
      SETTINGS_STORAGE_KEY,
      { addDocumentationNoteOnRelationChange: true },
    ]]));
    expect((loaded as typeof loaded & {
      addDocumentationNoteOnRelationChange?: boolean;
    }).addDocumentationNoteOnRelationChange).toBe(true);
  });

  it('defaults new text style to center alignment and center position', () => {
    expect(defaultTextStyle(DEFAULT_SETTINGS)).toEqual({
      textAlignment: 2,
      textPosition: 1,
    });
  });

  it('loads valid persisted settings', async () => {
    const saved = {
      ...DEFAULT_SETTINGS,
      snapToGrid: false,
      gridSize: 24,
      maxZoom: 6,
      defaultTextAlignment: 1,
      defaultTextPosition: 2,
    };

    await expect(loadSettings(memoryKeyValueStore([[SETTINGS_STORAGE_KEY, saved]]))).resolves.toEqual(
      saved,
    );
  });

  it('merges partial persisted settings with defaults', async () => {
    await expect(
      loadSettings(memoryKeyValueStore([[SETTINGS_STORAGE_KEY, { gridSize: 18 }]])),
    ).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      gridSize: 18,
    });
  });

  it('falls back to defaults for unreadable settings', async () => {
    await expect(loadSettings(memoryKeyValueStore([[SETTINGS_STORAGE_KEY, '{broken']]))).resolves.toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('clamps numeric settings and rejects invalid value types', async () => {
    const loaded = await loadSettings(
      memoryKeyValueStore([
        [
          SETTINGS_STORAGE_KEY,
          {
            snapToGrid: 'yes',
            defaultTextAlignment: 3,
            defaultTextPosition: 'center',
          gridSize: 0,
          maxZoom: 99,
            wheelZoomFactor: 1,
            fitPadding: -10,
          },
        ],
      ]),
    );

    expect(loaded.snapToGrid).toBe(DEFAULT_SETTINGS.snapToGrid);
    expect(loaded.defaultTextAlignment).toBe(DEFAULT_SETTINGS.defaultTextAlignment);
    expect(loaded.defaultTextPosition).toBe(DEFAULT_SETTINGS.defaultTextPosition);
    expect(loaded.gridSize).toBe(1);
    expect(loaded.maxZoom).toBe(10);
    expect(loaded.wheelZoomFactor).toBe(1.01);
    expect(loaded.fitPadding).toBe(0);
  });

  it('ignores unknown persisted fields', () => {
    const loaded = normalizeSettings({ gridSize: 20, unknownSetting: 123 });

    expect(loaded.gridSize).toBe(20);
    expect('unknownSetting' in loaded).toBe(false);
  });

  it('persists normalized settings', async () => {
    const s = memoryKeyValueStore();

    await persistSettings({ ...DEFAULT_SETTINGS, gridSize: 22 }, s);

    expect(s.data.get(SETTINGS_STORAGE_KEY)).toEqual({
      ...DEFAULT_SETTINGS,
      gridSize: 22,
    });
  });

  it('resets one setting', () => {
    const edited = updateSetting(DEFAULT_SETTINGS, 'gridSize', 36);

    expect(resetSetting(edited, 'gridSize')).toEqual(DEFAULT_SETTINGS);
  });

  it('resets all settings', () => {
    const reset = resetAllSettings();

    expect(reset).toEqual(DEFAULT_SETTINGS);
    expect(reset).not.toBe(DEFAULT_SETTINGS);
  });

  it('derives new object sizes from settings', () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      elementWidth: 160,
      elementHeight: 70,
      junctionSize: 18,
      noteWidth: 210,
      noteHeight: 90,
      groupWidth: 480,
      groupHeight: 180,
      viewReferenceWidth: 240,
      viewReferenceHeight: 160,
      defaultTextAlignment: 4,
      defaultTextPosition: 0,
    };

    expect(defaultElementSize('BusinessActor', settings)).toEqual({ width: 160, height: 70 });
    expect(defaultElementSize('Junction', settings)).toEqual({ width: 18, height: 18 });
    expect(defaultNoteSize(settings)).toEqual({ width: 210, height: 90 });
    expect(defaultGroupSize(settings)).toEqual({ width: 480, height: 180 });
    expect(defaultViewReferenceSize(settings)).toEqual({ width: 240, height: 160 });
    expect(defaultTextStyle(settings)).toEqual({ textAlignment: 4, textPosition: 0 });
  });
});
