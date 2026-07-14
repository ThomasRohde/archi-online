import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  LayoutTemplate,
  Plus,
  Save,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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
  const selected = shown.find((record) => record.id === selectedId);

  useEffect(() => {
    if (!selected && shown[0]) setSelectedId(shown[0].id);
  }, [selected, shown]);

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
    setQuery('');
    setCategory('');
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
    setQuery('');
    setCategory('');
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
      <section
        className="modal template-gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Model Templates"
        aria-labelledby="template-gallery-title"
        aria-describedby="template-gallery-description"
      >
        <header className="template-gallery-header">
          <div className="template-gallery-heading">
            <span className="template-gallery-heading-icon" aria-hidden="true">
              <LayoutTemplate size={22} strokeWidth={1.8} />
            </span>
            <div>
              <span className="dialog-kicker">Template library</span>
              <h2 id="template-gallery-title">Model templates</h2>
              <p id="template-gallery-description">Start a new model from a proven structure.</p>
            </div>
          </div>
          <button
            className="template-gallery-close"
            type="button"
            aria-label="Close model templates"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {records.length > 0 && <div className="template-gallery-toolbar">
          <label className="template-gallery-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search templates"
              type="search"
              placeholder="Search templates"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter template category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {allCategories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <div className="template-gallery-utility-actions">
            <label className="tb-btn template-import">
              <Upload size={15} aria-hidden="true" />
              Import
              <input
                type="file"
                accept=".architemplate"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = '';
                }}
              />
            </label>
            <button className="tb-btn" disabled={!model || busy} onClick={() => void saveCurrent()}>
              <Save size={15} aria-hidden="true" />
              Save current
            </button>
          </div>
        </div>}
        {records.length === 0 ? <main className="template-gallery-empty">
          <span className="template-gallery-empty-icon" aria-hidden="true">
            <LayoutTemplate size={34} strokeWidth={1.5} />
          </span>
          <div>
            <h3>Build your template library</h3>
            <p>Import an Archi template, or save the open model as a reusable starting point.</p>
          </div>
          <div className="template-gallery-empty-actions">
            <label className="tb-btn primary template-import">
              <Upload size={16} aria-hidden="true" />
              Import template
              <input
                type="file"
                accept=".architemplate"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = '';
                }}
              />
            </label>
            <button className="tb-btn" disabled={!model || busy} onClick={() => void saveCurrent()}>
              <Save size={16} aria-hidden="true" />
              Save current model
            </button>
          </div>
          <small>Templates are stored in this browser and can be exported as .architemplate files.</small>
        </main> : shown.length === 0 ? <main className="template-gallery-empty template-gallery-no-results">
          <span className="template-gallery-empty-icon" aria-hidden="true">
            <SearchX size={32} strokeWidth={1.5} />
          </span>
          <div>
            <h3>No matching templates</h3>
            <p>Try a different search or category.</p>
          </div>
          <button className="tb-btn" onClick={() => { setQuery(''); setCategory(''); }}>Clear filters</button>
        </main> : <main className="template-gallery-body">
          <section className="template-catalog-panel" aria-label="Template catalog">
            <div className="template-panel-heading">
              <span>Library</span>
              <small>{shown.length} {shown.length === 1 ? 'template' : 'templates'}</small>
            </div>
            <div className="template-card-list">
              {shown.map((record) => (
                <button
                  key={record.id}
                  aria-label={record.name}
                  className={`template-card${selectedId === record.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(record.id)}
                >
                  <TemplateThumbnail record={record} />
                  <span className="template-card-copy">
                    <strong>{record.name}</strong>
                    <span>{record.description || 'No description'}</span>
                    <small>{record.categories.join(' · ') || 'Uncategorised'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <aside className="template-editor" aria-label="Template details">
            {selected && <>
              <div className="template-panel-heading">
                <span>Template details</span>
                <small>Edit before reuse</small>
              </div>
              <TemplateThumbnail record={selected} large />
              <div className="template-editor-fields">
                <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <label>Categories<input aria-label="Template categories" value={categories} placeholder="Business, Starter" onChange={(event) => setCategories(event.target.value)} /></label>
                <label>Key thumbnail<select aria-label="Key thumbnail" value={keyThumbnail} onChange={(event) => setKeyThumbnail(event.target.value)}><option value="">None</option>{thumbnailPaths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label>
              </div>
              <button className="tb-btn template-save-metadata" disabled={busy} onClick={() => void saveMetadata()}>
                <Save size={15} aria-hidden="true" />
                Save changes
              </button>
            </>}
          </aside>
        </main>}
        {error && <p className="template-gallery-error" role="alert">{error}</p>}
        {records.length > 0 && <footer>
          <button className="tb-btn danger" disabled={!selected || busy} onClick={() => void deleteTemplate()}>
            <Trash2 size={15} aria-hidden="true" />
            Delete
          </button>
          <span />
          <button className="tb-btn" disabled={!selected || busy} onClick={() => void exportTemplate()}>
            <Download size={15} aria-hidden="true" />
            Export
          </button>
          <button className="tb-btn primary" disabled={!selected || busy} onClick={() => void createModel()}>
            <Plus size={15} aria-hidden="true" />
            Create model
          </button>
        </footer>}
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
    {url ? <img src={url} alt="" /> : <LayoutTemplate aria-hidden="true" />}
  </span>;
}
