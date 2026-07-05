// Mappings between our model types and the ArchiMate Open Exchange format,
// ported from Archi's org.opengroup.archimate.xmlexchange plugin
// (XMLTypeMapper.java, IXMLExchangeGlobals.java). Do not invent mappings —
// change this file only to track changes in Archi's implementation.

import {
  ELEMENT_TYPE_MAP,
  isElementType,
  isRelationshipType,
  type ElementType,
  type RelationshipType,
} from '../../metamodel';
import type { ArchimateElement, DiagramNode } from '../../types';

export const EXCHANGE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
export const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
export const EXCHANGE_SCHEMA_LOCATION =
  'http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd';

/** Exchange ids must be NCNames; Archi prefixes ids starting with a digit. */
export function exchangeId(id: string): string {
  return /^\d/.test(id) ? `id-${id}` : id;
}

/** Our concept type → exchange xsi:type. Relationships drop the suffix;
 * Junction splits into AndJunction/OrJunction. */
export function conceptTypeToExchange(
  type: ElementType | RelationshipType,
  junctionType?: 'and' | 'or',
): string {
  if (type === 'Junction') return junctionType === 'or' ? 'OrJunction' : 'AndJunction';
  if (isRelationshipType(type)) return type.replace(/Relationship$/, '');
  return type;
}

export interface ExchangeConceptType {
  kind: 'element' | 'relationship';
  type: ElementType | RelationshipType;
  junctionType?: 'and' | 'or';
}

/** Exchange xsi:type → our concept type, or null for unknown types. */
export function exchangeTypeToConcept(type: string): ExchangeConceptType | null {
  if (type === 'AndJunction') return { kind: 'element', type: 'Junction', junctionType: 'and' };
  if (type === 'OrJunction') return { kind: 'element', type: 'Junction', junctionType: 'or' };
  if (isElementType(type)) return { kind: 'element', type };
  const relType = `${type}Relationship`;
  if (isRelationshipType(relType)) return { kind: 'relationship', type: relType };
  return null;
}

/** Archi viewpoint id ↔ exchange viewpoint name (XMLTypeMapper table). */
export const VIEWPOINT_ID_TO_NAME: Record<string, string> = {
  organization: 'Organization',
  information_structure: 'Information Structure',
  technology: 'Technology',
  layered: 'Layered',
  physical: 'Physical',
  product: 'Product',
  application_structure: 'Application Structure',
  application_usage: 'Application Usage',
  technology_usage: 'Technology Usage',
  business_process_cooperation: 'Business Process Cooperation',
  application_cooperation: 'Application Cooperation',
  service_realization: 'Service Realization',
  implementation_deployment: 'Implementation and Deployment',
  goal_realization: 'Goal Realization',
  requirements_realization: 'Requirements Realization',
  motivation: 'Motivation',
  strategy: 'Strategy',
  capability: 'Capability Map',
  outcome_realization: 'Outcome Realization',
  resource: 'Resource Map',
  project: 'Project',
  migration: 'Migration',
  implementation_migration: 'Implementation and Migration',
  stakeholder: 'Stakeholder',
  value_stream: 'Value Stream',
};

export function viewpointNameToId(name: string): string {
  for (const [id, n] of Object.entries(VIEWPOINT_ID_TO_NAME)) {
    if (n === name) return id;
  }
  return '';
}

/** AccessRelationship accessType (our 0=write 1=read 2=none 3=read/write). */
export function accessTypeToExchange(accessType: number | undefined): string {
  switch (accessType) {
    case 1:
      return 'Read';
    case 3:
      return 'ReadWrite';
    case 2:
      return 'Access';
    default:
      return 'Write';
  }
}

export function exchangeToAccessType(value: string): number {
  switch (value) {
    case 'Access':
      return 2;
    case 'Read':
      return 1;
    case 'ReadWrite':
      return 3;
    default:
      return 0;
  }
}

// ---- colors --------------------------------------------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Alpha 0-255 (ours) → exchange opacity 0-100, per Archi's exporter. */
export function alphaToExchange(alpha: number | undefined): number {
  return Math.round(((alpha ?? 255) / 255) * 100);
}

/** Exchange opacity 0-100 → our 0-255, per Archi's importer. */
export function exchangeToAlpha(a: number): number {
  return Math.round((a * 255) / 100);
}

// ---- fonts ---------------------------------------------------------------

export const DEFAULT_FONT_NAME = 'Segoe UI';
export const DEFAULT_FONT_SIZE = 9;

/** Read name/size(pt)/style out of an SWT FontData string ("1|name|size|style|…"). */
export function parseFontString(font: string | undefined): {
  name: string;
  size: number;
  bold: boolean;
  italic: boolean;
} {
  if (font) {
    const parts = font.split('|');
    if (parts.length >= 4) {
      const style = parseInt(parts[3], 10) || 0;
      return {
        name: parts[1] || DEFAULT_FONT_NAME,
        size: Math.round(parseFloat(parts[2])) || DEFAULT_FONT_SIZE,
        bold: (style & 1) !== 0,
        italic: (style & 2) !== 0,
      };
    }
  }
  return { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE, bold: false, italic: false };
}

/** Build a minimal SWT FontData string our renderer and Archi both accept. */
export function buildFontString(name: string, size: number, bold: boolean, italic: boolean): string {
  const style = (bold ? 1 : 0) | (italic ? 2 : 0);
  return `1|${name}|${size}|${style}|`;
}

// ---- default styles (what the canvas actually renders when unset) ---------

export const DEFAULT_LINE_COLOR = '#5c5c5c';
export const DEFAULT_FONT_COLOR = '#000000';

/** The concrete fill the canvas renders for a node with no explicit fill —
 * the exchange format always writes concrete style values. */
export function defaultNodeFill(node: DiagramNode, element: ArchimateElement | undefined): string {
  switch (node.nodeType) {
    case 'note':
      return '#ffffff';
    case 'group':
      return '#d2d7dd';
    case 'ref':
      return '#dcebeb';
    case 'element':
      if (element?.type === 'Junction') return '#000000';
      return element ? ELEMENT_TYPE_MAP[element.type].fill : '#ffffff';
  }
}
