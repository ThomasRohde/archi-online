import {
  useEffect,
  useId,
  useMemo,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  displayPropertyKey,
  inspectPropertyUsage,
  previewPropertyDelete,
  previewPropertyRename,
  type PropertyKeyUsage,
  type PropertyManagerSessionCapture,
  type PropertyMutationOperation,
  type PropertyMutationPreview,
  type PropertyOccurrence,
} from '../model/property-manager';
import { deletePropertyKey, renamePropertyKey } from '../model/ops';
import { workspaceStore } from '../model/workspace';
import { navigateToPropertyOccurrence } from './property-manager-navigation';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function preventAppShortcutDefault(event: Pick<
  KeyboardEvent,
  'ctrlKey' | 'key' | 'metaKey' | 'preventDefault' | 'target'
>): void {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  const editable = event.target instanceof HTMLInputElement
    || event.target instanceof HTMLTextAreaElement
    || (event.target instanceof HTMLElement && event.target.isContentEditable);
  if (key === 's' || key === 'o' || (!editable && ['d', 'z', 'y'].includes(key))) {
    event.preventDefault();
  }
}

function occurrenceContext(
  occurrence: PropertyOccurrence,
  index: number,
  key: string,
): string {
  const value = occurrence.value === '' ? 'empty value' : occurrence.value;
  return `property ${displayPropertyKey(key)} occurrence ${index + 1}: ${occurrence.ownerType} at ${occurrence.location}, ${value}`;
}

function initialUsage(capture: PropertyManagerSessionCapture): readonly PropertyKeyUsage[] {
  try {
    return inspectPropertyUsage(capture);
  } catch {
    return Object.freeze([]);
  }
}

