import { create } from 'zustand';
import {
  isElementType,
  isRelationshipType,
  type ConceptType,
  type ElementType,
} from '../model/metamodel';
import {
  ARM_ALL_RELATIONSHIPS_MASK,
  ARM_DEFAULT_NEW_RELATIONSHIPS_MASK,
} from '../model/automatic-relationships';
export {
  ARM_ALL_RELATIONSHIPS_MASK,
  ARM_DEFAULT_NEW_RELATIONSHIPS_MASK,
  ARM_RELATIONSHIP_BITS,
  ARM_RELATIONSHIP_ORDER,
} from '../model/automatic-relationships';
import { defaultKeyValueStore, type AsyncKeyValueStore } from '../persistence/keyval';

export const SETTINGS_STORAGE_KEY = 'archi-online.settings.v1';

export interface AppSettings {
  addDocumentationNoteOnRelationChange: boolean;
  treeSearchName: boolean;
  treeSearchDocumentation: boolean;
  treeSearchPropertyValue: boolean;
  treeSearchViews: boolean;
  treeSearchShowAllFolders: boolean;
  treeSearchMatchCase: boolean;
  treeSearchRegex: boolean;
  snapToGrid: boolean;
  gridSize: number;
  defaultTextAlignment: TextAlignment;
  defaultTextPosition: TextPosition;
  elementWidth: number;
  elementHeight: number;
  junctionSize: number;
  noteWidth: number;
  noteHeight: number;
  groupWidth: number;
  groupHeight: number;
  viewReferenceWidth: number;
  viewReferenceHeight: number;
  dropOffset: number;
  pasteOffset: number;
  minNodeSize: number;
  moveDragThreshold: number;
  bendDragThreshold: number;
  minZoom: number;
  maxZoom: number;
  wheelZoomFactor: number;
  buttonZoomFactor: number;
  fitMaxZoom: number;
  fitPadding: number;
  alignmentAnchor: number;
  useNestedConnections: boolean;
  createRelationWhenAddingNewElementToContainer: boolean;
  createRelationWhenAddingModelTreeElementToContainer: boolean;
  createRelationWhenMovingElementToContainer: boolean;
  newRelationsTypes: number;
  newReverseRelationsTypes: number;
  hiddenRelationsTypes: number;
  /** Desktop defaults for newly created native legends. */
  legendRowsPerColumn: number;
  legendColorScheme: number;
  legendSortMethod: number;
  /** Browser-local overrides; Desktop stores these in preferences, never model files. */
  legendLabels: Partial<Record<ConceptType, string>>;
  legendUserColors: Partial<Record<ConceptType, string>>;
}

export type SettingKey = keyof AppSettings;
export type TextAlignment = 1 | 2 | 4;
export type TextPosition = 0 | 1 | 2;
export type AnchorMode = 'first' | 'last';

interface BaseSettingRow {
  key: SettingKey;
  label: string;
  description: string;
}

export interface BooleanSettingRow extends BaseSettingRow {
  kind: 'boolean';
}

