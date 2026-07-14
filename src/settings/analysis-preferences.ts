import { create } from 'zustand';
import {
  isElementType,
  isRelationshipType,
  type ElementType,
  type RelationshipType,
} from '../model/metamodel';
import type { AnalysisDirection } from '../model/analysis-graph';
import {
  defaultKeyValueStore,
  type AsyncKeyValueStore,
} from '../persistence/keyval';

export const ANALYSIS_PREFERENCES_KEY = 'archi-online.analysis-preferences.v1';

export interface AnalysisPreferences {
  version: 1;
  depth: number;
  direction: AnalysisDirection;
  viewpointId: string;
  elementTypes: ElementType[];
  relationshipTypes: RelationshipType[];
  pinned: boolean;
}

export const DEFAULT_ANALYSIS_PREFERENCES: AnalysisPreferences = {
  version: 1,
  depth: 1,
  direction: 'both',
  viewpointId: '',
  elementTypes: [],
  relationshipTypes: [],
  pinned: false,
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeAnalysisPreferences(value: unknown): AnalysisPreferences {
  const source = record(value);
  const depth = typeof source.depth === 'number' && Number.isFinite(source.depth)
    ? Math.max(1, Math.min(6, Math.floor(source.depth)))
    : DEFAULT_ANALYSIS_PREFERENCES.depth;
  const direction = source.direction === 'incoming'
    || source.direction === 'outgoing'
    || source.direction === 'both'
    ? source.direction
    : DEFAULT_ANALYSIS_PREFERENCES.direction;
  return {
    version: 1,
    depth,
    direction,
    viewpointId: typeof source.viewpointId === 'string' ? source.viewpointId : '',
    elementTypes: Array.isArray(source.elementTypes)
      ? [...new Set(source.elementTypes.filter(
          (type): type is ElementType => typeof type === 'string' && isElementType(type),
        ))]
      : [],
    relationshipTypes: Array.isArray(source.relationshipTypes)
      ? [...new Set(source.relationshipTypes.filter(
          (type): type is RelationshipType => typeof type === 'string' && isRelationshipType(type),
        ))]
      : [],
    pinned: typeof source.pinned === 'boolean' ? source.pinned : false,
  };
}

export async function loadAnalysisPreferences(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<AnalysisPreferences> {
  try {
    return normalizeAnalysisPreferences(await storage.get(ANALYSIS_PREFERENCES_KEY));
  } catch {
    return { ...DEFAULT_ANALYSIS_PREFERENCES };
  }
}

export async function persistAnalysisPreferences(
  value: AnalysisPreferences,
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  try {
    await storage.set(ANALYSIS_PREFERENCES_KEY, normalizeAnalysisPreferences(value));
  } catch {
    /* Preferences must never block model editing. */
  }
}

interface AnalysisPreferencesState {
  preferences: AnalysisPreferences;
  setPreferences(value: Partial<AnalysisPreferences>): void;
}

export const useAnalysisPreferences = create<AnalysisPreferencesState>((set) => ({
  preferences: { ...DEFAULT_ANALYSIS_PREFERENCES },
  setPreferences: (value) => set((state) => {
    const preferences = normalizeAnalysisPreferences({ ...state.preferences, ...value });
    void persistAnalysisPreferences(preferences);
    return { preferences };
  }),
}));

export async function hydrateAnalysisPreferences(): Promise<void> {
  useAnalysisPreferences.setState({ preferences: await loadAnalysisPreferences() });
}
