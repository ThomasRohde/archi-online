import type { ReactNode } from 'react';
import { StandaloneIcon } from '../canvas/figures/icons';
import {
  ELEMENT_TYPES,
  LAYERS,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from '../model/metamodel';
import { setActiveTool, useStore, type Tool } from '../model/store';

function relGlyph(type: RelationshipType): ReactNode {
  const line = (dash?: string, x1 = 3, x2 = 21) => (
    <line x1={x1} y1={9} x2={x2} y2={9} stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
  );
  switch (type) {
    case 'CompositionRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line(undefined, 10)}
          <path d="M2,9 L6,6.5 L10,9 L6,11.5 Z" fill="currentColor" />
        </svg>
      );
    case 'AggregationRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line(undefined, 10)}
          <path d="M2,9 L6,6.5 L10,9 L6,11.5 Z" fill="#fff" stroke="currentColor" />
        </svg>
      );
    case 'AssignmentRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line()}
          <circle cx="4" cy="9" r="2" fill="currentColor" />
          <path d="M21,9 L15,6 V12 Z" fill="currentColor" />
        </svg>
      );
    case 'RealizationRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line('2 2', 3, 14)}
          <path d="M21,9 L14,5.5 V12.5 Z" fill="#fff" stroke="currentColor" />
        </svg>
      );
    case 'ServingRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line()}
          <path d="M16,5 L21,9 L16,13" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'AccessRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line('2 2')}
          <path d="M17,6 L21,9 L17,12" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
    case 'InfluenceRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line('5 3')}
          <path d="M16,5 L21,9 L16,13" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'TriggeringRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line()}
          <path d="M21,9 L15,6 V12 Z" fill="currentColor" />
        </svg>
      );
    case 'FlowRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line('5 3', 3, 15)}
          <path d="M21,9 L15,6 V12 Z" fill="currentColor" />
        </svg>
      );
    case 'SpecializationRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line(undefined, 3, 14)}
          <path d="M21,9 L14,5.5 V12.5 Z" fill="#fff" stroke="currentColor" />
        </svg>
      );
    case 'AssociationRelationship':
      return (
        <svg viewBox="0 0 24 18" width="22" height="17">
          {line()}
        </svg>
      );
  }
}

function toolEq(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false;
  if ('type' in a && 'type' in b) return a.type === b.type;
  return true;
}

function ToolButton({ tool, title, children }: { tool: Tool; title: string; children: ReactNode }) {
  const active = useStore((s) => toolEq(s.activeTool, tool));
  return (
    <button
      className={'pal-btn' + (active ? ' active' : '')}
      title={title}
      onClick={() => setActiveTool(active ? { kind: 'select' } : tool)}
    >
      {children}
    </button>
  );
}

export function Palette() {
  return (
    <div className="palette">
      <ToolButton tool={{ kind: 'select' }} title="Select / move (Esc)">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M4,1.5 L12,8.5 L8.2,9 L10.3,13.6 L8.4,14.5 L6.3,9.8 L3.8,12 Z" fill="currentColor" />
        </svg>
      </ToolButton>
      <ToolButton tool={{ kind: 'magic-connector' }} title="Magic connector — pick a valid relationship after drawing">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M2,14 L9,7" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M9,2 l1.2,2.6 2.8,.4 -2,2 .5,2.8 -2.5,-1.3 -2.5,1.3 .5,-2.8 -2,-2 2.8,-.4 Z" fill="currentColor" />
        </svg>
      </ToolButton>
      <div className="pal-sep" />
      {RELATIONSHIP_TYPES.map((r) => (
        <ToolButton key={r.type} tool={{ kind: 'create-relationship', type: r.type }} title={r.label}>
          {relGlyph(r.type)}
        </ToolButton>
      ))}
      <div className="pal-sep" />
      <ToolButton tool={{ kind: 'create-note' }} title="Note">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M2.5,2.5 H13.5 V10 L10,13.5 H2.5 Z M13.5,10 H10 V13.5" fill="none" stroke="currentColor" />
        </svg>
      </ToolButton>
      <ToolButton tool={{ kind: 'create-group' }} title="Group">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M2,5 V2.5 H8 V5 M2,5 V13.5 H14 V5 H2" fill="none" stroke="currentColor" />
        </svg>
      </ToolButton>
      {LAYERS.map(({ layer, label }) => {
        const defs = ELEMENT_TYPES.filter((d) => d.layer === layer);
        if (defs.length === 0) return null;
        return (
          <div key={layer} className="pal-layer">
            <div className="pal-sep" title={label} />
            {defs.map((d) => (
              <ToolButton
                key={d.type}
                tool={{ kind: 'create-element', type: d.type }}
                title={`${d.label} (${label})`}
              >
                <span className="pal-el" style={{ background: d.fill, color: '#333' }}>
                  <StandaloneIcon type={d.type} size={15} />
                </span>
              </ToolButton>
            ))}
          </div>
        );
      })}
    </div>
  );
}
