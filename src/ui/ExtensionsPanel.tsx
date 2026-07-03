import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createArchiveBlobForPackage,
  createArchiveBlobForSourceRecord,
  extensionArchiveFileName,
  readExtensionArchive,
} from '../extensions/package-archive';
import {
  createExtensionRecord,
  useExtensionStore,
} from '../extensions/extension-store';
import { useExtensionPackageStore } from '../extensions/package-store';
import {
  flattenInstalledPackage,
  packageInfo,
} from '../extensions/package-validation';
import { extensionRegistry } from '../extensions/registry';
import {
  reloadEnabledExtensions,
  runExtensionRecord,
  runInstalledPackage,
} from '../extensions/runtime';
import type { InstalledExtensionPackage } from '../extensions/package-types';
import type { LocalExtensionRecord } from '../extensions/types';
import { showAlertDialog, showConfirmDialog, showPromptDialog } from './AppDialog';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

type ExtensionListItem =
  | {
      key: string;
      origin: 'source' | 'override';
      record: LocalExtensionRecord;
      packageRecord?: undefined;
    }
  | {
      key: string;
      origin: 'package';
      record: LocalExtensionRecord;
      packageRecord: InstalledExtensionPackage;
    };

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

function formatTime(time: number): string {
  return new Date(time).toLocaleString();
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExtensionsPanel() {
  const extensions = useExtensionStore((s) => s.extensions);
  const upsert = useExtensionStore((s) => s.upsert);
  const remove = useExtensionStore((s) => s.remove);
  const setEnabled = useExtensionStore((s) => s.setEnabled);
  const packages = useExtensionPackageStore((s) => s.packages);
  const upsertPackage = useExtensionPackageStore((s) => s.upsertPackage);
  const removePackage = useExtensionPackageStore((s) => s.removePackage);
  const setPackageEnabled = useExtensionPackageStore((s) => s.setPackageEnabled);
  const runtime = useSyncExternalStore(subscribe, snapshot, snapshot);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftVersion, setDraftVersion] = useState('0.1.0');
  const [draftSource, setDraftSource] = useState('');

  const items = useMemo<ExtensionListItem[]>(() => {
    const sourceIds = new Set(extensions.map((record) => record.id));
    return [
      ...extensions.map((record) => ({
        key: `source:${record.id}`,
        origin: record.origin === 'override' ? 'override' : 'source',
        record,
      }) satisfies ExtensionListItem),
      ...packages
        .filter((pkg) => !sourceIds.has(pkg.id))
        .map((pkg) => ({
          key: `package:${pkg.id}`,
          origin: 'package',
          record: flattenInstalledPackage(pkg),
          packageRecord: pkg,
        }) satisfies ExtensionListItem),
    ];
  }, [extensions, packages]);

  const current = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const currentRecord = current?.record ?? null;
  const currentPackageInfo = current?.packageRecord ? packageInfo(current.packageRecord) : null;
  const currentErrors = useMemo(
    () => runtime.errors.filter((error) => error.extensionId === currentRecord?.id),
    [currentRecord?.id, runtime.errors],
  );

  useEffect(() => {
    if (!current && items[0]) {
      setSelectedKey(items[0].key);
    } else if (current) {
      setDraftName(current.record.name);
      setDraftVersion(current.record.version);
      setDraftSource(current.record.source);
    } else {
      setDraftName('');
      setDraftVersion('0.1.0');
      setDraftSource('');
    }
  }, [current, items]);

  const draftRecord = (): LocalExtensionRecord | null => {
    if (!currentRecord || current?.origin === 'package') return null;
    return {
      ...currentRecord,
      name: draftName.trim() || currentRecord.name,
      version: draftVersion.trim() || currentRecord.version,
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
    if (!current) return;
    if (current.origin === 'package') {
      if (current.packageRecord.enabled) runInstalledPackage(current.packageRecord);
      else extensionRegistry.clearExtension(current.packageRecord.id);
      return;
    }
    const next = draftRecord();
    if (!next) return;
    upsert(next);
    if (next.enabled) runExtensionRecord(next);
    else extensionRegistry.clearExtension(next.id);
  };

  const toggleEnabled = (item: ExtensionListItem, enabled: boolean) => {
    if (item.origin === 'package') {
      setPackageEnabled(item.packageRecord.id, enabled);
      if (enabled) runInstalledPackage({ ...item.packageRecord, enabled });
      else extensionRegistry.clearExtension(item.packageRecord.id);
      return;
    }
    setEnabled(item.record.id, enabled);
    if (enabled) runExtensionRecord({ ...item.record, enabled });
    else extensionRegistry.clearExtension(item.record.id);
  };

  const addExtension = () => {
    void (async () => {
      const name = await showPromptDialog({
        title: 'New extension',
        message: 'Name the extension to add to this browser profile.',
        defaultValue: `Extension ${items.length + 1}`,
        confirmLabel: 'Create',
      });
      const extensionName = name?.trim();
      if (!extensionName) return;
      const record = createExtensionRecord(
        uniqueExtensionId(extensionName, items.map((item) => item.record)),
        extensionName,
      );
      upsert(record);
      setSelectedKey(`source:${record.id}`);
      runExtensionRecord(record);
    })();
  };

  const importPackage = () => importInputRef.current?.click();

  const handleImportPackage = (file: File | null) => {
    if (!file) return;
    void (async () => {
      try {
        const pkg = await readExtensionArchive(file);
        const existingSource = extensions.find((record) => record.id === pkg.id);
        const existingPackage = packages.find((record) => record.id === pkg.id);
        if (existingSource || existingPackage) {
          const confirmed = await showConfirmDialog({
            title: 'Replace extension?',
            message: `Replace the existing "${pkg.id}" extension in this browser profile?`,
            confirmLabel: 'Replace',
            cancelLabel: 'Keep existing',
            intent: 'danger',
          });
          if (!confirmed) return;
        }
        extensionRegistry.clearExtension(pkg.id);
        if (existingSource) remove(existingSource.id);
        upsertPackage(pkg);
        setSelectedKey(`package:${pkg.id}`);
        if (pkg.enabled) runInstalledPackage(pkg);
      } catch (error) {
        await showAlertDialog({
          title: 'Import failed',
          message: error instanceof Error ? error.message : String(error),
          intent: 'error',
        });
      }
    })();
  };

  const exportCurrent = () => {
    if (!current) return;
    if (current.origin === 'package') {
      downloadBlob(
        createArchiveBlobForPackage(current.packageRecord),
        extensionArchiveFileName(current.packageRecord.id, current.packageRecord.version),
      );
      return;
    }
    const record = draftRecord() ?? current.record;
    downloadBlob(
      createArchiveBlobForSourceRecord(record),
      extensionArchiveFileName(record.id, record.version),
    );
  };

  const convertPackageToSource = () => {
    if (!current || current.origin !== 'package') return;
    void (async () => {
      const confirmed = await showConfirmDialog({
        title: 'Convert to source?',
        message: `Convert "${current.record.name}" into an editable local source extension?`,
        confirmLabel: 'Convert',
        cancelLabel: 'Keep package',
      });
      if (!confirmed) return;
      const record: LocalExtensionRecord = {
        ...flattenInstalledPackage(current.packageRecord),
        origin: 'override',
        updatedAt: Date.now(),
      };
      extensionRegistry.clearExtension(record.id);
      removePackage(record.id);
      upsert(record);
      setSelectedKey(`source:${record.id}`);
      if (record.enabled) runExtensionRecord(record);
    })();
  };

  const deleteExtension = () => {
    if (!current) return;
    void (async () => {
      const isPackage = current.origin === 'package';
      const confirmed = await showConfirmDialog({
        title: isPackage ? 'Uninstall package?' : 'Delete extension?',
        message: `${isPackage ? 'Uninstall' : 'Delete'} "${current.record.name}" from this browser profile?`,
        confirmLabel: isPackage ? 'Uninstall' : 'Delete',
        cancelLabel: 'Keep extension',
        intent: 'danger',
      });
      if (!confirmed) return;
      extensionRegistry.clearExtension(current.record.id);
      if (isPackage) removePackage(current.record.id);
      else remove(current.record.id);
      const next = items.find((item) => item.key !== current.key) ?? null;
      setSelectedKey(next?.key ?? null);
    })();
  };

  return (
    <div className="extensions-panel">
      <input
        ref={importInputRef}
        type="file"
        accept=".archi-ext,application/zip,application/x-zip-compressed"
        hidden
        onChange={(event) => {
          handleImportPackage(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
      />
      <div className="extensions-head">
        <div>
          <div className="settings-title">Extensions</div>
          <div className="settings-summary">{items.length} installed</div>
        </div>
        <div className="extension-actions">
          <button className="tb-btn small" onClick={addExtension}>
            New
          </button>
          <button className="tb-btn small" onClick={importPackage}>
            Import
          </button>
          <button className="tb-btn small" onClick={() => reloadEnabledExtensions()}>
            Reload all
          </button>
        </div>
      </div>

      <div className="extensions-list">
        {items.length === 0 && (
          <button className="extension-empty" onClick={addExtension}>
            Create an extension
          </button>
        )}
        {items.map((item) => (
          <button
            key={item.key}
            className={`extension-row ${item.key === current?.key ? 'active' : ''}`}
            onClick={() => setSelectedKey(item.key)}
          >
            <input
              type="checkbox"
              checked={item.record.enabled}
              onChange={(event) => {
                event.stopPropagation();
                toggleEnabled(item, event.target.checked);
              }}
              onClick={(event) => event.stopPropagation()}
              title={item.record.enabled ? 'Disable extension' : 'Enable extension'}
            />
            <span className="extension-row-main">
              <span className="extension-row-name">
                {item.record.name}
                <span className={`extension-origin ${item.origin}`}>{item.origin}</span>
              </span>
              <span className="extension-row-id">{item.record.id}</span>
            </span>
            <span className="extension-row-version">{item.record.version}</span>
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
                readOnly={current.origin === 'package'}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <label>
              Version
              <input
                className="prop-input"
                value={draftVersion}
                readOnly={current.origin === 'package'}
                onChange={(event) => setDraftVersion(event.target.value)}
              />
            </label>
            <label>
              ID
              <input className="prop-input" value={current.record.id} readOnly />
            </label>
          </div>

          <div className="extension-actions">
            {current.origin !== 'package' && (
              <button className="tb-btn small" onClick={save}>
                Save
              </button>
            )}
            <button className="tb-btn small run-btn" onClick={reload}>
              Reload
            </button>
            <button className="tb-btn small" onClick={() => extensionRegistry.clearExtension(current.record.id)}>
              Unload
            </button>
            <button className="tb-btn small" onClick={exportCurrent}>
              Export
            </button>
            {current.origin === 'package' && (
              <button className="tb-btn small" onClick={convertPackageToSource}>
                Convert to source
              </button>
            )}
            <button className="tb-btn small" onClick={deleteExtension}>
              {current.origin === 'package' ? 'Uninstall' : 'Delete'}
            </button>
          </div>

          {currentPackageInfo && (
            <div className="extension-package-details">
              <div className="extension-detail-grid">
                <span>Main</span>
                <strong>{currentPackageInfo.main}</strong>
                <span>Installed</span>
                <strong>{formatTime(currentPackageInfo.installedAt)}</strong>
                <span>Updated</span>
                <strong>{formatTime(currentPackageInfo.updatedAt)}</strong>
              </div>
              {currentPackageInfo.description && (
                <div className="extension-package-description">
                  {currentPackageInfo.description}
                </div>
              )}
              <div className="extension-package-files">
                {currentPackageInfo.files.map((file) => (
                  <span key={file}>{file}</span>
                ))}
              </div>
            </div>
          )}

          {current.origin === 'package' && (
            <div className="extension-source-note">Package source is read-only.</div>
          )}

          <div className="extension-editor">
            <Suspense fallback={<div className="empty-hint">Loading editor...</div>}>
              <MonacoEditor
                value={draftSource}
                readOnly={current.origin === 'package'}
                onChange={current.origin === 'package' ? () => undefined : setDraftSource}
                onRun={reload}
              />
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
