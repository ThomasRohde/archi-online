import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { rasterizeSvg } from '../canvas/export/svg-image';
import { renderViewSvg } from '../canvas/export/view-image';
import {
  createArchiTemplate,
  createModelFromArchiTemplate,
  parseArchiTemplate,
} from '../model/io/architemplate';
import { newId } from '../model/id';
import { addModelSession } from '../model/workspace';
import { saveBlobToDisk, sanitizeFileName } from '../persistence/files';
import {
  importTemplateToCatalog,
  searchTemplateCatalog,
  updateTemplateRecord,
  useTemplateCatalog,
  type TemplateRecord,
} from '../persistence/template-store';
import { showConfirmDialog } from './AppDialog';
import { useStore } from './store-hooks';

export function TemplateGallery({ onClose }: { onClose(): void }) {
  const model = useStore((state) => state.model);
  const records = useTemplateCatalog((state) => state.records);
  const upsert = useTemplateCatalog((state) => state.upsert);
  const remove = useTemplateCatalog((state) => state.remove);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState('');
  const [keyThumbnail, setKeyThumbnail] = useState('');
  const [thumbnailPaths, setThumbnailPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allCategories = useMemo(() => [...new Set(
    records.flatMap((record) => record.categories),
  )].sort((left, right) => left.localeCompare(right, 'en')), [records]);
  const shown = useMemo(
    () => searchTemplateCatalog(records, query, category ? [category] : []),
    [category, query, records],
  );
  const selected = records.find((record) => record.id === selectedId);

  useEffect(() => {
    if (!selected && records[0]) setSelectedId(records[0].id);
  }, [records, selected]);

  useEffect(() => {
    if (!selected) {
      setName('');
      setDescription('');
      setCategories('');
      setKeyThumbnail('');
      setThumbnailPaths([]);
      return;
    }
    setName(selected.name);
    setDescription(selected.description);
    setCategories(selected.categories.join(', '));
    setKeyThumbnail(selected.keyThumbnail ?? '');
    let current = true;
    void parseArchiTemplate(selected.archive).then((parsed) => {
      if (current) setThumbnailPaths(Object.keys(parsed.thumbnails));
    }).catch(() => {
      if (current) setThumbnailPaths([]);
    });
    return () => { current = false; };
  }, [selected]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const importFile = (file: File) => run(async () => {
    const record = await importTemplateToCatalog(new Uint8Array(await file.arrayBuffer()));
    setSelectedId(record.id);
  });

  const saveCurrent = () => run(async () => {
    if (!model) return;
    const thumbnails = await renderTemplateThumbnails(model);
    const record = await importTemplateToCatalog(await createArchiTemplate(model, {
      manifest: {
        name: model.info.name || 'Untitled template',
        description: model.info.documentation,
        ...(thumbnails.length > 0 ? { keyThumbnail: 'Thumbnails/1.png' } : {}),
      },
      metadata: { version: 1, id: newId(), categories: [] },
      thumbnails,
    }));
    setSelectedId(record.id);
  });

  const saveMetadata = () => run(async () => {
    if (!selected) return;
    const updated = await updateTemplateRecord(selected, {
      name: name.trim() || selected.name,
      description,
      categories: categories.split(',').map((value) => value.trim()).filter(Boolean),
      keyThumbnail: keyThumbnail || undefined,
    });
    await upsert(updated);
  });

  const createModel = () => run(async () => {
    if (!selected) return;
    const parsed = await parseArchiTemplate(selected.archive);
    addModelSession({
      model: createModelFromArchiTemplate(parsed),
      fileName: null,
      dirty: true,
    });
    onClose();
  });

  const exportTemplate = () => run(async () => {
    if (!selected) return;
    await saveBlobToDisk(
      new Blob([selected.archive.slice().buffer as ArrayBuffer], { type: 'application/zip' }),
      `${sanitizeFileName(selected.name) || 'template'}.architemplate`,
      { description: 'Archi model template', accept: { 'application/zip': ['.architemplate'] } },
    );
  });

  const deleteTemplate = () => run(async () => {
    if (!selected) return;
    const confirmed = await showConfirmDialog({
      title: 'Delete template?',
      message: `Delete “${selected.name}” from this browser?`,
      details: 'This removes the gallery copy only. Exported files are not affected.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      intent: 'danger',
    });
    if (!confirmed) return;
    await remove(selected.id);
    setSelectedId('');
  });

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="modal template-gallery-dialog" role="dialog" aria-modal="true" aria-label="Model Templates">
        <header>
          <div><span className="dialog-kicker">Phase 3 reuse</span><h2>Model Templates</h2></div>
          <button className="tb-btn" disabled={busy} onClick={onClose}>Close</button>
        </header>
        <div className="template-gallery-toolbar">
          <input aria-label="Search templates" type="search" placeholder="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Filter template category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {allCategories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="tb-btn template-import">Import<input type="file" accept=".architemplate" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></label>
          <button className="tb-btn" disabled={!model || busy} onClick={() => void saveCurrent()}>Save Current Model</button>
        </div>
        <div className="template-gallery-body">
          <div className="template-card-list" aria-label="Template catalog">
            {shown.map((record) => (
              <button key={record.id} aria-label={record.name} className={`template-card${selectedId === record.id ? ' selected' : ''}`} onClick={() => setSelectedId(record.id)}>
                <TemplateThumbnail record={record} />
                <span><strong>{record.name}</strong><small>{record.categories.join(' · ') || 'Uncategorised'}</small></span>
              </button>
            ))}
            {shown.length === 0 && <div className="empty-hint">No templates match this search.</div>}
          </div>
          <div className="template-editor">
            {selected ? <>
              <TemplateThumbnail record={selected} large />
              <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <label>Categories<input aria-label="Template categories" value={categories} placeholder="Business, Starter" onChange={(event) => setCategories(event.target.value)} /></label>
              <label>Key thumbnail<select aria-label="Key thumbnail" value={keyThumbnail} onChange={(event) => setKeyThumbnail(event.target.value)}><option value="">None</option>{thumbnailPaths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label>
              <button className="tb-btn" disabled={busy} onClick={() => void saveMetadata()}>Save Metadata</button>
            </> : <div className="empty-hint">Import or save a model to start the gallery.</div>}
          </div>
        </div>
        {error && <p className="template-gallery-error" role="alert">{error}</p>}
        <footer>
          <button className="tb-btn danger" disabled={!selected || busy} onClick={() => void deleteTemplate()}>Delete</button>
          <span />
          <button className="tb-btn" disabled={!selected || busy} onClick={() => void exportTemplate()}>Export</button>
          <button className="tb-btn primary" disabled={!selected || busy} onClick={() => void createModel()}>Create Model</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

async function renderTemplateThumbnails(model: NonNullable<ReturnType<typeof useStore.getState>['model']>): Promise<Uint8Array[]> {
  const thumbnails: Uint8Array[] = [];
  for (const viewId of Object.keys(model.views).slice(0, 50)) {
    const rendered = renderViewSvg(model, viewId);
    const scale = Math.min(1, 512 / rendered.width, 512 / rendered.height);
    const blob = await rasterizeSvg(rendered.svg, rendered.width, rendered.height, scale);
    thumbnails.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return thumbnails;
}

function TemplateThumbnail({ record, large = false }: { record: TemplateRecord; large?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!record.thumbnail) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(new Blob([
      record.thumbnail.slice().buffer as ArrayBuffer,
    ], { type: 'image/png' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [record.thumbnail]);
  return <span className={`template-thumbnail${large ? ' large' : ''}`}>
    {url ? <img src={url} alt="" /> : <span aria-hidden="true">A</span>}
  </span>;
}
