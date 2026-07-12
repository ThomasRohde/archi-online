// CSV writer, ported from Archi's CSVExporter.java: three files with the
// exact headers, the model itself as the first elements row, per-folder
// sorted concepts, and special attributes written as pseudo-properties.

import type { ArchimateElement, ArchimateRelationship, Folder, ModelState } from '../../types';
import {
  ACCESS_TYPE,
  ACCESS_TYPES,
  ARCHIMATE_MODEL_TYPE,
  ASSOCIATION_DIRECTED,
  CRLF,
  CSV_FILE_EXTENSION,
  ELEMENTS_FILENAME,
  INFLUENCE_STRENGTH,
  JUNCTION_AND,
  JUNCTION_OR,
  JUNCTION_TYPE,
  MODEL_ELEMENTS_HEADER,
  PROPERTIES_FILENAME,
  PROPERTIES_HEADER,
  RELATIONS_FILENAME,
  RELATIONSHIPS_HEADER,
  type CsvDelimiter,
} from './constants';

export interface CsvExportOptions {
  delimiter?: CsvDelimiter;
  filePrefix?: string;
  stripNewLines?: boolean;
  excelCompatible?: boolean;
  /** Prepend a UTF-8 BOM (Archi's "UTF-8 BOM" encoding option). */
  bom?: boolean;
}

export interface CsvFile {
  name: string;
  content: string;
}

const ELEMENT_FOLDER_ORDER = [
  'strategy',
  'business',
  'application',
  'technology',
  'motivation',
  'implementation_migration',
  'other',
] as const;

export function serializeCsv(state: ModelState, options: CsvExportOptions = {}): CsvFile[] {
  const delimiter = options.delimiter ?? ',';
  const prefix = options.filePrefix ?? '';
  const bom = options.bom ? '\ufeff' : '';

  const normalise = (s: string | undefined): string => {
    let v = s ?? '';
    if (options.stripNewLines) v = v.replace(/\r\n|\r|\n/g, ' ');
    v = v.replace(/\t/g, ' ');
    return v.replace(/"/g, '""');
  };

  const quote = (s: string): string => {
    // Excel leading-character and formula-injection hacks, per Archi.
    if (options.excelCompatible && (s.startsWith(' ') || s.startsWith('0'))) {
      return `"=""${s}"""`;
    }
    if (options.excelCompatible && /^[=+\-@]/.test(s)) {
      return `" ${s}"`;
    }
    return `"${s}"`;
  };

  const row = (fields: string[]): string => fields.map(quote).join(delimiter);
  const header = (fields: string[]): string => fields.map((f) => `"${f}"`).join(delimiter);

  // Concepts sorted by class name then name, per folder (Archi's sort()).
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const sortConcepts = <T extends ArchimateElement | ArchimateRelationship>(list: T[]): T[] =>
    [...list].sort(
      (a, b) =>
        cmp(a.type.toLowerCase(), b.type.toLowerCase()) ||
        cmp(a.name.toLowerCase().trim(), b.name.toLowerCase().trim()),
    );

  const conceptsInFolder = (folder: Folder | undefined): string[] => {
    if (!folder) return [];
    const ids: string[] = [...folder.itemIds];
    for (const sub of folder.folderIds) ids.push(...conceptsInFolder(state.folders[sub]));
    return ids;
  };

  const topFolder = (type: string): Folder | undefined =>
    state.rootFolderIds.map((id) => state.folders[id]).find((f) => f?.folderType === type);

  // elements.csv — model row first, then elements per layer folder.
  const elementRows: string[] = [
    header(MODEL_ELEMENTS_HEADER),
    row([
      state.info.id,
      ARCHIMATE_MODEL_TYPE,
      normalise(state.info.name),
      normalise(state.info.documentation),
      '',
    ]),
  ];
  for (const folderType of ELEMENT_FOLDER_ORDER) {
    const elements = conceptsInFolder(topFolder(folderType))
      .map((id) => state.elements[id])
      .filter((el): el is ArchimateElement => !!el);
    for (const el of sortConcepts(elements)) {
      const specialization = state.profiles[el.profileIds[0]]?.name ?? '';
      elementRows.push(row([el.id, el.type, normalise(el.name), normalise(el.documentation), normalise(specialization)]));
    }
  }

  // relations.csv
  const relationRows: string[] = [header(RELATIONSHIPS_HEADER)];
  const relations = conceptsInFolder(topFolder('relations'))
    .map((id) => state.relationships[id])
    .filter((rel): rel is ArchimateRelationship => !!rel);
  for (const rel of sortConcepts(relations)) {
    relationRows.push(
      row([
        rel.id,
        rel.type,
        normalise(rel.name),
        normalise(rel.documentation),
        rel.sourceId,
        rel.targetId,
        normalise(state.profiles[rel.profileIds[0]]?.name ?? ''),
      ]),
    );
  }

  // properties.csv — model properties, then concepts in folder order with
  // special attributes appended as pseudo-properties (per Archi).
  const propertyRows: string[] = [header(PROPERTIES_HEADER)];
  for (const p of state.info.properties) {
    propertyRows.push(row([state.info.id, normalise(p.key), normalise(p.value)]));
  }
  const writeConceptProperties = (concept: ArchimateElement | ArchimateRelationship): void => {
    for (const p of concept.properties) {
      propertyRows.push(row([concept.id, normalise(p.key), normalise(p.value)]));
    }
    if (concept.kind === 'relationship') {
      if (concept.type === 'InfluenceRelationship' && concept.strength) {
        propertyRows.push(row([concept.id, INFLUENCE_STRENGTH, normalise(concept.strength)]));
      } else if (concept.type === 'AccessRelationship') {
        propertyRows.push(row([concept.id, ACCESS_TYPE, ACCESS_TYPES[concept.accessType ?? 0]]));
      } else if (concept.type === 'AssociationRelationship') {
        propertyRows.push(row([concept.id, ASSOCIATION_DIRECTED, concept.directed ? 'true' : 'false']));
      }
    } else if (concept.type === 'Junction') {
      propertyRows.push(
        row([concept.id, JUNCTION_TYPE, concept.junctionType === 'or' ? JUNCTION_OR : JUNCTION_AND]),
      );
    }
  };
  for (const fid of state.rootFolderIds) {
    for (const id of conceptsInFolder(state.folders[fid])) {
      const concept = state.elements[id] ?? state.relationships[id];
      if (concept) writeConceptProperties(concept);
    }
  }

  return [
    { name: `${prefix}${ELEMENTS_FILENAME}${CSV_FILE_EXTENSION}`, content: bom + elementRows.join(CRLF) },
    { name: `${prefix}${RELATIONS_FILENAME}${CSV_FILE_EXTENSION}`, content: bom + relationRows.join(CRLF) },
    { name: `${prefix}${PROPERTIES_FILENAME}${CSV_FILE_EXTENSION}`, content: bom + propertyRows.join(CRLF) },
  ];
}
