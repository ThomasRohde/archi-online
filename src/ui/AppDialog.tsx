import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

type DialogIntent = 'default' | 'danger' | 'error';

interface DialogBase {
  id: number;
  title: string;
  message?: string;
  details?: string;
  intent?: DialogIntent;
  confirmLabel: string;
}

interface AlertDialogRequest extends DialogBase {
  kind: 'alert';
  resolve: () => void;
}

interface ConfirmDialogRequest extends DialogBase {
  kind: 'confirm';
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
}

interface PromptDialogRequest extends DialogBase {
  kind: 'prompt';
  cancelLabel: string;
  defaultValue: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

interface ChoiceDialogRequest extends DialogBase {
  kind: 'choice';
  cancelLabel: string;
  choices: ChoiceDialogChoice[];
  resolve: (value: string | null) => void;
}

interface NestingRelationshipDialogRequest extends DialogBase {
  kind: 'nesting-relationships';
  cancelLabel: string;
  rows: NestingRelationshipDialogRow[];
  resolve: (value: Record<string, string | null> | null) => void;
}

type DialogRequest =
  | AlertDialogRequest
  | ConfirmDialogRequest
  | PromptDialogRequest
  | ChoiceDialogRequest
  | NestingRelationshipDialogRequest;

export interface AlertDialogOptions {
  title: string;
  message?: string;
  details?: string;
  intent?: DialogIntent;
  confirmLabel?: string;
}

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  details?: string;
  intent?: DialogIntent;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptDialogOptions {
  title: string;
  message?: string;
  details?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ChoiceDialogChoice<T extends string = string> {
  label: string;
  value: T;
  primary?: boolean;
  danger?: boolean;
}

export interface ChoiceDialogOptions<T extends string> {
  title: string;
  message?: string;
  details?: string;
  intent?: DialogIntent;
  choices: ChoiceDialogChoice<T>[];
  cancelLabel?: string;
}

export interface NestingRelationshipDialogChoice {
  value: string;
  label: string;
}

export interface NestingRelationshipDialogRow {
  childId: string;
  childLabel: string;
  choices: NestingRelationshipDialogChoice[];
}

export interface NestingRelationshipDialogOptions {
  parentLabel: string;
  rows: NestingRelationshipDialogRow[];
}

let nextDialogId = 1;
let presenter: ((request: DialogRequest) => void) | null = null;
const pendingDialogs: DialogRequest[] = [];

function present(request: DialogRequest): void {
  if (presenter) presenter(request);
  else pendingDialogs.push(request);
}

export function showAlertDialog(options: AlertDialogOptions): Promise<void> {
  return new Promise((resolve) => {
    present({
      id: nextDialogId++,
      kind: 'alert',
      title: options.title,
      message: options.message,
      details: options.details,
      intent: options.intent ?? 'default',
      confirmLabel: options.confirmLabel ?? 'OK',
      resolve,
    });
  });
}

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    present({
      id: nextDialogId++,
      kind: 'confirm',
      title: options.title,
      message: options.message,
      details: options.details,
      intent: options.intent ?? 'default',
      confirmLabel: options.confirmLabel ?? 'OK',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      resolve,
    });
  });
}

export function showPromptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    present({
      id: nextDialogId++,
      kind: 'prompt',
      title: options.title,
      message: options.message,
      details: options.details,
      intent: 'default',
      confirmLabel: options.confirmLabel ?? 'OK',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      defaultValue: options.defaultValue ?? '',
      placeholder: options.placeholder,
      resolve,
    });
  });
}

export function showChoiceDialog<T extends string>(
  options: ChoiceDialogOptions<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    present({
      id: nextDialogId++,
      kind: 'choice',
      title: options.title,
      message: options.message,
      details: options.details,
      intent: options.intent ?? 'default',
      confirmLabel: '',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      choices: options.choices,
      resolve: (value) => resolve(value as T | null),
    });
  });
}

export function showNestingRelationshipDialog(
  options: NestingRelationshipDialogOptions,
): Promise<Record<string, string | null> | null> {
  return new Promise((resolve) => {
    present({
      id: nextDialogId++,
      kind: 'nesting-relationships',
      title:
        options.rows.length === 1 ? 'New Nested Relationship' : 'New Nested Relationships',
      message: `Choose how nested elements relate to ${options.parentLabel}.`,
      intent: 'default',
      confirmLabel: 'Apply',
      cancelLabel: 'Cancel',
      rows: options.rows,
      resolve,
    });
  });
}

