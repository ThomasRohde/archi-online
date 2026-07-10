import { useState } from 'react';
import { computeAbsBounds } from '../canvas/view-editor/bounds';
import { requestPanTo } from '../canvas/viewport-bus';
import { openView, setSelection, useStore } from '../model/store';
import type { ModelState } from '../model/types';
import { validateModel, type Severity, type ValidationIssue } from '../model/validation';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

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

/** Location hint shown on a row: the view or containing folder to look in. */
function issueLocation(model: ModelState | null, issue: ValidationIssue): string | null {
  if (!model) return null;
  if (issue.viewId) {
    const name = model.views[issue.viewId]?.name;
    return name ? `view: ${name}` : null;
  }
  if (issue.conceptId) {
    const item =
      model.elements[issue.conceptId] ??
      model.relationships[issue.conceptId] ??
      model.views[issue.conceptId];
    const folder = item ? model.folders[item.folderId] : undefined;
    return folder ? `folder: ${folder.name}` : null;
  }
  return null;
}

export function ValidatorPanel() {
  const model = useStore((s) => s.model);
  const hasModel = model !== null;
  // null = not yet validated; Archi validates on demand, not live.
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const validate = () => {
    const model = useStore.getState().model;
    setIssues(model ? validateModel(model) : []);
  };

  const openIssue = (issue: ValidationIssue) => {
    const model = useStore.getState().model;
    if (!model) return;
    if (issue.viewId) {
      const viewId = issue.viewId;
      openView(viewId);
      if (issue.objectId) {
        setSelection('view', [issue.objectId]);
        const b = computeAbsBounds(model, viewId).get(issue.objectId);
        // Defer the pan a frame so a background view tab is reattached (and
        // measurable) before the canvas centers on the object.
        if (b) {
          requestAnimationFrame(() => requestPanTo(viewId, b.x + b.width / 2, b.y + b.height / 2));
        }
      }
    } else if (issue.conceptId) {
      const conceptId = issue.conceptId;
      layoutBus()?.showPanel('models');
      setSelection('tree', [conceptId]);
      requestReveal(conceptId);
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
                {group.map((issue, index) => {
                  const where = issueLocation(model, issue);
                  return (
                    <div
                      key={severity + index}
                      className={'validator-row ' + severity}
                      title={issue.rule}
                      onClick={() => openIssue(issue)}
                    >
                      <span className="validator-glyph">{SEVERITY_GLYPH[severity]}</span>
                      <span className="validator-text">
                        <span className="validator-message">{issue.message}</span>
                        {where && <span className="validator-where">{where}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
}
