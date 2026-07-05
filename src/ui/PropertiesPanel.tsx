import { useEffect, useState } from 'react';
import {
  renameItem,
  setDocumentation,
  setJunctionType,
  setProperties,
  setRelationshipAttrs,
  setViewpoint,
} from '../model/ops';
import { useStore } from '../model/store';
import type { Property } from '../model/types';
import { AppearanceTab } from './properties/AppearanceTab';
import { conceptName, resolveTarget, type Target } from './properties/target';

type Tab = 'main' | 'properties' | 'appearance';

/** Text input that keeps local state and commits on blur/Enter. */
function CommitInput({
  value,
  onCommit,
  multiline,
  placeholder,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  if (multiline) {
    return (
      <textarea
        className="prop-input prop-doc"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className="prop-input"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function PropertiesTable({ target, readOnly }: { target: Target; readOnly: boolean }) {
  const props = target.properties ?? [];
  const commit = (next: Property[]) => {
    if (!readOnly) setProperties(target.conceptId!, next);
  };
  if (!target.conceptId) return <div className="empty-hint">No properties for this selection.</div>;
  return (
    <div className="prop-table">
      <div className="prop-table-head">
        <span>Name</span>
        <span>Value</span>
        <span />
      </div>
      {props.map((p, i) => (
        <div className="prop-table-row" key={i}>
          <CommitInput
            value={p.key}
            disabled={readOnly}
            onCommit={(v) => commit(props.map((q, j) => (j === i ? { ...q, key: v } : q)))}
          />
          <CommitInput
            value={p.value}
            disabled={readOnly}
            onCommit={(v) => commit(props.map((q, j) => (j === i ? { ...q, value: v } : q)))}
          />
          <button
            className="tb-btn small"
            title="Remove property"
            disabled={readOnly}
            onClick={() => commit(props.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="tb-btn add-prop"
        disabled={readOnly}
        onClick={() => commit([...props, { key: '', value: '' }])}
      >
        + Add property
      </button>
    </div>
  );
}

function targetTitle(target: Target): string {
  if (target.count === 1 && target.name) return `${target.name} (${target.typeLabel})`;
  return target.typeLabel;
}

export function PropertiesPanel() {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnly);
  const [tab, setTab] = useState<Tab>('main');
  useEffect(() => {
    if (readOnly && tab === 'appearance') setTab('main');
  }, [readOnly, tab]);

  if (!model) return <div className="properties-panel empty-hint">No model open</div>;
  const target = resolveTarget(model, selection.source, selection.ids);
  if (!target) return <div className="properties-panel empty-hint">Nothing selected</div>;

  return (
    <div className="properties-panel">
      <div className="prop-type">{targetTitle(target)}</div>
      <div className="prop-body">
        <div className="prop-tabs">
          {(['main', 'properties', ...(readOnly ? [] : ['appearance'])] as Tab[]).map((t) => (
            <button
              key={t}
              className={'prop-tab' + (tab === t ? ' active' : '')}
              onClick={() => setTab(t)}
            >
              {t === 'main' ? 'Main' : t === 'properties' ? 'Properties' : 'Appearance'}
            </button>
          ))}
        </div>
        <div className="prop-content">
          {tab === 'main' && (
            <div className="prop-form">
              {target.count === 1 && (
                <>
                  <div className="prop-row">
                    <label>Name</label>
                    <CommitInput
                      value={target.name ?? ''}
                      disabled={readOnly || !target.nameEditable}
                      onCommit={(v) => target.conceptId && renameItem(target.conceptId, v)}
                    />
                  </div>
                  {target.documentation !== undefined && (
                    <div className="prop-row">
                      <label>Documentation</label>
                      <CommitInput
                        multiline
                        value={target.documentation}
                        disabled={readOnly}
                        onCommit={(v) => target.conceptId && setDocumentation(target.conceptId, v)}
                      />
                    </div>
                  )}
                  {target.relationship?.type === 'AccessRelationship' && (
                    <div className="prop-row">
                      <label>Access type</label>
                      <select
                        value={target.relationship.accessType ?? 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          setRelationshipAttrs(target.relationship!.id, {
                            accessType: parseInt(e.target.value, 10),
                          })
                        }
                      >
                        <option value={0}>Write</option>
                        <option value={1}>Read</option>
                        <option value={2}>Access</option>
                        <option value={3}>Read/Write</option>
                      </select>
                    </div>
                  )}
                  {target.relationship?.type === 'InfluenceRelationship' && (
                    <div className="prop-row">
                      <label>Strength</label>
                      <CommitInput
                        value={target.relationship.strength ?? ''}
                        placeholder="e.g. ++ or --"
                        disabled={readOnly}
                        onCommit={(v) => setRelationshipAttrs(target.relationship!.id, { strength: v })}
                      />
                    </div>
                  )}
                  {target.relationship?.type === 'AssociationRelationship' && (
                    <div className="prop-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={target.relationship.directed ?? false}
                          disabled={readOnly}
                          onChange={(e) =>
                            setRelationshipAttrs(target.relationship!.id, { directed: e.target.checked })
                          }
                        />{' '}
                        Directed
                      </label>
                    </div>
                  )}
                  {target.junctionElementId && (
                    <div className="prop-row">
                      <label>Junction type</label>
                      <select
                        value={target.junctionType}
                        disabled={readOnly}
                        onChange={(e) =>
                          setJunctionType(target.junctionElementId!, e.target.value as 'and' | 'or')
                        }
                      >
                        <option value="and">And</option>
                        <option value="or">Or</option>
                      </select>
                    </div>
                  )}
                  {target.viewId && (
                    <div className="prop-row">
                      <label>Viewpoint</label>
                      <CommitInput
                        value={target.viewpoint ?? ''}
                        placeholder="e.g. layered"
                        disabled={readOnly}
                        onCommit={(v) => setViewpoint(target.viewId!, v)}
                      />
                    </div>
                  )}
                  {target.relationship && (
                    <div className="prop-hint">
                      {conceptName(model, target.relationship.sourceId)} →{' '}
                      {conceptName(model, target.relationship.targetId)}
                    </div>
                  )}
                </>
              )}
              {target.count > 1 && <div className="empty-hint">{target.typeLabel}</div>}
            </div>
          )}
          {tab === 'properties' && <PropertiesTable target={target} readOnly={readOnly} />}
          {tab === 'appearance' && !readOnly && <AppearanceTab target={target} readOnly={readOnly} />}
        </div>
      </div>
    </div>
  );
}
