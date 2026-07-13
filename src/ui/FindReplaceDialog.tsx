import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  previewFindReplace,
  type FindReplaceOptions,
  type FindReplacePreview,
  type FindReplaceSessionCapture,
} from '../model/find-replace';
import { applyFindReplace } from '../model/ops';
import { navigateToFindReplaceRow } from './find-replace-navigation';

const DEFAULT_OPTIONS: FindReplaceOptions = {
  find: '',
  replace: '',
  scope: 'model',
  searchName: true,
  searchDocumentation: true,
  searchPropertyValues: false,
  matchCase: false,
  useRegex: false,
};

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

export function FindReplaceDialog({
  capture,
  onClose,
}: {
  capture: FindReplaceSessionCapture;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<FindReplacePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Enter find text, then preview the changes.');
  const model = useSyncExternalStore(
    capture.store.subscribe,
    () => capture.store.getState().model,
    () => capture.store.getState().model,
  );
  const activeViewId = useSyncExternalStore(
    capture.store.subscribe,
    () => capture.store.getState().activeViewId,
    () => capture.store.getState().activeViewId,
  );
  const readOnly = useSyncExternalStore(
    capture.store.subscribe,
    () => capture.store.getState().readOnly,
    () => capture.store.getState().readOnly,
  );
  const sourceRef = useRef({ model, activeViewId });

  const invalidate = (nextStatus = 'Options changed. Preview again.') => {
    setPreview(null);
    setSelected(new Set());
    setError(null);
    setStatus(nextStatus);
  };

  const updateOption = <K extends keyof FindReplaceOptions>(
    key: K,
    value: FindReplaceOptions[K],
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
    invalidate();
  };

  useEffect(() => {
    const previous = sourceRef.current;
    sourceRef.current = { model, activeViewId };
    if (previous.model !== model || previous.activeViewId !== activeViewId) {
      invalidate('Source changed. Preview again.');
    }
  }, [activeViewId, model]);

  useEffect(() => {
    const restoreFocus = restoreFocusRef.current;
    findInputRef.current?.focus();
    return () => {
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const runPreview = () => {
    const next = previewFindReplace(capture, options);
    setPreview(next.valid ? next : null);
    setSelected(new Set(next.rows.map((row) => row.id)));
    setError(next.error);
    const occurrences = next.rows.reduce((sum, row) => sum + row.count, 0);
    const result = next.rows.length === 0
      ? 'No matches.'
      : `${next.rows.length} matching field${next.rows.length === 1 ? '' : 's'}, ${occurrences} occurrence${occurrences === 1 ? '' : 's'}.`;
    setStatus(readOnly ? `Read-only — ${result} Apply is disabled.` : result);
  };

  const runApply = () => {
    if (!preview) return;
    try {
      const applied = applyFindReplace(preview, [...selected]);
      setStatus(`${applied} field${applied === 1 ? '' : 's'} replaced.`);
      onClose();
    } catch (cause) {
      setPreview(null);
      setSelected(new Set());
      setError(message(cause));
      setStatus('Preview again before applying.');
    }
  };

  const allSelected = preview !== null
    && preview.rows.length > 0
    && preview.rows.every((row) => selected.has(row.id));

  return createPortal(
    <div
      className="modal-backdrop find-replace-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="find-replace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="find-replace-header">
          <div>
            <div className="find-replace-kicker">Review before changing</div>
            <h2 id={titleId}>Find and replace</h2>
          </div>
          <span className="find-replace-scope-note">One model · one undo</span>
        </header>

        <div className="find-replace-query-grid">
          <label htmlFor={`${titleId}-find`}>
            Find
            <input
              ref={findInputRef}
              id={`${titleId}-find`}
              name="find"
              value={options.find}
              aria-invalid={error !== null}
              onChange={(event) => updateOption('find', event.target.value)}
            />
          </label>
          <label htmlFor={`${titleId}-replace`}>
            Replace
            <input
              id={`${titleId}-replace`}
              name="replace"
              value={options.replace}
              onChange={(event) => updateOption('replace', event.target.value)}
            />
          </label>
        </div>

        <div className="find-replace-options">
          <fieldset>
            <legend>Scope</legend>
            <label>
              <input
                type="radio"
                name="scope"
                value="model"
                checked={options.scope === 'model'}
                onChange={() => updateOption('scope', 'model')}
              />
              Model
            </label>
            <label>
              <input
                type="radio"
                name="scope"
                value="active-view"
                checked={options.scope === 'active-view'}
                disabled={!activeViewId}
                onChange={() => updateOption('scope', 'active-view')}
              />
              Active view
            </label>
          </fieldset>
          <fieldset>
            <legend>Fields</legend>
            <label>
              <input
                type="checkbox"
                name="searchName"
                checked={options.searchName}
                onChange={(event) => updateOption('searchName', event.target.checked)}
              />
              Name
            </label>
            <label>
              <input
                type="checkbox"
                name="searchDocumentation"
                checked={options.searchDocumentation}
                onChange={(event) => updateOption('searchDocumentation', event.target.checked)}
              />
              Documentation
            </label>
            <label>
              <input
                type="checkbox"
                name="searchPropertyValues"
                checked={options.searchPropertyValues}
                onChange={(event) => updateOption('searchPropertyValues', event.target.checked)}
              />
              Property values
            </label>
          </fieldset>
          <fieldset>
            <legend>Matching</legend>
            <label>
              <input
                type="checkbox"
                name="matchCase"
                checked={options.matchCase}
                onChange={(event) => updateOption('matchCase', event.target.checked)}
              />
              Match case
            </label>
            <label>
              <input
                type="checkbox"
                name="useRegex"
                checked={options.useRegex}
                onChange={(event) => updateOption('useRegex', event.target.checked)}
              />
              Regular expression
            </label>
          </fieldset>
        </div>

        <div className="find-replace-feedback">
          <span role="status" aria-live="polite">
            {readOnly && !status.startsWith('Read-only') ? `Read-only — ${status}` : status}
          </span>
          {error && <span role="alert">{error}</span>}
        </div>

        {preview && preview.rows.length > 0 && (
          <div className="find-replace-preview-wrap">
            <table aria-label="Find and replace preview">
              <thead>
                <tr>
                  <th className="find-replace-check">
                    <input
                      type="checkbox"
                      aria-label="Select all preview rows"
                      checked={allSelected}
                      onChange={(event) => setSelected(event.target.checked
                        ? new Set(preview.rows.map((row) => row.id))
                        : new Set())}
                    />
                  </th>
                  <th>Type and location</th>
                  <th>Field</th>
                  <th>Before → after</th>
                  <th className="find-replace-count">Count</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id} data-match-id={row.id}>
                    <td className="find-replace-check">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.ownerType} ${row.field}`}
                        checked={selected.has(row.id)}
                        onChange={(event) => setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="find-replace-navigate"
                        disabled={false}
                        onClick={() => {
                          if (!navigateToFindReplaceRow(preview, row.id)) {
                            setError('This match is no longer available. Preview again.');
                          }
                        }}
                      >
                        {row.ownerType}
                      </button>
                      <span className="find-replace-location">{row.location}</span>
                    </td>
                    <td>{row.field}</td>
                    <td className="find-replace-change">
                      <code title={row.before}>{row.before || '∅'}</code>
                      <span aria-hidden="true">→</span>
                      <code title={row.after}>{row.after || '∅'}</code>
                    </td>
                    <td className="find-replace-count"><span>{row.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="find-replace-actions">
          <button type="button" className="tb-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="tb-btn" onClick={runPreview}>Preview</button>
          <button
            type="button"
            className="tb-btn primary"
            disabled={!preview?.valid || selected.size === 0 || readOnly}
            onClick={runApply}
          >
            Apply
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
