import { useEffect, useState } from 'react';
import {
  C4_ELEMENT_KIND_LABELS,
  C4_ELEMENT_KINDS,
  C4_PROPERTY_KEYS,
  C4_VIEW_TYPE_LABELS,
  C4_VIEW_TYPES,
  c4KindForConcept,
  c4PropertyValue,
  c4ViewType,
  setC4PropertyValue,
} from '../model/c4';
import { VIEWPOINTS } from '../model/data/viewpoints';
import {
  renameItem,
  profilesForConceptType,
  setConceptProfiles,
  setDocumentation,
  setJunctionType,
  setProperties,
  setPlainConnectionAttributes,
  setRelationshipAttrs,
  setViewConnectionRouterType,
  setViewpoint,
} from '../model/ops';
import { useModelStoreApi, useStore } from './store-hooks';
import type { ModelState, Property } from '../model/types';
import { AppearanceTab } from './properties/AppearanceTab';
import { AnalysisTab } from './properties/AnalysisTab';
import { ImageTab } from './properties/ImageTab';
import { LabelTab } from './properties/LabelTab';
import { conceptName, resolveTarget, type Target } from './properties/target';

// Well-known viewpoints for the picker, sorted by their friendly display name.
const VIEWPOINTS_BY_NAME = [...VIEWPOINTS].sort((a, b) => a.name.localeCompare(b.name));

