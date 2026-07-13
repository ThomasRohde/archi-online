import {
  ELEMENT_TYPE_MAP,
  elementLabel,
  isElementType,
  relationshipLabel,
  type ConceptType,
  type ElementType,
  type Layer,
  type RelationshipType,
} from './metamodel';
import type { Concept, DiagramNode, ModelState, NoteNode } from './types';

export const LEGEND_FEATURE_NAME = 'legend';

export const LEGEND_DISPLAY = {
  ELEMENTS: 1,
  RELATIONS: 2,
  SPECIALIZATION_ELEMENTS: 4,
  SPECIALIZATION_RELATIONS: 8,
} as const;

export type LegendColorScheme = 0 | 1 | 2;
export type LegendSortMethod = 0 | 1;

export interface LegendOptions {
  displayElements: boolean;
  displayRelations: boolean;
  displaySpecializationElements: boolean;
  displaySpecializationRelations: boolean;
  rowsPerColumn: number;
  widthOffset: number;
  colorScheme: LegendColorScheme;
  sortMethod: LegendSortMethod;
}

export const DEFAULT_LEGEND_OPTIONS: Readonly<LegendOptions> = {
  displayElements: true,
  displayRelations: true,
  displaySpecializationElements: true,
  displaySpecializationRelations: true,
  rowsPerColumn: 15,
  widthOffset: 0,
  colorScheme: 1,
  sortMethod: 1,
};

export interface LegendPreferences {
  labels: Partial<Record<ConceptType, string>>;
  userColors: Partial<Record<ConceptType, string>>;
}

export interface LegendEntry {
  key: string;
  kind: 'element' | 'relationship';
  type: ConceptType;
  profileId?: string;
  label: string;
  iconPath?: string;
  color?: string;
  category: number;
}

export interface LegendLayoutEntry extends LegendEntry {
  x: number;
  y: number;
  column: number;
  row: number;
}

export interface LegendLayout {
  entries: LegendLayoutEntry[];
  width: number;
  height: number;
  columns: number;
}

export type MeasureLegendLabel = (label: string) => number;

