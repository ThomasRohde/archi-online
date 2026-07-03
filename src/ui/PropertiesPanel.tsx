import { useEffect, useState } from 'react';
import { ELEMENT_TYPE_MAP } from '../model/metamodel';
import {
  renameItem,
  setDocumentation,
  setJunctionType,
  setNodeStyle,
  setProperties,
  setRelationshipAttrs,
  setViewpoint,
  type NodeStyle,
} from '../model/ops';
import { useStore } from '../model/store';
import type { Property } from '../model/types';
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

function ColorRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <div className="color-row">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className="tb-btn small"
          disabled={value === undefined}
          title="Reset to default"
          onClick={() => onChange(undefined)}
        >
          Default
        </button>
      </div>
    </div>
  );
}

function PropertiesTable({ target }: { target: Target }) {
  const props = target.properties ?? [];
  const commit = (next: Property[]) => setProperties(target.conceptId!, next);
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
            onCommit={(v) => commit(props.map((q, j) => (j === i ? { ...q, key: v } : q)))}
          />
          <CommitInput
            value={p.value}
            onCommit={(v) => commit(props.map((q, j) => (j === i ? { ...q, value: v } : q)))}
          />
          <button
            className="tb-btn small"
            title="Remove property"
            onClick={() => commit(props.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tb-btn add-prop" onClick={() => commit([...props, { key: '', value: '' }])}>
        + Add property
      </button>
    </div>
  );
}

function AppearanceTab({ target }: { target: Target }) {
  if (target.styleIds.length === 0) {
    return <div className="empty-hint">Select objects on a view to edit their appearance.</div>;
  }
  const apply = (style: NodeStyle) => setNodeStyle(target.styleIds, style);
  const node = target.node;
  const conn = target.connection;
  const defaultFill =
    node?.nodeType === 'element'
      ? ELEMENT_TYPE_MAP[
          (useStore.getState().model?.elements[node.elementId]?.type ?? 'BusinessActor')
        ].fill
      : '#ffffff';
  return (
    <div className="prop-form">
      {(node || target.count > 1) && (
        <>
          <ColorRow
            label="Fill color"
            value={node?.fillColor}
            fallback={defaultFill}
            onChange={(v) => apply({ fillColor: v })}
          />
          <div className="prop-row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={255}
              value={node?.alpha ?? 255}
              onChange={(e) => apply({ alpha: parseInt(e.target.value, 10) })}
            />
          </div>
        </>
      )}
      <ColorRow
        label="Line color"
        value={node?.lineColor ?? conn?.lineColor}
        fallback="#5c5c5c"
        onChange={(v) => apply({ lineColor: v })}
      />
      <ColorRow
        label="Font color"
        value={node?.fontColor ?? conn?.fontColor}
        fallback="#000000"
        onChange={(v) => apply({ fontColor: v })}
      />
      {node?.nodeType === 'element' && (
        <div className="prop-row">
          <label>Figure</label>
          <select
            value={node.figureType ?? 0}
            onChange={(e) => apply({ figureType: parseInt(e.target.value, 10) })}
          >
            <option value={0}>Default (box + icon)</option>
            <option value={1}>ArchiMate notation shape</option>
          </select>
        </div>
      )}
      {node && (
        <>
          <div className="prop-row">
            <label>Text align</label>
            <select
              value={node.textAlignment ?? 2}
              onChange={(e) => apply({ textAlignment: parseInt(e.target.value, 10) })}
            >
              <option value={1}>Left</option>
              <option value={2}>Center</option>
              <option value={4}>Right</option>
            </select>
          </div>
          <div className="prop-row">
            <label>Text position</label>
            <select
              value={node.textPosition ?? 0}
              onChange={(e) => apply({ textPosition: parseInt(e.target.value, 10) })}
            >
              <option value={0}>Top</option>
              <option value={1}>Center</option>
              <option value={2}>Bottom</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const [tab, setTab] = useState<Tab>('main');

  if (!model) return <div className="properties-panel empty-hint">No model open</div>;
  const target = resolveTarget(model, selection.source, selection.ids);
  if (!target) return <div className="properties-panel empty-hint">Nothing selected</div>;

  return (
    <div className="properties-panel">
      <div className="prop-type">{target.typeLabel}</div>
      <div className="prop-tabs">
        {(['main', 'properties', 'appearance'] as Tab[]).map((t) => (
          <button
            key={t}
            className={'prop-tab' + (tab === t ? ' active' : '')}
            onClick={() => setTab(t)}
          >
            {t === 'main' ? 'Main' : t === 'properties' ? 'Properties' : 'Appearance'}
          </button>
        ))}
      </div>
      {tab === 'main' && (
        <div className="prop-form">
          {target.count === 1 && (
            <>
              <div className="prop-row">
                <label>Name</label>
                <CommitInput
                  value={target.name ?? ''}
                  disabled={!target.nameEditable}
                  onCommit={(v) => target.conceptId && renameItem(target.conceptId, v)}
                />
              </div>
              {target.documentation !== undefined && (
                <div className="prop-row">
                  <label>Documentation</label>
                  <CommitInput
                    multiline
                    value={target.documentation}
                    onCommit={(v) => target.conceptId && setDocumentation(target.conceptId, v)}
                  />
                </div>
              )}
              {target.relationship?.type === 'AccessRelationship' && (
                <div className="prop-row">
                  <label>Access type</label>
                  <select
                    value={target.relationship.accessType ?? 0}
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
      {tab === 'properties' && <PropertiesTable target={target} />}
      {tab === 'appearance' && <AppearanceTab target={target} />}
    </div>
  );
}
