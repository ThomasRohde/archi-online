import { useState } from 'react';
import { createPortal } from 'react-dom';
import { computeAbsBounds } from '../canvas/view-editor/bounds';
import { requestPanTo } from '../canvas/viewport-bus';
import { openView, setSelection } from '../model/store';
import {
  VALIDATION_RULES,
  validateModel,
  type Severity,
  type ValidationIssue,
  type ValidationSource,
} from '../model/validation';
import { useValidatorSettings } from '../settings/validator-settings';
import { useStore } from './store-hooks';
import { layoutBus } from './layout-bus';
import { requestReveal } from './tree-bus';

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'advice'];
const SOURCE_ORDER: ValidationSource[] = ['hammer', 'integrity'];
const SOURCE_LABEL: Record<ValidationSource, string> = {
  hammer: 'Desktop Hammer rules',
  integrity: 'Model integrity',
};
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

function issueLocation(issue: ValidationIssue): string {
  const path = issue.location.modelTree.labelPath.join(' / ');
  return issue.location.view?.objectId ? `${path} · object ${issue.location.view.objectId}` : path;
}

export function ValidatorPanel() {
  const model = useStore((state) => state.model);
  const config = useValidatorSettings((state) => state.config);
  const setRuleEnabled = useValidatorSettings((state) => state.setRuleEnabled);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [configure, setConfigure] = useState(false);

  const validate = () => {
    const current = useStore.getState().model;
    setIssues(current ? validateModel(current, config) : []);
  };
  const openIssue = (issue: ValidationIssue) => {
    const current = useStore.getState().model;
    if (!current) return;
    const viewTarget = issue.location.view;
    if (viewTarget) {
      openView(viewTarget.viewId);
      if (viewTarget.objectId) {
        setSelection('view', [viewTarget.objectId]);
        const bounds = computeAbsBounds(current, viewTarget.viewId).get(viewTarget.objectId);
        if (bounds) {
          requestAnimationFrame(() => requestPanTo(
            viewTarget.viewId,
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          ));
        }
      }
      return;
    }
    const targetId = issue.location.modelTree.idPath.at(-1);
    if (!targetId) return;
    layoutBus()?.showPanel('models');
    setSelection('tree', [targetId]);
    requestReveal(targetId);
  };

  return (
    <div className="validator-panel">
      <div className="validator-toolbar">
        <button className="tb-btn run-btn" onClick={validate} disabled={!model} title="Validate the model">Validate</button>
        <button className="tb-btn" onClick={() => setConfigure(true)} title="Configure Desktop Hammer rules">Configure</button>
        {issues && <span className="validator-summary">{summary(issues)}</span>}
      </div>
      <div className="validator-list">
        {!model && <div className="empty-hint">No model open.</div>}
        {model && issues === null && <div className="empty-hint">Click Validate to check the model.</div>}
        {model && issues !== null && issues.length === 0 && <div className="empty-hint">No issues found.</div>}
        {issues !== null && SOURCE_ORDER.map((source) => {
          const section = issues.filter((issue) => issue.source === source);
          if (section.length === 0) return null;
          return <section key={source} className={`validator-section ${source}`}>
            <h3>{SOURCE_LABEL[source]} ({section.length})</h3>
            {SEVERITY_ORDER.map((severity) => {
              const group = section.filter((issue) => issue.severity === severity);
              if (group.length === 0) return null;
              return <div key={severity} className="validator-group">
                <div className="validator-group-header">{SEVERITY_LABEL[severity]} ({group.length})</div>
                {group.map((issue, index) => <div key={`${issue.rule}:${index}`} className={`validator-row ${severity}`} title={issue.rule} onClick={() => openIssue(issue)}><span className="validator-glyph">{SEVERITY_GLYPH[severity]}</span><span className="validator-text"><span className="validator-message">{issue.message}</span><span className="validator-where">{issueLocation(issue)}</span></span></div>)}
              </div>;
            })}
          </section>;
        })}
      </div>
      {configure && createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfigure(false); }}><section className="modal validator-config-dialog" role="dialog" aria-modal="true" aria-labelledby="validator-config-title"><h2 id="validator-config-title">Configure Validator</h2><p>Hammer rules are configurable checks that flag common modelling problems. Model-integrity checks always run separately.</p><div className="validator-config-list">{VALIDATION_RULES.map((rule) => <label key={rule.id}><input type="checkbox" checked={config.enabled[rule.id]} onChange={(event) => setRuleEnabled(rule.id, event.target.checked)} /><span><strong>{rule.name}</strong><small>{rule.severity}</small></span></label>)}</div><footer><button className="tb-btn primary" onClick={() => setConfigure(false)}>Done</button></footer></section></div>, document.body)}
    </div>
  );
}