type Tab = 'main' | 'properties' | 'analysis' | 'appearance' | 'label' | 'image';

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
  const modelStore = useModelStoreApi();
  const props = target.properties ?? [];
  const commit = (next: Property[]) => {
    if (!readOnly) setProperties(target.conceptId!, next, modelStore);
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

function C4Fields({
  model,
  target,
  readOnly,
}: {
  model: ModelState;
  target: Target;
  readOnly: boolean;
}) {
  const modelStore = useModelStoreApi();
  if (target.count !== 1 || !target.conceptId || !target.properties) return null;
  const element = model.elements[target.conceptId];
  const relationship = model.relationships[target.conceptId];
  const view = model.views[target.conceptId];
  if (!element && !relationship && !view) return null;

  const commit = (key: string, value: string | undefined) => {
    if (readOnly) return;
    setProperties(
      target.conceptId!,
      setC4PropertyValue(target.properties ?? [], key, value),
      modelStore,
    );
  };
  const technology = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.technology) ?? '';
  const tags = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.tags) ?? '';
  const external = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.external) === 'true';
  const instanceOf = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.instanceOf) ?? '';
  const order = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.order) ?? '';
  const scopeId = c4PropertyValue(target.properties, C4_PROPERTY_KEYS.scopeId) ?? '';

  return (
    <div className="prop-section">
      <div className="prop-section-title">C4 Profile</div>
      {element && (
        <>
          <div className="prop-row">
            <label>C4 type</label>
            <select
              value={c4KindForConcept(element) ?? ''}
              disabled={readOnly}
              onChange={(e) => commit(C4_PROPERTY_KEYS.kind, e.target.value)}
            >
              <option value="">None</option>
              {C4_ELEMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {C4_ELEMENT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="prop-row">
            <label>Technology</label>
            <CommitInput
              value={technology}
              placeholder="e.g. React, PostgreSQL, HTTPS"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.technology, v)}
            />
          </div>
          <div className="prop-row">
            <label>Tags</label>
            <CommitInput
              value={tags}
              placeholder="e.g. database, external"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.tags, v)}
            />
          </div>
          <div className="prop-row">
            <label>Instance of</label>
            <CommitInput
              value={instanceOf}
              placeholder="Referenced C4 element name or id"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.instanceOf, v)}
            />
          </div>
          <div className="prop-row">
            <label>
              <input
                type="checkbox"
                checked={external}
                disabled={readOnly}
                onChange={(e) =>
                  commit(C4_PROPERTY_KEYS.external, e.target.checked ? 'true' : undefined)
                }
              />{' '}
              External
            </label>
          </div>
        </>
      )}
      {relationship && (
        <>
          <div className="prop-row">
            <label>Technology</label>
            <CommitInput
              value={technology}
              placeholder="e.g. HTTPS/JSON"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.technology, v)}
            />
          </div>
          <div className="prop-row">
            <label>Dynamic order</label>
            <CommitInput
              value={order}
              placeholder="e.g. 1"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.order, v)}
            />
          </div>
        </>
      )}
      {view && (
        <>
          <div className="prop-row">
            <label>C4 view</label>
            <select
              value={c4ViewType(view) ?? ''}
              disabled={readOnly}
              onChange={(e) => commit(C4_PROPERTY_KEYS.viewType, e.target.value)}
            >
              <option value="">None</option>
              {C4_VIEW_TYPES.map((viewType) => (
                <option key={viewType} value={viewType}>
                  {C4_VIEW_TYPE_LABELS[viewType]}
                </option>
              ))}
            </select>
          </div>
          <div className="prop-row">
            <label>Scope id</label>
            <CommitInput
              value={scopeId}
              placeholder="Element id/name that scopes this view"
              disabled={readOnly}
              onCommit={(v) => commit(C4_PROPERTY_KEYS.scopeId, v)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const modelStore = useModelStoreApi();
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnly);
  const [tab, setTab] = useState<Tab>('main');
  const target = model ? resolveTarget(model, selection.source, selection.ids) : null;
  const supportsAnalysis = Boolean(
    model &&
      target?.count === 1 &&
      target.conceptId &&
      (model.elements[target.conceptId] || model.relationships[target.conceptId]),
  );
  const supportsImage = Boolean(target?.count === 1 && target.node);
  const labelObjectId = target?.count === 1
    ? target.node?.id ?? target.connection?.id ?? (target.conceptId && model?.folders[target.conceptId] ? target.conceptId : undefined)
    : undefined;
  useEffect(() => {
    if ((readOnly && tab === 'appearance') || (tab === 'analysis' && !supportsAnalysis)) {
      setTab('main');
    }
  }, [readOnly, supportsAnalysis, tab]);

  if (!model) return <div className="properties-panel empty-hint">No model open</div>;
  if (!target) return <div className="properties-panel empty-hint">Nothing selected</div>;

  return (
    <div className="properties-panel">
      <div className="prop-type">{targetTitle(target)}</div>
      <div className="prop-body">
        <div className="prop-tabs">
          {([
            'main',
            'properties',
            ...(supportsAnalysis ? ['analysis'] : []),
            ...(readOnly ? [] : ['appearance']),
            ...(labelObjectId ? ['label'] : []),
            ...(supportsImage ? ['image'] : []),
          ] as Tab[]).map((t) => (
            <button
              key={t}
              className={'prop-tab' + (tab === t ? ' active' : '')}
              onClick={() => setTab(t)}
            >
              {t === 'main'
                ? 'Main'
                : t === 'properties'
                  ? 'Properties'
                  : t === 'analysis'
                  ? 'Analysis'
                    : t === 'appearance'
                      ? 'Appearance'
                      : t === 'label'
                        ? 'Label'
                      : 'Image'}
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
                      onCommit={(v) =>
                        target.conceptId && renameItem(target.conceptId, v, modelStore)
                      }
                    />
                  </div>
                  {target.documentation !== undefined && (
                    <div className="prop-row">
                      <label>Documentation</label>
                      <CommitInput
                        multiline
                        value={target.documentation}
                        disabled={readOnly}
                        onCommit={(v) =>
                          target.conceptId && setDocumentation(target.conceptId, v, modelStore)
                        }
                      />
                    </div>
                  )}
                  {target.connection?.connType === 'plain' && (
                    <div className="prop-row">
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Show connection label"
                          checked={target.connection.nameVisible !== false}
                          disabled={readOnly}
                          onChange={(event) =>
                            setPlainConnectionAttributes(
                              target.connection!.id,
                              { nameVisible: event.target.checked },
                              modelStore,
                            )
                          }
                        />{' '}
                        Show label
                      </label>
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
                          }, modelStore)
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
                        onCommit={(v) =>
                          setRelationshipAttrs(target.relationship!.id, { strength: v }, modelStore)
                        }
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
                            setRelationshipAttrs(
                              target.relationship!.id,
                              { directed: e.target.checked },
                              modelStore,
                            )
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
                          setJunctionType(
                            target.junctionElementId!,
                            e.target.value as 'and' | 'or',
                            modelStore,
                          )
                        }
                      >
                        <option value="and">And</option>
                        <option value="or">Or</option>
                      </select>
                    </div>
                  )}
                  {target.viewId && (
                    <>
                      <div className="prop-row">
                        <label>Viewpoint</label>
                        <select
                          value={target.viewpoint ?? ''}
                          disabled={readOnly}
                          onChange={(e) => setViewpoint(target.viewId!, e.target.value, modelStore)}
                        >
                          <option value="">None</option>
                          {target.viewpoint &&
                            !VIEWPOINTS_BY_NAME.some((vp) => vp.id === target.viewpoint) && (
                              <option value={target.viewpoint}>{target.viewpoint} (unknown)</option>
                            )}
                          {VIEWPOINTS_BY_NAME.map((vp) => (
                            <option key={vp.id} value={vp.id}>
                              {vp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="prop-row">
                        <label htmlFor={`connection-router-${target.viewId}`}>Connection router</label>
                        <select
                          id={`connection-router-${target.viewId}`}
                          aria-label="Connection router"
                          value={model.views[target.viewId]?.connectionRouterType ?? 0}
                          disabled={readOnly}
                          onChange={(event) =>
                            setViewConnectionRouterType(
                              target.viewId!,
                              event.target.value === '2' ? 2 : 0,
                              modelStore,
                            )
                          }
                        >
                          <option value={0}>Manual</option>
                          <option value={2}>Manhattan</option>
                        </select>
                      </div>
                    </>
                  )}
                  {target.relationship && (
                    <div className="prop-hint">
                      {conceptName(model, target.relationship.sourceId)} →{' '}
                      {conceptName(model, target.relationship.targetId)}
                    </div>
                  )}
                  {target.conceptId &&
                    (model.elements[target.conceptId] || model.relationships[target.conceptId]) && (() => {
                      const concept = model.elements[target.conceptId!] ?? model.relationships[target.conceptId!];
                      const available = profilesForConceptType(model, concept.type);
                      return (
                        <div className="prop-row">
                          <label>Specialization</label>
                          <select
                            aria-label="Specialization"
                            value={concept.profileIds[0] ?? ''}
                            disabled={readOnly}
                            onChange={(event) => {
                              const selected = event.target.value;
                              const remaining = concept.profileIds.slice(1).filter((id) => id !== selected);
                              setConceptProfiles(
                                concept.id,
                                selected ? [selected, ...remaining] : remaining,
                                modelStore,
                              );
                            }}
                          >
                            <option value="">None</option>
                            {available.map((profile) => (
                              <option key={profile.id} value={profile.id}>{profile.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  <C4Fields model={model} target={target} readOnly={readOnly} />
                </>
              )}
              {target.count > 1 && <div className="empty-hint">{target.typeLabel}</div>}
            </div>
          )}
          {tab === 'properties' && <PropertiesTable target={target} readOnly={readOnly} />}
          {tab === 'analysis' && supportsAnalysis && target.conceptId && (
            <AnalysisTab model={model} conceptId={target.conceptId} />
          )}
          {tab === 'appearance' && !readOnly && <AppearanceTab target={target} readOnly={readOnly} />}
          {tab === 'label' && labelObjectId && <LabelTab model={model} objectId={labelObjectId} readOnly={readOnly} />}
          {tab === 'image' && supportsImage && <ImageTab target={target} readOnly={readOnly} />}
        </div>
      </div>
    </div>
  );
}
