import { describe, expect, it } from 'vitest';
import { extensionDraftFromRecord, hasExtensionDraftChanges } from '../src/extensions/extension-draft';
import type { LocalExtensionRecord } from '../src/extensions/types';

function record(source = 'app.extension({ id: "local.test", name: "Test", version: "0.1.0" });'): LocalExtensionRecord {
  return {
    id: 'local.test',
    name: 'Test',
    version: '0.1.0',
    enabled: true,
    source,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('extension editor drafts', () => {
  it('creates drafts from persisted extension records', () => {
    expect(extensionDraftFromRecord(record())).toEqual({
      name: 'Test',
      version: '0.1.0',
      source: 'app.extension({ id: "local.test", name: "Test", version: "0.1.0" });',
    });
  });

  it('detects unsaved draft edits', () => {
    const persisted = record();
    const draft = extensionDraftFromRecord(persisted);

    expect(hasExtensionDraftChanges(persisted, draft)).toBe(false);

    expect(hasExtensionDraftChanges(persisted, { ...draft, source: `${draft.source}\n` })).toBe(true);
  });
});
