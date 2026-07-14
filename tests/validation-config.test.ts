import { describe, expect, it } from 'vitest';
import { addElement, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import {
  DEFAULT_VALIDATION_CONFIG,
  VALIDATION_RULES,
  validateModel,
} from '../src/model/validation';
import {
  loadValidatorSettings,
  persistValidatorSettings,
} from '../src/settings/validator-settings';
import { memoryKeyValueStore } from '../src/persistence/keyval';

describe('validator configuration', () => {
  it('exposes exactly eight Desktop Hammer rules with fixed severities', () => {
    expect(VALIDATION_RULES).toHaveLength(8);
    expect(VALIDATION_RULES.map((rule) => [rule.id, rule.severity])).toEqual([
      ['invalid-relationship', 'error'],
      ['unused-element', 'warning'],
      ['unused-relationship', 'warning'],
      ['empty-view', 'advice'],
      ['viewpoint', 'warning'],
      ['nested-elements', 'advice'],
      ['duplicate-name', 'warning'],
      ['junction', 'error'],
    ]);
    expect(Object.values(DEFAULT_VALIDATION_CONFIG.enabled).every(Boolean)).toBe(true);
  });

  it('disables individual Hammer rules without disabling integrity checks', () => {
    const store = createModelStore({ model: createEmptyModel('Config') });
    addElement('BusinessActor', 'Unused', undefined, store);
    const issues = validateModel(store.getState().model!, {
      ...DEFAULT_VALIDATION_CONFIG,
      enabled: { ...DEFAULT_VALIDATION_CONFIG.enabled, 'unused-element': false },
    });
    expect(issues.some((issue) => issue.rule === 'unused-element')).toBe(false);
  });

  it('round-trips a versioned IndexedDB record and recovers defaults', async () => {
    const storage = memoryKeyValueStore();
    const value = {
      ...DEFAULT_VALIDATION_CONFIG,
      enabled: { ...DEFAULT_VALIDATION_CONFIG.enabled, 'empty-view': false },
    };
    await persistValidatorSettings(value, storage);
    await expect(loadValidatorSettings(storage)).resolves.toEqual(value);
    await storage.set('archi-online.validator-settings.v1', { enabled: { 'empty-view': 'no' } });
    await expect(loadValidatorSettings(storage)).resolves.toEqual(DEFAULT_VALIDATION_CONFIG);
  });
});