export interface NumberSettingRow extends BaseSettingRow {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface SelectSettingRow extends BaseSettingRow {
  kind: 'select';
  options: readonly { value: number; label: string }[];
}

export interface RelationshipMaskSettingRow extends BaseSettingRow {
  kind: 'relationship-mask';
}

export type SettingRow =
  | BooleanSettingRow
  | NumberSettingRow
  | SelectSettingRow
  | RelationshipMaskSettingRow;

export interface SettingSection {
  id: string;
  title: string;
  description: string;
  rows: readonly SettingRow[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  addDocumentationNoteOnRelationChange: false,
  treeSearchName: true,
  treeSearchDocumentation: false,
  treeSearchPropertyValue: false,
  treeSearchViews: false,
  treeSearchShowAllFolders: false,
  treeSearchMatchCase: false,
  treeSearchRegex: false,
  snapToGrid: true,
  gridSize: 12,
  defaultTextAlignment: 2,
  defaultTextPosition: 1,
  elementWidth: 120,
  elementHeight: 55,
  junctionSize: 15,
  noteWidth: 185,
  noteHeight: 80,
  groupWidth: 400,
  groupHeight: 140,
  viewReferenceWidth: 200,
  viewReferenceHeight: 140,
  dropOffset: 16,
  pasteOffset: 16,
  minNodeSize: 20,
  moveDragThreshold: 4,
  bendDragThreshold: 5,
  minZoom: 0.1,
  maxZoom: 4,
  wheelZoomFactor: 1.1,
  buttonZoomFactor: 1.2,
  fitMaxZoom: 1.5,
  fitPadding: 24,
  alignmentAnchor: 1,
  useNestedConnections: true,
  createRelationWhenAddingNewElementToContainer: true,
  createRelationWhenAddingModelTreeElementToContainer: true,
  createRelationWhenMovingElementToContainer: true,
  newRelationsTypes: ARM_DEFAULT_NEW_RELATIONSHIPS_MASK,
  newReverseRelationsTypes: 0,
  hiddenRelationsTypes: ARM_ALL_RELATIONSHIPS_MASK,
  legendRowsPerColumn: 15,
  legendColorScheme: 1,
  legendSortMethod: 1,
  legendLabels: {},
  legendUserColors: {},
};

export const SETTING_SECTIONS: readonly SettingSection[] = [
  {
    id: 'general',
    title: 'General',
    description: 'General modeling behavior.',
    rows: [
      {
        key: 'addDocumentationNoteOnRelationChange',
        kind: 'boolean',
        label: "Add a note to a Relation's documentation field when changing type",
        description:
          "If a connected relation type is changed as a result of changing an Element's type, a note will be added to the Relation's documentation field.",
      },
    ],
  },
  {
    id: 'model-tree-search',
    title: 'Model tree search',
    description: 'Desktop-compatible defaults retained between browser sessions.',
    rows: [
      {
        key: 'treeSearchName',
        kind: 'boolean',
        label: 'Name',
        description: 'Search raw stored model-tree names.',
      },
      {
        key: 'treeSearchDocumentation',
        kind: 'boolean',
        label: 'Documentation',
        description: 'Search model-tree documentation fields.',
      },
      {
        key: 'treeSearchPropertyValue',
        kind: 'boolean',
        label: 'Property Value',
        description: 'Search property values, constrained by selected keys when present.',
      },
      {
        key: 'treeSearchViews',
        kind: 'boolean',
        label: 'Views',
        description: 'Include views in the type and specialization filter group.',
      },
      {
        key: 'treeSearchShowAllFolders',
        kind: 'boolean',
        label: 'Show All Folders',
        description: 'Keep every folder visible while search filtering is active.',
      },
      {
        key: 'treeSearchMatchCase',
        kind: 'boolean',
        label: 'Match Case',
        description: 'Use case-sensitive text matching.',
      },
      {
        key: 'treeSearchRegex',
        kind: 'boolean',
        label: 'Regular Expression',
        description: 'Interpret the query as a Unicode regular expression.',
      },
    ],
  },
  {
    id: 'automatic-relationships',
    title: 'Automatic relationships',
    description: 'Create and hide semantic relationships for visually nested elements.',
    rows: [
      {
        key: 'useNestedConnections',
        kind: 'boolean',
        label: 'Use nested connections',
        description: 'Represent configured connections by direct visual nesting.',
      },
      {
        key: 'createRelationWhenAddingNewElementToContainer',
        kind: 'boolean',
        label: 'Palette creation',
        description: 'Offer a relationship when creating an element inside another element.',
      },
      {
        key: 'createRelationWhenAddingModelTreeElementToContainer',
        kind: 'boolean',
        label: 'Model tree drop',
        description: 'Offer relationships when dropping model-tree elements into an element.',
      },
      {
        key: 'createRelationWhenMovingElementToContainer',
        kind: 'boolean',
        label: 'Canvas movement',
        description: 'Offer relationships when moving diagram elements into an element.',
      },
      {
        key: 'newRelationsTypes',
        kind: 'relationship-mask',
        label: 'Normal candidates',
        description: 'Relationship types offered from parent to child.',
      },
      {
        key: 'newReverseRelationsTypes',
        kind: 'relationship-mask',
        label: 'Reverse candidates',
        description: 'Relationship types offered from child to parent.',
      },
      {
        key: 'hiddenRelationsTypes',
        kind: 'relationship-mask',
        label: 'Hidden while nested',
        description: 'Relationship connections represented by direct nesting.',
      },
    ],
  },
  {
    id: 'legends',
    title: 'Legends',
    description: 'Desktop-compatible defaults for new live legends.',
    rows: [
      {
        key: 'legendRowsPerColumn',
        kind: 'number',
        label: 'Rows per column',
        description: 'Rows used when a new legend is created.',
        min: 1,
        max: 100,
        step: 1,
      },
      {
        key: 'legendColorScheme',
        kind: 'select',
        label: 'Colour scheme',
        description: 'Icon colours used when a new legend is created.',
        options: [
          { value: 0, label: 'None' },
          { value: 1, label: 'Core' },
          { value: 2, label: 'User' },
        ],
      },
      {
        key: 'legendSortMethod',
        kind: 'select',
        label: 'Sort',
        description: 'Entry ordering used when a new legend is created.',
        options: [
          { value: 0, label: 'Name' },
          { value: 1, label: 'Category' },
        ],
      },
    ],
  },
  {
    id: 'snapping',
    title: 'Canvas snapping',
    description: 'Grid behavior for placement and movement.',
    rows: [
      {
        key: 'snapToGrid',
        kind: 'boolean',
        label: 'Snap to grid',
        description: 'Align new and dragged objects to the grid by default.',
      },
      {
        key: 'gridSize',
        kind: 'number',
        label: 'Grid size',
        description: 'Spacing used for snapping and Shift+arrow nudging.',
        min: 1,
        max: 200,
        step: 1,
        unit: 'px',
      },
    ],
  },
  {
    id: 'objects',
    title: 'New object defaults',
    description: 'Text and bounds used when creating new diagram objects.',
    rows: [
      {
        key: 'defaultTextAlignment',
        kind: 'select',
        label: 'Text align',
        description: 'Horizontal text alignment for new diagram objects.',
        options: [
          { value: 1, label: 'Left' },
          { value: 2, label: 'Center' },
          { value: 4, label: 'Right' },
        ],
      },
      {
        key: 'defaultTextPosition',
        kind: 'select',
        label: 'Text position',
        description: 'Vertical text position for new diagram objects.',
        options: [
          { value: 0, label: 'Top' },
          { value: 1, label: 'Center' },
          { value: 2, label: 'Bottom' },
        ],
      },
      {
        key: 'elementWidth',
        kind: 'number',
        label: 'Element width',
        description: 'Width for new ArchiMate element nodes.',
        min: 20,
        max: 1000,
        step: 1,
        unit: 'px',
      },
      {
        key: 'elementHeight',
        kind: 'number',
        label: 'Element height',
        description: 'Height for new ArchiMate element nodes.',
        min: 15,
        max: 800,
        step: 1,
        unit: 'px',
      },
      {
        key: 'junctionSize',
        kind: 'number',
        label: 'Junction size',
        description: 'Width and height for new junction nodes.',
        min: 4,
        max: 80,
        step: 1,
        unit: 'px',
      },
      {
        key: 'noteWidth',
        kind: 'number',
        label: 'Note width',
        description: 'Width for new notes.',
        min: 40,
        max: 1000,
        step: 1,
        unit: 'px',
      },
      {
        key: 'noteHeight',
        kind: 'number',
        label: 'Note height',
        description: 'Height for new notes.',
        min: 30,
        max: 800,
        step: 1,
        unit: 'px',
      },
      {
        key: 'groupWidth',
        kind: 'number',
        label: 'Group width',
        description: 'Width for new groups.',
        min: 80,
        max: 2000,
        step: 1,
        unit: 'px',
      },
      {
        key: 'groupHeight',
        kind: 'number',
        label: 'Group height',
        description: 'Height for new groups.',
        min: 60,
        max: 1200,
        step: 1,
        unit: 'px',
      },
      {
        key: 'viewReferenceWidth',
        kind: 'number',
        label: 'View reference width',
        description: 'Width for dropped view references.',
        min: 40,
        max: 1200,
        step: 1,
        unit: 'px',
      },
      {
        key: 'viewReferenceHeight',
        kind: 'number',
        label: 'View reference height',
        description: 'Height for dropped view references.',
        min: 30,
        max: 900,
        step: 1,
        unit: 'px',
      },
    ],
  },
  {
    id: 'interaction',
    title: 'Canvas interaction',
    description: 'Pointer thresholds and offsets used while editing.',
    rows: [
      {
        key: 'dropOffset',
        kind: 'number',
        label: 'Drop offset',
        description: 'Offset between multiple items dropped at once.',
        min: 0,
        max: 200,
        step: 1,
        unit: 'px',
      },
      {
        key: 'pasteOffset',
        kind: 'number',
        label: 'Paste offset',
        description: 'Offset applied when pasting without a cursor target.',
        min: 0,
        max: 200,
        step: 1,
        unit: 'px',
      },
      {
        key: 'minNodeSize',
        kind: 'number',
        label: 'Minimum node size',
        description: 'Smallest width or height allowed when resizing.',
        min: 5,
        max: 200,
        step: 1,
        unit: 'px',
      },
      {
        key: 'moveDragThreshold',
        kind: 'number',
        label: 'Move threshold',
        description: 'Pointer distance before selection movement starts.',
        min: 0,
        max: 40,
        step: 0.5,
        unit: 'px',
      },
      {
        key: 'bendDragThreshold',
        kind: 'number',
        label: 'Bendpoint threshold',
        description: 'Pointer distance before creating a bendpoint.',
        min: 0,
        max: 40,
        step: 0.5,
        unit: 'px',
      },
    ],
  },
  {
    id: 'viewport',
    title: 'Viewport',
    description: 'Zoom limits and fit-to-window behavior.',
    rows: [
      {
        key: 'minZoom',
        kind: 'number',
        label: 'Minimum zoom',
        description: 'Lowest canvas zoom level.',
        min: 0.02,
        max: 1,
        step: 0.01,
      },
      {
        key: 'maxZoom',
        kind: 'number',
        label: 'Maximum zoom',
        description: 'Highest canvas zoom level.',
        min: 1,
        max: 10,
        step: 0.1,
      },
      {
        key: 'wheelZoomFactor',
        kind: 'number',
        label: 'Wheel zoom factor',
        description: 'Zoom multiplier for Ctrl+wheel gestures.',
        min: 1.01,
        max: 4,
        step: 0.01,
      },
      {
        key: 'buttonZoomFactor',
        kind: 'number',
        label: 'Button zoom factor',
        description: 'Zoom multiplier for toolbar buttons and shortcuts.',
        min: 1.01,
        max: 4,
        step: 0.01,
      },
      {
        key: 'fitMaxZoom',
        kind: 'number',
        label: 'Fit maximum zoom',
        description: 'Largest zoom level used by fit-to-window.',
        min: 0.1,
        max: 10,
        step: 0.1,
      },
      {
        key: 'fitPadding',
        kind: 'number',
        label: 'Fit padding',
        description: 'Visible margin around diagrams after fitting.',
        min: 0,
        max: 500,
        step: 1,
        unit: 'px',
      },
    ],
  },
  {
    id: 'alignment',
    title: 'Align & distribute',
    description: 'Reference element used by the Align and Match Size actions.',
    rows: [
      {
        key: 'alignmentAnchor',
        kind: 'select',
        label: 'Alignment anchor',
        description:
          'Which element Align and Match Size snap the rest of the selection to.',
        options: [
          { value: 0, label: 'First selected' },
          { value: 1, label: 'Last selected' },
        ],
      },
    ],
  },
];

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

const ROWS_BY_KEY = new Map<SettingKey, SettingRow>(
  SETTING_SECTIONS.flatMap((section) => section.rows.map((row) => [row.key, row] as const)),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function settingRow(key: SettingKey): SettingRow {
  const row = ROWS_BY_KEY.get(key);
  if (!row) throw new Error(`Missing setting metadata for ${key}`);
  return row;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLegendLabels(value: unknown): Partial<Record<ConceptType, string>> {
  if (!isRecord(value)) return {};
  const labels: Partial<Record<ConceptType, string>> = {};
  for (const [type, label] of Object.entries(value)) {
    if ((!isElementType(type) && !isRelationshipType(type)) || typeof label !== 'string') continue;
    const normalized = label.trim();
    if (normalized) labels[type] = normalized;
  }
  return labels;
}

function sanitizeLegendUserColors(value: unknown): Partial<Record<ConceptType, string>> {
  if (!isRecord(value)) return {};
  const colors: Partial<Record<ConceptType, string>> = {};
  for (const [type, color] of Object.entries(value)) {
    if (!isElementType(type) || typeof color !== 'string') continue;
    if (/^#[0-9a-f]{6}$/i.test(color)) colors[type] = color.toLowerCase();
  }
  return colors;
}

export function sanitizeSettingValue(key: SettingKey, value: unknown): AppSettings[SettingKey] {
  if (key === 'legendLabels') return sanitizeLegendLabels(value);
  if (key === 'legendUserColors') return sanitizeLegendUserColors(value);
  const row = settingRow(key);
  const fallback = DEFAULT_SETTINGS[key];
  if (row.kind === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (row.kind === 'relationship-mask') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(ARM_ALL_RELATIONSHIPS_MASK, Math.max(0, Math.trunc(value)));
  }
  if (row.kind === 'select') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return (row.options.some((option) => option.value === value) ? value : fallback) as AppSettings[SettingKey];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clamp(value, row.min, row.max);
}

export function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {};
  const next: AppSettings = {
    ...DEFAULT_SETTINGS,
    legendLabels: {},
    legendUserColors: {},
  };
  for (const key of SETTING_KEYS) {
    if (source[key] !== undefined) {
      (next as Record<SettingKey, AppSettings[SettingKey]>)[key] = sanitizeSettingValue(
        key,
        source[key],
      );
    }
  }
  return next;
}

export async function loadSettings(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<AppSettings> {
  try {
    const raw = await storage.get<unknown>(SETTINGS_STORAGE_KEY);
    return normalizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function persistSettings(
  settings: AppSettings,
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  try {
    await storage.set(SETTINGS_STORAGE_KEY, normalizeSettings(settings));
  } catch {
    /* IndexedDB failures should not block editing */
  }
}

export function updateSetting(
  settings: AppSettings,
  key: SettingKey,
  value: unknown,
): AppSettings {
  return {
    ...settings,
    [key]: sanitizeSettingValue(key, value),
  };
}

export function resetSetting(settings: AppSettings, key: SettingKey): AppSettings {
  return {
    ...settings,
    [key]: DEFAULT_SETTINGS[key],
  };
}

export function resetAllSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, legendLabels: {}, legendUserColors: {} };
}

export function isSettingAtDefault(settings: AppSettings, key: SettingKey): boolean {
  if (key === 'legendLabels' || key === 'legendUserColors') {
    const current = settings[key];
    const defaults = DEFAULT_SETTINGS[key];
    const currentEntries = Object.entries(current).sort(([a], [b]) => a.localeCompare(b));
    const defaultEntries = Object.entries(defaults).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(currentEntries) === JSON.stringify(defaultEntries);
  }
  return settings[key] === DEFAULT_SETTINGS[key];
}

export function defaultElementSize(
  type: ElementType,
  settings: AppSettings,
): { width: number; height: number } {
  if (type === 'Junction') {
    return { width: settings.junctionSize, height: settings.junctionSize };
  }
  return { width: settings.elementWidth, height: settings.elementHeight };
}

export function defaultNoteSize(settings: AppSettings): { width: number; height: number } {
  return { width: settings.noteWidth, height: settings.noteHeight };
}

export function defaultGroupSize(settings: AppSettings): { width: number; height: number } {
  return { width: settings.groupWidth, height: settings.groupHeight };
}

export function defaultViewReferenceSize(settings: AppSettings): {
  width: number;
  height: number;
} {
  return { width: settings.viewReferenceWidth, height: settings.viewReferenceHeight };
}

export function defaultTextStyle(settings: AppSettings): {
  textAlignment: TextAlignment;
  textPosition: TextPosition;
} {
  return {
    textAlignment: settings.defaultTextAlignment,
    textPosition: settings.defaultTextPosition,
  };
}

/** Reference element for Align / Match Size: the first or last selected node. */
export function alignmentAnchorMode(settings: AppSettings): AnchorMode {
  return settings.alignmentAnchor === 0 ? 'first' : 'last';
}

interface SettingsState {
  settings: AppSettings;
  setSetting(key: SettingKey, value: unknown): void;
  resetSetting(key: SettingKey): void;
  resetAll(): void;
}

function commit(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  void persistSettings(normalized);
  return normalized;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  setSetting: (key, value) =>
    set((state) => ({ settings: commit(updateSetting(state.settings, key, value)) })),
  resetSetting: (key) =>
    set((state) => ({ settings: commit(resetSetting(state.settings, key)) })),
  resetAll: () => set({ settings: commit(resetAllSettings()) }),
}));

export async function hydrateSettingsStore(): Promise<void> {
  useSettingsStore.setState({ settings: await loadSettings() });
}
