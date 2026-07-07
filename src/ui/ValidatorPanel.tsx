import { useState } from 'react';
import { openView, setSelection, useStore } from '../model/store';
import { validateModel, type Severity, type ValidationIssue } from '../model/validation';

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'advice'];

const SEVERITY_GLYPH: Record<Severity, string> = {
  error: '⛔',
  warning: '⚠️',
  advice: 'ℹ️',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  advice: 'Advice',
};

function summary(issues: ValidationIssue[]): string {
  const count = (severity: Severity) => issues.filter((issue) => issue.severity === severity).length;
  const errors = count('error');
  const warnings = count('warning');
  const advice = count('advice');
  return `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${advice} advice`;
}

export function ValidatorPanel() {
  const hasModel = useStore((s) => s.model !== null);
  // null = not yet validated; Archi validates on demand, not live.
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const validate = () => {
    const model = useStore.getState().model;
    setIssues(model ? validateModel(model) : []);
  };

  const openIssue = (issue: ValidationIssue) => {
    if (issue.viewId) {
      openView(issue.viewId);
      if (issue.objectId) setSelection('view', [issue.objectId]);
    } else if (issue.conceptId) {
      setSelection('tree', [issue.conceptId]);
    }
  };

  return (
    <div className="validator-panel">
      <div className="validator-toolbar">
        <button
          className="tb-btn run-btn"
          onClick={validate}
          disabled={!hasModel}
          title="Validate the model"
        >
          Validate
        </button>
        {issues && <span className="validator-summary">{summary(issues)}</span>}
      </div>
      <div className="validator-list">
        {!hasModel && <div className="empty-hint">No model open.</div>}
        {hasModel && issues === null && (
          <div className="empty-hint">Click Validate to check the model.</div>
        )}
        {hasModel && issues !== null && issues.length === 0 && (
          <div className="empty-hint">No issues found.</div>
        )}
        {issues !== null &&
          SEVERITY_ORDER.map((severity) => {
            const group = issues.filter((issue) => issue.severity === severity);
            if (group.length === 0) return null;
            return (
              <div key={severity} className="validator-group">
                <div className="validator-group-header">
                  {SEVERITY_LABEL[severity]} ({group.length})
                </div>
                {group.map((issue, index) => (
                  <div
                    key={severity + index}
                    className={'validator-row ' + severity}
                    title={issue.rule}
                    onClick={() => openIssue(issue)}
                  >
                    <span className="validator-glyph">{SEVERITY_GLYPH[severity]}</span>
                    <span className="validator-message">{issue.message}</span>
                  </div>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