export function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [nestingSelections, setNestingSelections] = useState<Record<string, string | null>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const active = queue[0] ?? null;

  const closeActive = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);

  const confirmActive = useCallback(() => {
    if (!active) return;
    if (active.kind === 'alert') active.resolve();
    else if (active.kind === 'confirm') active.resolve(true);
    else if (active.kind === 'prompt') active.resolve(inputValue);
    else if (active.kind === 'choice') {
      active.resolve(
        active.choices.find((choice) => choice.primary)?.value ??
          active.choices[0]?.value ??
          null,
      );
    } else active.resolve({ ...nestingSelections });
    closeActive();
  }, [active, closeActive, inputValue, nestingSelections]);

  const cancelActive = useCallback(() => {
    if (!active) return;
    if (active.kind === 'alert') active.resolve();
    else if (active.kind === 'confirm') active.resolve(false);
    else active.resolve(null);
    closeActive();
  }, [active, closeActive]);

  useEffect(() => {
    const hostPresenter = (request: DialogRequest) => {
      setQueue((current) => [...current, request]);
    };
    presenter = hostPresenter;
    pendingDialogs.splice(0).forEach(hostPresenter);
    return () => {
      if (presenter === hostPresenter) presenter = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    setInputValue(active.kind === 'prompt' ? active.defaultValue : '');
    setNestingSelections(
      active.kind === 'nesting-relationships'
        ? Object.fromEntries(
            active.rows.map((row) => [row.childId, row.choices[0]?.value ?? null]),
          )
        : {},
    );
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const focusTarget =
      active.kind === 'prompt'
        ? inputRef.current
        : active.kind === 'nesting-relationships'
          ? firstSelectRef.current
          : primaryRef.current;
    focusTarget?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelActive();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, cancelActive]);

  if (!active) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    confirmActive();
  };

  return createPortal(
    <div
      className="modal-backdrop app-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancelActive();
      }}
    >
      <form
        className={`app-dialog intent-${active.intent ?? 'default'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`app-dialog-title-${active.id}`}
        onSubmit={onSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-dialog-body">
          <div className="app-dialog-kicker">{dialogKicker(active.kind)}</div>
          <h2 className="app-dialog-title" id={`app-dialog-title-${active.id}`}>
            {active.title}
          </h2>
          {active.message && <p className="app-dialog-message">{active.message}</p>}
          {active.details && <p className="app-dialog-details">{active.details}</p>}
          {active.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="app-dialog-input"
              value={inputValue}
              placeholder={active.placeholder}
              onChange={(event) => setInputValue(event.target.value)}
            />
          )}
          {active.kind === 'nesting-relationships' && (
            <div className="app-dialog-nesting-rows">
              {active.rows.map((row, index) => {
                const selectId = `app-dialog-nesting-${active.id}-${index}`;
                return (
                  <div className="app-dialog-nesting-row" key={row.childId}>
                    <label htmlFor={selectId}>{row.childLabel}</label>
                    <select
                      ref={index === 0 ? firstSelectRef : undefined}
                      id={selectId}
                      aria-label={`Relationship for ${row.childLabel}`}
                      value={nestingSelections[row.childId] ?? ''}
                      onChange={(event) =>
                        setNestingSelections((current) => ({
                          ...current,
                          [row.childId]: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">None</option>
                      {row.choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="app-dialog-actions">
          {active.kind !== 'alert' && (
            <button type="button" className="app-dialog-btn" onClick={cancelActive}>
              {active.cancelLabel}
            </button>
          )}
          {active.kind === 'choice' ? (
            active.choices.map((choice) => (
              <button
                key={choice.value}
                ref={choice.primary ? primaryRef : undefined}
                type="button"
                className={`app-dialog-btn${choice.primary ? ' primary' : ''}${choice.danger ? ' danger' : ''}`}
                onClick={() => {
                  active.resolve(choice.value);
                  closeActive();
                }}
              >
                {choice.label}
              </button>
            ))
          ) : (
            <button
              ref={primaryRef}
              type="submit"
              className={`app-dialog-btn primary ${active.intent === 'danger' ? 'danger' : ''}`}
            >
              {active.confirmLabel}
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}

function dialogKicker(kind: DialogRequest['kind']): string {
  if (kind === 'prompt') return 'Input';
  if (kind === 'choice') return 'Unsaved changes';
  if (kind === 'nesting-relationships') return 'Automatic relationships';
  if (kind === 'confirm') return 'Confirm';
  return 'Notice';
}
