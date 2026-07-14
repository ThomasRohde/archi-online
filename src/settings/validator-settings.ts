import { create } from 'zustand';
import {
  DEFAULT_VALIDATION_CONFIG,
  VALIDATION_RULES,
  type ValidationConfig,
  type ValidationRuleId,
} from '../model/validation';
import { defaultKeyValueStore, type AsyncKeyValueStore } from '../persistence/keyval';

export const VALIDATOR_SETTINGS_KEY = 'archi-online.validator-settings.v1';

export function normalizeValidatorSettings(value: unknown): ValidationConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return structuredClone(DEFAULT_VALIDATION_CONFIG);
  }
  const enabled = (value as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'object' || enabled === null || Array.isArray(enabled)) {
    return structuredClone(DEFAULT_VALIDATION_CONFIG);
  }
  const source = enabled as Record<string, unknown>;
  if (Object.values(source).some((candidate) => typeof candidate !== 'boolean')) {
    return structuredClone(DEFAULT_VALIDATION_CONFIG);
  }
  return {
    version: 1,
    enabled: Object.fromEntries(VALIDATION_RULES.map((rule) => [
      rule.id,
      typeof source[rule.id] === 'boolean' ? source[rule.id] : true,
    ])) as Record<ValidationRuleId, boolean>,
  };
}

export async function loadValidatorSettings(
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<ValidationConfig> {
  try {
    return normalizeValidatorSettings(await storage.get(VALIDATOR_SETTINGS_KEY));
  } catch {
    return structuredClone(DEFAULT_VALIDATION_CONFIG);
  }
}

export async function persistValidatorSettings(
  value: ValidationConfig,
  storage: AsyncKeyValueStore = defaultKeyValueStore(),
): Promise<void> {
  try {
    await storage.set(VALIDATOR_SETTINGS_KEY, normalizeValidatorSettings(value));
  } catch {
    /* Validator preferences must never block editing. */
  }
}

interface ValidatorSettingsState {
  config: ValidationConfig;
  setRuleEnabled(rule: ValidationRuleId, enabled: boolean): void;
}

export const useValidatorSettings = create<ValidatorSettingsState>((set) => ({
  config: structuredClone(DEFAULT_VALIDATION_CONFIG),
  setRuleEnabled: (rule, enabled) => set((state) => {
    const config = normalizeValidatorSettings({
      ...state.config,
      enabled: { ...state.config.enabled, [rule]: enabled },
    });
    void persistValidatorSettings(config);
    return { config };
  }),
}));

export async function hydrateValidatorSettings(): Promise<void> {
  useValidatorSettings.setState({ config: await loadValidatorSettings() });
}
