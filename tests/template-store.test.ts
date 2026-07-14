import { describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { createArchiTemplate } from '../src/model/io/architemplate';
import { parseArchiTemplate } from '../src/model/io/architemplate';
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';
import {
  TEMPLATE_CATALOG_KEY,
  createTemplateRecord,
  loadTemplateCatalog,
  normalizeTemplateCatalog,
  persistTemplateCatalog,
  searchTemplateCatalog,
  updateTemplateRecord,
  useTemplateCatalog,
} from '../src/persistence/template-store';

describe('template catalog persistence', () => {
  it('normalizes, persists, searches, and restores portable template records', async () => {
    const bytes = await createArchiTemplate(createEmptyModel('Starter'), {
      manifest: { name: 'Business Starter', description: 'Customer journey' },
      metadata: {
        version: 1,
        id: 'id-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        categories: ['Business', 'Examples'],
      },
    });
    const record = await createTemplateRecord(bytes, 100);
    expect(record).toMatchObject({
      version: 1,
      id: 'id-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Business Starter',
      description: 'Customer journey',
      categories: ['Business', 'Examples'],
      createdAt: 100,
      updatedAt: 100,
    });

    const storage = memoryKeyValueStore();
    await persistTemplateCatalog([record], storage);
    expect(storage.data.has(TEMPLATE_CATALOG_KEY)).toBe(true);
    const loaded = await loadTemplateCatalog(storage);
    expect(loaded).toEqual([record]);
    expect(searchTemplateCatalog(loaded, 'customer', [])).toEqual([record]);
    expect(searchTemplateCatalog(loaded, '', ['business'])).toEqual([record]);
    expect(searchTemplateCatalog(loaded, 'missing', [])).toEqual([]);

    const updated = await updateTemplateRecord(record, {
      name: 'Updated starter',
      description: 'Revised description',
      categories: ['Updated'],
    }, 200);
    expect(updated).toMatchObject({
      id: record.id,
      name: 'Updated starter',
      description: 'Revised description',
      categories: ['Updated'],
      createdAt: 100,
      updatedAt: 200,
    });
    const reparsed = await parseArchiTemplate(updated.archive);
    expect(reparsed.manifest.name).toBe('Updated starter');
    expect(reparsed.metadata).toEqual({ version: 1, id: record.id, categories: ['Updated'] });
  });

  it('drops malformed records, tolerates hydration failures, and surfaces write failures', async () => {
    const normalized = normalizeTemplateCatalog([
      null,
      { version: 1, id: 'bad', name: 'Bad', archive: new Uint8Array([1]) },
      { version: 2, id: 'id-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Old' },
    ]);
    expect(normalized).toEqual([]);
    const storage = {
      get: async () => { throw new Error('unavailable'); },
      set: async () => { throw new Error('unavailable'); },
      del: async () => undefined,
    };
    await expect(loadTemplateCatalog(storage)).resolves.toEqual([]);
    await expect(persistTemplateCatalog([], storage)).rejects.toThrow('unavailable');
  });

  it('changes visible catalog state only after the durable write succeeds', async () => {
    const record = await createTemplateRecord(await createArchiTemplate(createEmptyModel('Starter'), {
      manifest: { name: 'Starter', description: '' },
      metadata: {
        version: 1,
        id: 'id-cccccccccccccccccccccccccccccccc',
        categories: [],
      },
    }));
    const restore = setDefaultKeyValueStoreForTests({
      get: async () => undefined,
      set: async () => { throw new Error('quota exceeded'); },
      del: async () => undefined,
    });
    useTemplateCatalog.setState({ records: [], hydrated: true });
    try {
      await expect(Promise.resolve(useTemplateCatalog.getState().upsert(record)))
        .rejects.toThrow('quota exceeded');
      expect(useTemplateCatalog.getState().records).toEqual([]);
    } finally {
      restore();
      useTemplateCatalog.setState({ records: [], hydrated: true });
    }
  });
});
