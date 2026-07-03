import type { LocalExtensionRecord } from './types';

export interface ExtensionDraft {
  name: string;
  version: string;
  source: string;
}

export function extensionDraftFromRecord(record: LocalExtensionRecord): ExtensionDraft {
  return {
    name: record.name,
    version: record.version,
    source: record.source,
  };
}

export function hasExtensionDraftChanges(
  record: LocalExtensionRecord | null,
  draft: ExtensionDraft,
): boolean {
  if (!record) return false;
  return (
    draft.name !== record.name ||
    draft.version !== record.version ||
    draft.source !== record.source
  );
}