const ELEMENT_CATEGORY: Record<Layer, number> = {
  strategy: 0,
  business: 1,
  application: 2,
  technology: 3,
  physical: 4,
  motivation: 5,
  implementation_migration: 6,
  other: 10,
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function normalizeLegendOptions(options: Partial<LegendOptions> = {}): LegendOptions {
  return {
    displayElements: typeof options.displayElements === 'boolean'
      ? options.displayElements
      : DEFAULT_LEGEND_OPTIONS.displayElements,
    displayRelations: typeof options.displayRelations === 'boolean'
      ? options.displayRelations
      : DEFAULT_LEGEND_OPTIONS.displayRelations,
    displaySpecializationElements: typeof options.displaySpecializationElements === 'boolean'
      ? options.displaySpecializationElements
      : DEFAULT_LEGEND_OPTIONS.displaySpecializationElements,
    displaySpecializationRelations: typeof options.displaySpecializationRelations === 'boolean'
      ? options.displaySpecializationRelations
      : DEFAULT_LEGEND_OPTIONS.displaySpecializationRelations,
    rowsPerColumn: clampInteger(
      options.rowsPerColumn,
      DEFAULT_LEGEND_OPTIONS.rowsPerColumn,
      1,
      100,
    ),
    widthOffset: clampInteger(options.widthOffset, DEFAULT_LEGEND_OPTIONS.widthOffset, -200, 200),
    colorScheme: clampInteger(
      options.colorScheme,
      DEFAULT_LEGEND_OPTIONS.colorScheme,
      0,
      2,
    ) as LegendColorScheme,
    sortMethod: clampInteger(
      options.sortMethod,
      DEFAULT_LEGEND_OPTIONS.sortMethod,
      0,
      1,
    ) as LegendSortMethod,
  };
}

function integerField(value: string, name: string, fallback: number): number {
  const match = new RegExp(`${name}=\\s*(-?\\d+)\\s*`).exec(value);
  if (!match) return fallback;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647
    ? parsed
    : fallback;
}

export function parseLegendFeature(value: string): LegendOptions {
  const display = integerField(value, 'display', 15);
  return normalizeLegendOptions({
    displayElements: (display & LEGEND_DISPLAY.ELEMENTS) !== 0,
    displayRelations: (display & LEGEND_DISPLAY.RELATIONS) !== 0,
    displaySpecializationElements: (display & LEGEND_DISPLAY.SPECIALIZATION_ELEMENTS) !== 0,
    displaySpecializationRelations: (display & LEGEND_DISPLAY.SPECIALIZATION_RELATIONS) !== 0,
    rowsPerColumn: integerField(value, 'rows', DEFAULT_LEGEND_OPTIONS.rowsPerColumn),
    widthOffset: integerField(value, 'offset', DEFAULT_LEGEND_OPTIONS.widthOffset),
    colorScheme: integerField(value, 'color', DEFAULT_LEGEND_OPTIONS.colorScheme) as LegendColorScheme,
    sortMethod: integerField(value, 'sort', DEFAULT_LEGEND_OPTIONS.sortMethod) as LegendSortMethod,
  });
}

export function serializeLegendFeature(input: Partial<LegendOptions>): string {
  const options = normalizeLegendOptions(input);
  let display = options.displayElements ? LEGEND_DISPLAY.ELEMENTS : 0;
  display |= options.displayRelations ? LEGEND_DISPLAY.RELATIONS : 0;
  display |= options.displaySpecializationElements ? LEGEND_DISPLAY.SPECIALIZATION_ELEMENTS : 0;
  display |= options.displaySpecializationRelations ? LEGEND_DISPLAY.SPECIALIZATION_RELATIONS : 0;
  return `display=${display},rows=${options.rowsPerColumn},offset=${options.widthOffset},color=${options.colorScheme},sort=${options.sortMethod}`;
}

export function isLegendNote(node: DiagramNode | undefined): node is NoteNode & {
  legendOptions: LegendOptions;
} {
  return node?.nodeType === 'note' && node.legendOptions !== undefined;
}

function coreColor(type: ConceptType): string {
  return isElementType(type) ? ELEMENT_TYPE_MAP[type].fill : '#ffffff';
}

function conceptCategory(type: ConceptType): number {
  return isElementType(type) ? ELEMENT_CATEGORY[ELEMENT_TYPE_MAP[type].layer] : 50;
}

function conceptLabel(type: ConceptType): string {
  return isElementType(type)
    ? elementLabel(type as ElementType)
    : `${relationshipLabel(type as RelationshipType)} relation`;
}

function visibleFor(options: LegendOptions, concept: Concept, specialized: boolean): boolean {
  if (concept.kind === 'element') {
    return specialized ? options.displaySpecializationElements : options.displayElements;
  }
  return specialized ? options.displaySpecializationRelations : options.displayRelations;
}

export function deriveLegendEntries(
  state: ModelState,
  legendId: string,
  preferences: LegendPreferences,
): LegendEntry[] {
  const note = state.nodes[legendId];
  if (!isLegendNote(note)) return [];
  const options = normalizeLegendOptions(note.legendOptions);
  const entries = new Map<string, LegendEntry>();
  const reachableNodes = new Set<string>();
  const reachableConnections = new Set<string>();

  const visitConnection = (connectionId: string) => {
    if (reachableConnections.has(connectionId)) return;
    const connection = state.connections[connectionId];
    if (!connection || connection.viewId !== note.viewId) return;
    reachableConnections.add(connectionId);
    connection.sourceConnectionIds.forEach(visitConnection);
  };
  const visitNode = (nodeId: string) => {
    if (reachableNodes.has(nodeId)) return;
    const node = state.nodes[nodeId];
    if (!node || node.viewId !== note.viewId) return;
    reachableNodes.add(nodeId);
    node.childIds.forEach(visitNode);
    node.sourceConnectionIds.forEach(visitConnection);
  };
  state.views[note.viewId]?.childIds.forEach(visitNode);

  const addConcept = (concept: Concept | undefined) => {
    if (!concept) return;
    const profileId = concept.profileIds[0];
    const profile = profileId ? state.profiles[profileId] : undefined;
    const specialized = profile !== undefined;
    if (!visibleFor(options, concept, specialized)) return;
    const key = specialized ? `profile:${profile.id}` : `type:${concept.type}`;
    if (entries.has(key)) return;
    const builtInColor = coreColor(concept.type);
    const color = options.colorScheme === 0
      ? undefined
      : options.colorScheme === 2 && concept.kind === 'element'
        ? preferences.userColors[concept.type] ?? builtInColor
        : builtInColor;
    entries.set(key, {
      key,
      kind: concept.kind,
      type: concept.type,
      ...(profile
        ? {
            profileId: profile.id,
            label: profile.name,
            iconPath: profile.imagePath,
          }
        : {
            label: preferences.labels[concept.type]?.trim() || conceptLabel(concept.type),
          }),
      color,
      category: conceptCategory(concept.type),
    });
  };

  for (const nodeId of reachableNodes) {
    const node = state.nodes[nodeId];
    if (node.nodeType !== 'element') continue;
    addConcept(state.elements[node.elementId]);
  }
  for (const connectionId of reachableConnections) {
    const connection = state.connections[connectionId];
    if (!connection.relationshipId) continue;
    addConcept(state.relationships[connection.relationshipId]);
  }

  return [...entries.values()].sort((a, b) => {
    const bucketA = a.kind === 'relationship' ? 50 : options.sortMethod === 0 ? 0 : a.category;
    const bucketB = b.kind === 'relationship' ? 50 : options.sortMethod === 0 ? 0 : b.category;
    return bucketA - bucketB || a.label.localeCompare(b.label);
  });
}

export function layoutLegendEntries(
  entries: LegendEntry[],
  input: Partial<LegendOptions>,
  measure: MeasureLegendLabel = (label) => label.length * 7,
  fontHeight = 22,
): LegendLayout {
  const options = normalizeLegendOptions(input);
  if (entries.length === 0) return { entries: [], width: 0, height: 0, columns: 0 };
  const rowHeight = Math.max(22, fontHeight);
  const columns = Math.ceil(entries.length / options.rowsPerColumn);
  const columnWidths = Array.from({ length: columns }, (_, column) => {
    const labels = entries
      .slice(column * options.rowsPerColumn, (column + 1) * options.rowsPerColumn)
      .map((entry) => measure(entry.label));
    return Math.max(0, ...labels) + 31;
  });
  const columnX: number[] = [];
  let x = 5;
  for (let column = 0; column < columns; column++) {
    columnX.push(x);
    x += columnWidths[column] + (column < columns - 1 ? options.widthOffset : 0);
  }
  const laidOut = entries.map((entry, index) => {
    const column = Math.floor(index / options.rowsPerColumn);
    const row = index % options.rowsPerColumn;
    return { ...entry, column, row, x: columnX[column], y: 5 + row * rowHeight };
  });
  return {
    entries: laidOut,
    width: Math.ceil(x),
    height: Math.min(options.rowsPerColumn, entries.length) * rowHeight + 10,
    columns,
  };
}

export function legendOptimalSize(
  state: ModelState,
  legendId: string,
  preferences: LegendPreferences,
  measure?: MeasureLegendLabel,
  fontHeight?: number,
): LegendLayout {
  const note = state.nodes[legendId];
  if (!isLegendNote(note)) return { entries: [], width: 0, height: 0, columns: 0 };
  const layout = layoutLegendEntries(
    deriveLegendEntries(state, legendId, preferences),
    note.legendOptions,
    measure,
    fontHeight,
  );
  return layout.columns > 0
    ? layout
    : { ...layout, width: 210, height: 320 };
}