export function PropertiesManagerDialog({
  capture,
  onClose,
}: {
  capture: PropertyManagerSessionCapture;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const closingRef = useRef(false);
  const [usage] = useState(() => initialUsage(capture));
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(usage[0]?.key ?? null);
  const [operation, setOperation] = useState<PropertyMutationOperation | null>(null);
  const [newKey, setNewKey] = useState('');
  const [collisionDetected, setCollisionDetected] = useState(false);
  const [collisionAcknowledged, setCollisionAcknowledged] = useState(false);
  const [preview, setPreview] = useState<PropertyMutationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(
    `${usage.length} property key${usage.length === 1 ? '' : 's'} in this model.`,
  );
  const model = useSyncExternalStore(
    capture.store.subscribe,
    () => capture.store.getState().model,
    () => capture.store.getState().model,
  );
  const readOnly = useSyncExternalStore(
    capture.store.subscribe,
    () => capture.store.getState().readOnly,
    () => capture.store.getState().readOnly,
  );
  const activationOrder = useSyncExternalStore(
    workspaceStore.subscribe,
    () => workspaceStore.getState().activationOrder,
    () => workspaceStore.getState().activationOrder,
  );
  const sourceRef = useRef({ model, activationOrder });
  const previousCaptureRef = useRef(capture);
  if (previousCaptureRef.current !== capture) {
    previousCaptureRef.current = capture;
    closingRef.current = false;
    sourceRef.current = { model, activationOrder };
  }
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const filteredUsage = useMemo(() => {
    const query = search.toLocaleLowerCase();
    if (!query) return usage;
    return usage.filter((entry) => entry.displayKey.toLocaleLowerCase().includes(query));
  }, [search, usage]);
  const selectedUsage = usage.find((entry) => entry.key === selectedKey) ?? null;
  const visibleOccurrences = preview?.occurrences ?? selectedUsage?.occurrences ?? [];

  const invalidatePreview = (nextStatus = 'Options changed. Preview again.') => {
    setPreview(null);
    setError(null);
    setStatus(nextStatus);
  };

  const resetStage = (nextOperation: PropertyMutationOperation | null) => {
    setOperation(nextOperation);
    setNewKey('');
    setCollisionDetected(false);
    setCollisionAcknowledged(false);
    invalidatePreview(nextOperation
      ? `${nextOperation === 'rename' ? 'Rename' : 'Delete'} staged. Preview the affected occurrences.`
      : 'Choose an operation.');
  };

  useEffect(() => {
    if (selectedKey !== null && !filteredUsage.some((entry) => entry.key === selectedKey)) {
      const nextKey = filteredUsage[0]?.key ?? null;
      setSelectedKey(nextKey);
      resetStage(null);
    }
  // resetStage intentionally uses local state setters only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredUsage, selectedKey]);

  useEffect(() => {
    const source = sourceRef.current;
    if (source.model !== model
      || (capture.sessionId !== null && source.activationOrder !== activationOrder)) {
      requestClose();
    }
  }, [activationOrder, capture.sessionId, model, requestClose]);

  useEffect(() => {
    const restoreFocus = restoreFocusRef.current;
    searchInputRef.current?.focus();
    return () => {
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (dialog && event.target instanceof Node && dialog.contains(event.target)) return;
      event.stopImmediatePropagation();
      preventAppShortcutDefault(event);
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [requestClose]);

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    preventAppShortcutDefault(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const runPreview = () => {
    if (selectedKey === null || operation === null) return;
    try {
      const next = operation === 'rename'
        ? previewPropertyRename(capture, selectedKey, newKey, collisionAcknowledged)
        : previewPropertyDelete(capture, selectedKey);
      setPreview(next.valid ? next : null);
      setCollisionDetected(next.collision);
      setError(next.error);
      const result = next.occurrences.length === 0
        ? 'No affected occurrences.'
        : `${next.occurrences.length} affected occurrence${next.occurrences.length === 1 ? '' : 's'} previewed.`;
      setStatus(readOnly ? `Read-only — ${result} Apply is disabled.` : result);
    } catch (cause) {
      setPreview(null);
      setError(message(cause));
      setStatus('The manager is no longer current. Open it again.');
    }
  };

  const runApply = () => {
    if (!preview) return;
    try {
      const applied = preview.operation === 'rename'
        ? renamePropertyKey(preview)
        : deletePropertyKey(preview);
      setStatus(`${applied} property occurrence${applied === 1 ? '' : 's'} changed.`);
      requestClose();
    } catch (cause) {
      setPreview(null);
      setError(message(cause));
      setStatus('Preview again before applying.');
    }
  };

  const canApply = Boolean(
    preview?.valid
    && !readOnly
    && (!preview.collision || preview.collisionAcknowledged),
  );
  const applyLabel = operation === 'delete' ? 'Apply delete' : 'Apply rename';
  const feedbackError = error ?? preview?.warning ?? null;

  return createPortal(
    <div
      className="modal-backdrop property-manager-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        className="property-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className="property-manager-header">
          <div>
            <div className="property-manager-kicker">Model-wide property ledger</div>
            <h2 id={titleId}>Properties manager</h2>
          </div>
          <span>Exact keys · one operation · one undo</span>
        </header>

        <div className="property-manager-body">
          <aside className="property-manager-keys" aria-label="Property keys">
            <label htmlFor={`${titleId}-search`}>
              Search keys
              <input
                ref={searchInputRef}
                id={`${titleId}-search`}
                name="propertyKeySearch"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="property-manager-table-wrap">
              <table aria-label="Property key summary">
                <thead>
                  <tr><th>Key</th><th>Uses</th><th>Owners</th></tr>
                </thead>
                <tbody>
                  {filteredUsage.map((entry) => (
                    <tr key={entry.key} className={entry.key === selectedKey ? 'selected' : ''}>
                      <td>
                        <button
                          type="button"
                          aria-label={`Inspect property key ${entry.displayKey}, ${entry.occurrenceCount} occurrences, ${entry.ownerCount} owners`}
                          onClick={() => {
                            setSelectedKey(entry.key);
                            resetStage(null);
                          }}
                        >
                          {entry.displayKey}
                        </button>
                      </td>
                      <td>{entry.occurrenceCount}</td>
                      <td>{entry.ownerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsage.length === 0 && (
                <div className="property-manager-empty">No property keys match this search.</div>
              )}
            </div>
          </aside>

          <main className="property-manager-details">
            <div className="property-manager-detail-header">
              <div>
                <span>Selected key</span>
                <strong>{selectedKey === null ? 'None' : displayPropertyKey(selectedKey)}</strong>
              </div>
              <div className="property-manager-stage" role="group" aria-label="Stage property operation">
                <button
                  type="button"
                  className={`tb-btn small${operation === 'rename' ? ' active' : ''}`}
                  aria-pressed={operation === 'rename'}
                  disabled={selectedKey === null}
                  onClick={() => resetStage('rename')}
                >
                  Stage rename
                </button>
                <button
                  type="button"
                  className={`tb-btn small${operation === 'delete' ? ' active' : ''}`}
                  aria-pressed={operation === 'delete'}
                  disabled={selectedKey === null}
                  onClick={() => resetStage('delete')}
                >
                  Stage delete
                </button>
              </div>
            </div>

            {operation === 'rename' && (
              <div className="property-manager-rename">
                <label htmlFor={`${titleId}-new-key`}>
                  New exact key
                  <input
                    id={`${titleId}-new-key`}
                    name="newPropertyKey"
                    value={newKey}
                    onChange={(event) => {
                      setNewKey(event.target.value);
                      setCollisionDetected(false);
                      setCollisionAcknowledged(false);
                      invalidatePreview();
                    }}
                  />
                </label>
                {collisionDetected && (
                  <label className="property-manager-acknowledge">
                    <input
                      type="checkbox"
                      aria-label="Acknowledge property key collision"
                      checked={collisionAcknowledged}
                      onChange={(event) => {
                        setCollisionAcknowledged(event.target.checked);
                        invalidatePreview('Collision acknowledgement changed. Preview again.');
                      }}
                    />
                    Keep all duplicate rows separate
                  </label>
                )}
              </div>
            )}

            <div className="property-manager-feedback">
              <span role="status" aria-live="polite">
                {readOnly && !status.startsWith('Read-only') ? `Read-only — ${status}` : status}
              </span>
              {feedbackError && <span role="alert">{feedbackError}</span>}
            </div>

            <div className="property-manager-occurrences">
              <div className="property-manager-occurrence-title">
                {preview ? 'Affected occurrence preview' : 'Occurrences in model order'}
              </div>
              <table aria-label={preview ? 'Property mutation preview' : 'Property occurrence details'}>
                <thead>
                  <tr><th>Value</th><th>Owner</th><th>Location</th></tr>
                </thead>
                <tbody>
                  {visibleOccurrences.map((occurrence, index) => (
                    <tr key={occurrence.id} data-property-coordinate={occurrence.id}>
                      <td><code>{occurrence.value || '∅'}</code></td>
                      <td>{occurrence.ownerType}</td>
                      <td>
                        <button
                          type="button"
                          className="property-manager-navigate"
                          aria-label={`Go to ${occurrenceContext(occurrence, index, selectedKey ?? occurrence.key)}`}
                          onClick={() => {
                            if (!navigateToPropertyOccurrence(capture, occurrence.id)) {
                              setError('This property occurrence is no longer available. Open the manager again.');
                            }
                          }}
                        >
                          {occurrence.location}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleOccurrences.length === 0 && (
                <div className="property-manager-empty">Select a property key to inspect its uses.</div>
              )}
            </div>
          </main>
        </div>

        <footer className="property-manager-actions">
          <button
            type="button"
            className="tb-btn"
            disabled={operation === null}
            onClick={runPreview}
          >
            Preview
          </button>
          <button
            type="button"
            className={`tb-btn primary${operation === 'delete' ? ' danger' : ''}`}
            disabled={!canApply}
            onClick={runApply}
          >
            {applyLabel}
          </button>
          <button type="button" className="tb-btn" onClick={requestClose}>Cancel</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
