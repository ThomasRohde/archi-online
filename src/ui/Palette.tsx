import type { ReactNode } from 'react';
import { StandaloneIcon } from '../canvas/figures/icons';
import {
  C4_ELEMENT_KIND_LABELS,
  C4_PALETTE_KINDS,
  C4_PROPERTY_KEYS,
  c4ViewType,
  type C4ElementKind,
} from '../model/c4';
import {
  ELEMENT_TYPES,
  LAYERS,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from '../model/metamodel';
import { setActiveTool, useStore, type Tool } from '../model/store';

interface C4PaletteEntry {
  kind: C4ElementKind;
  title: string;
  properties?: Record<string, string>;
}

type C4PaletteIcon = C4ElementKind | 'database';

const C4_TOOLBOX: C4PaletteEntry[] = [
  ...C4_PALETTE_KINDS.map((kind) => ({
    kind,
    title: `C4 ${C4_ELEMENT_KIND_LABELS[kind]}`,
  })),
  {
    kind: 'container',
    title: 'C4 Database',
    properties: { [C4_PROPERTY_KEYS.tags]: 'database' },
  },
];

function isDatabaseEntry(entry: C4PaletteEntry): boolean {
  return entry.properties?.[C4_PROPERTY_KEYS.tags]?.toLowerCase().split(/[,\s]+/).includes('database') ?? false;
}

function c4PaletteIcon(entry: C4PaletteEntry): C4PaletteIcon {
  return isDatabaseEntry(entry) ? 'database' : entry.kind;
}

function C4PaletteGlyph({ icon }: { icon: C4PaletteIcon }) {
  const fill = icon === 'person' ? '#08427B' : '#1168BD';
  const stroke = icon === 'person' ? '#052E56' : '#0D4F91';
  const white = '#fff';
  switch (icon) {
    case 'person':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <circle cx="9" cy="4.2" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <path d="M9 6.8 V12.2 M5.2 9 H12.8 M9 12.2 L5.8 16 M9 12.2 L12.2 16" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'software-system':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <rect x="2.2" y="3.2" width="13.6" height="11.6" rx="1.8" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <path d="M5 6.2 H13 M5 9 H10.8" stroke={white} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'container':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <rect x="2.4" y="4" width="13.2" height="10" rx="1.8" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <path d="M2.8 7 H15.2" stroke={white} strokeWidth="1.2" />
          <rect x="5" y="9.2" width="3.2" height="2.8" rx="0.5" fill={white} opacity="0.9" />
        </svg>
      );
    case 'component':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <rect x="5.2" y="3" width="10" height="12" rx="1.6" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <rect x="2.6" y="5.2" width="4.6" height="2.8" rx="0.5" fill={white} stroke={stroke} strokeWidth="1" />
          <rect x="2.6" y="10" width="4.6" height="2.8" rx="0.5" fill={white} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case 'deployment-node':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <path d="M4 5.5 L7 2.8 H14 V12.5 L11 15.2 H4 Z" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <path d="M4 5.5 H11 V15.2 M11 5.5 L14 2.8 M11 5.5 V15.2" fill="none" stroke={white} strokeWidth="1.1" opacity="0.95" />
        </svg>
      );
    case 'infrastructure-node':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <path d="M6.2 13.8 H13.1 C15 13.8 16 12.7 16 11.2 C16 9.7 14.8 8.6 13.3 8.7 C12.7 6.1 10.8 4.2 8.2 4.2 C5.6 4.2 3.7 6 3.5 8.4 C2.1 8.8 1.4 9.8 1.4 11.1 C1.4 12.8 2.7 13.8 4.5 13.8 Z" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <path d="M6 10.8 H11.8" stroke={white} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'database':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <path d="M4 5.2 C4 3.7 14 3.7 14 5.2 V13 C14 14.5 4 14.5 4 13 Z" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <ellipse cx="9" cy="5.2" rx="5" ry="1.8" fill={white} stroke={stroke} strokeWidth="1.1" />
          <path d="M4 9 C4 10.5 14 10.5 14 9" fill="none" stroke={white} strokeWidth="1.1" opacity="0.95" />
        </svg>
      );
    case 'software-system-instance':
    case 'container-instance':
      return (
        <svg data-c4-palette-icon={icon} viewBox="0 0 18 18" width="16" height="16">
          <rect x="3" y="5" width="10" height="9" rx="1.6" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <rect x="5" y="3" width="10" height="9" rx="1.6" fill="none" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
  }
}

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
  if ('c4Kind' in a && 'c4Kind' in b) {
    return (
      a.c4Kind === b.c4Kind &&
      JSON.stringify(a.c4Properties ?? {}) === JSON.stringify(b.c4Properties ?? {})
    );
  }
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
  const activeC4ViewType = useStore((s) => {
    if (!s.model || !s.activeViewId) return undefined;
    return c4ViewType(s.model.views[s.activeViewId]);
  });
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
      {activeC4ViewType && (
        <div className="pal-layer">
          <div className="pal-sep" title="C4" />
          {C4_TOOLBOX.map((entry, index) => (
            <ToolButton
              key={`${entry.title}-${index}`}
              tool={{
                kind: 'create-c4-element',
                c4Kind: entry.kind,
                ...(entry.properties ? { c4Properties: entry.properties } : {}),
              }}
              title={entry.title}
            >
              <span className="pal-el c4-pal-el">
                <C4PaletteGlyph icon={c4PaletteIcon(entry)} />
              </span>
            </ToolButton>
          ))}
        </div>
      )}
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
            {defs.map((d) => {
              const isJunction = d.type === 'Junction';
              return (
                <ToolButton
                  key={d.type}
                  tool={{ kind: 'create-element', type: d.type }}
                  title={`${d.label} (${label})`}
                >
                  <span
                    className={'pal-el' + (isJunction ? ' pal-junction-el' : '')}
                    data-palette-element={d.type}
                    style={{ background: isJunction ? 'transparent' : d.fill, color: isJunction ? '#111' : '#333' }}
                  >
                    <StandaloneIcon type={d.type} size={15} />
                  </span>
                </ToolButton>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
