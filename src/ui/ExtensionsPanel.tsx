import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createExtensionRecord,
  useExtensionStore,
} from '../extensions/extension-store';
import { extensionRegistry } from '../extensions/registry';
import { reloadEnabledExtensions, runExtensionRecord } from '../extensions/runtime';
import type { LocalExtensionRecord } from '../extensions/types';
import { showConfirmDialog, showPromptDialog } from './AppDialog';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

function subscribe(listener: () => void) {
  return extensionRegistry.subscribe(listener);
}

function snapshot() {
  return extensionRegistry.getSnapshot();
}

function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'extension'
  );
}

function uniqueExtensionId(name: string, records: LocalExtensionRecord[]): string {
  const base = `local.${slugifyName(name)}`;
  const used = new Set(records.map((record) => record.id));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function ExtensionsPanel() {
  const extensions = useExtensionStore((s) => s.extensions);
  const upsert = useExtensionStore((s) => s.upsert);
  const remove = useExtensionStore((s) => s.remove);
  const setEnabled = useExtensionStore((s) => s.setEnabled);
  const runtime = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [selectedId, setSelectedId] = useState<string | null>(extensions[0]?.id ?? null);
  const [draftName, setDraftName] = useState('');
  const [draftVersion, setDraftVersion] = useState('0.1.0');
  const [draftSource, setDraftSource] = useState('');

  const current = extensions.find((record) => record.id === selectedId) ?? extensions[0] ?? null;
  const currentErrors = useMemo(
    () => runtime.errors.filter((error) => error.extensionId === current?.id),
    [current?.id, runtime.errors],
  );

  useEffect(() => {
    if (!current && extensions[0]) {
      setSelectedId(extensions[0].id);
    } else if (current) {
      setDraftName(current.name);
      setDraftVersion(current.version);
      setDraftSource(current.source);
    } else {
      setDraftName('');
      setDraftVersion('0.1.0');
      setDraftSource('');
    }
  }, [current, extensions]);

  const draftRecord = (): LocalExtensionRecord | null => {
    if (!current) return null;
    return {
      ...current,
      name: draftName.trim() || current.name,
      version: draftVersion.trim() || current.version,
      source: draftSource,
      updatedAt: Date.now(),
    };
  };

  const save = () => {
    const next = draftRecord();
    if (!next) return;
    upsert(next);
  };

  const reload = () => {
    const next = draftRecord();
    if (!next) return;
    upsert(next);
    if (next.enabled) runExtensionRecord(next);
    else extensionRegistry.clearExtension(next.id);
  };

  const toggleEnabled = (record: LocalExtensionRecord, enabled: boolean) => {
    setEnabled(record.id, enabled);
    if (enabled) runExtensionRecord({ ...record, enabled });
    else extensionRegistry.clearExtension(record.id);
  };

  const addExtension = () => {
    void (async () => {
      const name = await showPromptDialog({
        title: 'New extension',
        message: 'Name the extension to add to this browser profile.',
        defaultValue: `Extension ${extensions.length + 1}`,
        confirmLabel: 'Create',
      });
      const extensionName = name?.trim();
      if (!extensionName) return;
      const record = createExtensionRecord(uniqueExtensionId(extensionName, extensions), extensionName);
      upsert(record);
      setSelectedId(record.id);
      runExtensionRecord(record);
    })();
  };

  const deleteExtension = () => {
    if (!current) return;
    void (async () => {
      const confirmed = await showConfirmDialog({
        title: 'Delete extension?',
        message: `Delete "${current.name}" from this browser profile?`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep extension',
        intent: 'danger',
      });
      if (!confirmed) return;
      extensionRegistry.clearExtension(current.id);
      remove(current.id);
      const next = extensions.find((record) => record.id !== current.id) ?? null;
      setSelectedId(next?.id ?? null);
    })();
  };

  return (
    <div className="extensions-panel">
      <div className="extensions-head">
        <div>
          <div className="settings-title">Extensions</div>
          <div className="settings-summary">{extensions.length} installed</div>
        </div>
        <div className="extension-actions">
          <button className="tb-btn small" onClick={addExtension}>
            New
          </button>
          <button className="tb-btn small" onClick={() => reloadEnabledExtensions()}>
            Reload all
          </button>
        </div>
      </div>

      <div className="extensions-list">
        {extensions.length === 0 && (
          <button className="extension-empty" onClick={addExtension}>
            Create an extension
          </button>
        )}
        {extensions.map((record) => (
          <button
            key={record.id}
            className={`extension-row ${record.id === current?.id ? 'active' : ''}`}
            onClick={() => setSelectedId(record.id)}
          >
            <input
              type="checkbox"
              checked={record.enabled}
              onChange={(event) => {
                event.stopPropagation();
                toggleEnabled(record, event.target.checked);
              }}
              onClick={(event) => event.stopPropagation()}
              title={record.enabled ? 'Disable extension' : 'Enable extension'}
            />
            <span className="extension-row-main">
              <span className="extension-row-name">{record.name}</span>
              <span className="extension-row-id">{record.id}</span>
            </span>
            <span className="extension-row-version">{record.version}</span>
          </button>
        ))}
      </div>

      {current ? (
        <>
          <div className="extension-form">
            <label>
              Name
              <input
                className="prop-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <label>
              Version
              <input
                className="prop-input"
                value={draftVersion}
                onChange={(event) => setDraftVersion(event.target.value)}
              />
            </label>
            <label>
              ID
              <input className="prop-input" value={current.id} readOnly />
            </label>
          </div>

          <div className="extension-actions">
            <button className="tb-btn small" onClick={save}>
              Save
            </button>
            <button className="tb-btn small run-btn" onClick={reload}>
              Reload
            </button>
            <button className="tb-btn small" onClick={() => extensionRegistry.clearExtension(current.id)}>
              Unload
            </button>
            <button className="tb-btn small" onClick={deleteExtension}>
              Delete
            </button>
          </div>

          <div className="extension-editor">
            <Suspense fallback={<div className="empty-hint">Loading editor...</div>}>
              <MonacoEditor value={draftSource} onChange={setDraftSource} onRun={reload} />
            </Suspense>
          </div>

          <div className="extension-errors">
            {currentErrors.length === 0 ? (
              <div className="empty-hint">No runtime errors.</div>
            ) : (
              currentErrors.map((error, index) => (
                <div key={`${error.time}-${index}`} className="console-entry error">
                  {error.message}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="empty-hint">No extension selected.</div>
      )}
    </div>
  );
}
