import { describe, expect, it } from 'vitest';
import { memoryKeyValueStore } from '../src/persistence/keyval';
import {
  DEFAULT_ANALYSIS_PREFERENCES,
  loadAnalysisPreferences,
  normalizeAnalysisPreferences,
  persistAnalysisPreferences,
} from '../src/settings/analysis-preferences';

describe('analysis preferences', () => {
  it('normalizes persisted controls and tolerates storage failures', async () => {
    expect(normalizeAnalysisPreferences({
      version: 99,
      depth: 100,
      direction: 'sideways',
      viewpointId: 42,
      elementTypes: ['BusinessActor', 'Nope'],
      relationshipTypes: ['FlowRelationship', 'Nope'],
    })).toEqual({
      ...DEFAULT_ANALYSIS_PREFERENCES,
      depth: 6,
      elementTypes: ['BusinessActor'],
      relationshipTypes: ['FlowRelationship'],
    });

    const failing = {
      async get() { throw new Error('unavailable'); },
      async set() { throw new Error('unavailable'); },
      async del() { throw new Error('unavailable'); },
    };
    await expect(loadAnalysisPreferences(failing)).resolves.toEqual(DEFAULT_ANALYSIS_PREFERENCES);
  });

  it('round-trips a versioned preference record', async () => {
    const storage = memoryKeyValueStore();
    const value = normalizeAnalysisPreferences({ depth: 3, direction: 'incoming', pinned: true });
    await persistAnalysisPreferences(value, storage);
    await expect(loadAnalysisPreferences(storage)).resolves.toEqual(value);
  });
});
