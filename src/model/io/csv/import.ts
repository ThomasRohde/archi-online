// CSV importer, ported from Archi's CSVImporter.java: match objects by ID
// (update in place), create what is new, validate relationship rules, and
// interpret Archi's special pseudo-properties. Errors abort the whole import
// (Archi's importer throws before anything is applied).

import { newId } from '../../id';
import { current, isDraft } from 'immer';
import {
  ELEMENT_TYPE_MAP,
  isElementType,
  isRelationshipType,
  type ElementType,
  type RelationshipType,
} from '../../metamodel';
import { isAllowedRelationship } from '../../rules';
import type { ModelState } from '../../types';
import {
  ACCESS_TYPE,
  ACCESS_TYPES,
  ARCHIMATE_MODEL_TYPE,
  ASSOCIATION_DIRECTED,
  INFLUENCE_STRENGTH,
  JUNCTION_AND,
  JUNCTION_TYPE,
  MODEL_ELEMENTS_HEADER,
  PROPERTIES_HEADER,
  RELATIONSHIPS_HEADER,
} from './constants';
import { CsvParseError, parseCsvRecords } from './parse';

export interface CsvImportFiles {
  elements?: string;
  relations?: string;
  properties?: string;
}

export interface CsvImportReport {
  created: number;
  updated: number;
  unchanged: number;
  profiles: number;
  properties: number;
  warnings: number;
  errors: number;
}

/** Mutates the draft model in place; must run inside a single transact(). */
export function applyCsvImport(draft: ModelState, files: CsvImportFiles): CsvImportReport {
  const source = isDraft(draft) ? current(draft) : draft;
  const working = structuredClone(source) as ModelState;
  const report = applyCsvImportInPlace(working, files);
  Object.assign(draft, working);
  return report;
}

function applyCsvImportInPlace(draft: ModelState, files: CsvImportFiles): CsvImportReport {
  const beforeProfiles = Object.keys(draft.profiles).length;
  const before = new Map<string, string>();
  for (const object of [...Object.values(draft.elements), ...Object.values(draft.relationships)]) {
    before.set(object.id, JSON.stringify(object));
  }
  const touched = new Set<string>();
  let propertyRecords = 0;
  const modelIds = new Set<string>(); // ids the elements.csv model row claims
  const createdRelations = new Set<string>(); // for duplicate detection
  const pendingEndpoints = new Map<string, { sourceId: string; targetId: string }>();

  if (files.elements !== undefined) importElements(files.elements);
  if (files.relations !== undefined) importRelations(files.relations);
  if (files.properties !== undefined) importProperties(files.properties);
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const id of touched) {
    const object = draft.elements[id] ?? draft.relationships[id];
    if (!before.has(id)) created++;
    else if (JSON.stringify(object) === before.get(id)) unchanged++;
    else updated++;
  }
  return {
    created,
    updated,
    unchanged,
    profiles: Object.keys(draft.profiles).length - beforeProfiles,
    properties: propertyRecords,
    warnings: 0,
    errors: 0,
  };

  function importElements(text: string): void {
    const records = parseCsvRecords(text);
    if (records.length === 0) throw new CsvParseError('Elements file is empty');
    if (!isHeaderRecord(records[0], MODEL_ELEMENTS_HEADER)) {
      throw new CsvParseError('Elements file has the wrong header');
    }
    const headerSize = records[0].length;
    for (let i = 1; i < records.length; i++) {
      const record = records[i];
      if (record.length !== headerSize) {
        throw new CsvParseError(`Wrong number of fields in record: ${record.join(',')}`);
      }
      if (record[1] === ARCHIMATE_MODEL_TYPE) {
        if (record[0] !== '') modelIds.add(record[0]);
        draft.info.name = record[2] ?? draft.info.name;
        draft.info.documentation = record[3] ?? draft.info.documentation;
        continue;
      }
      createOrUpdateElement(record);
    }
  }

  function createOrUpdateElement(record: string[]): void {
    const id = record[0] !== '' ? checkId(record[0]) : newId();
    const type = record[1];
    if (!isElementType(type)) {
      throw new CsvParseError(`Type should be of ArchiMate element type: ${type}`);
    }
    let element = draft.elements[id];
    if (!element) {
      if (draft.relationships[id] || draft.views[id] || draft.folders[id]) {
        throw new CsvParseError(`Found object with same id but different class: ${id}`);
      }
      element = {
        id,
        kind: 'element',
        type,
        name: '',
        documentation: '',
        properties: [],
        profileIds: [],
        folderId: defaultElementFolder(draft, type),
        junctionType: type === 'Junction' ? 'and' : undefined,
      };
      draft.elements[id] = element;
      draft.folders[element.folderId].itemIds.push(id);
    } else if (element.type !== type) {
      throw new CsvParseError(`Found object with same id but different class: ${id}`);
    }
    element.name = normalise(record[2]);
    element.documentation = record[3] ?? '';
    applySpecialization(element, record[4]);
    touched.add(id);
  }

  function importRelations(text: string): void {
    const records = parseCsvRecords(text);
    if (records.length === 0) throw new CsvParseError('Relations file is empty');
    if (!isHeaderRecord(records[0], RELATIONSHIPS_HEADER)) {
      throw new CsvParseError('Relations file has the wrong header');
    }
    const headerSize = records[0].length;
    for (let i = 1; i < records.length; i++) {
      const record = records[i];
      if (record.length !== headerSize) {
        throw new CsvParseError(`Wrong number of fields in record: ${record.join(',')}`);
      }
      createOrUpdateRelation(record);
    }
    // Second pass: resolve and validate endpoints.
    for (const [relId, endpoints] of pendingEndpoints) {
      const rel = draft.relationships[relId];
      const source = draft.elements[endpoints.sourceId] ?? draft.relationships[endpoints.sourceId];
      const target = draft.elements[endpoints.targetId] ?? draft.relationships[endpoints.targetId];
      if (!source) throw new CsvParseError(`Source not found for relationship: ${relId}`);
      if (!target) throw new CsvParseError(`Target not found for relationship: ${relId}`);
      if (!isAllowedRelationship(rel.type, source.type, target.type)) {
        throw new CsvParseError(`Invalid relationship: ${relId}`);
      }
      rel.sourceId = endpoints.sourceId;
      rel.targetId = endpoints.targetId;
    }
  }

  function createOrUpdateRelation(record: string[]): void {
    const id = record[0] !== '' ? checkId(record[0]) : newId();
    const type = record[1];
    if (!isRelationshipType(type)) {
      throw new CsvParseError(`Type should be of ArchiMate relationship type: ${id}`);
    }
    // A repeated id is only an error when the relation was created by this
    // import (Archi's null-endpoint check); records for pre-existing
    // relations may repeat, last one wins.
    if (createdRelations.has(id)) {
      throw new CsvParseError(`Duplicate relationship in CSV file: ${id}`);
    }
    const sourceId = record[4];
    const targetId = record[5];
    let rel = draft.relationships[id];
    if (rel && rel.type !== type) {
      throw new CsvParseError(`Found object with same id but different class: ${id}`);
    }
    if (draft.elements[id] || draft.views[id] || draft.folders[id]) {
      throw new CsvParseError(`Found object with same id but different class: ${id}`);
    }
    if (!rel) {
      rel = {
        id,
        kind: 'relationship',
        type: type as RelationshipType,
        name: '',
        documentation: '',
        properties: [],
        profileIds: [],
        folderId: topFolderId(draft, 'relations'),
        sourceId: '',
        targetId: '',
      };
      draft.relationships[id] = rel;
      draft.folders[rel.folderId].itemIds.push(id);
      createdRelations.add(id);
    } else if (rel.sourceId !== sourceId || rel.targetId !== targetId) {
      createdRelations.add(id);
    }
    pendingEndpoints.set(id, { sourceId, targetId });
    rel.name = normalise(record[2]);
    rel.documentation = record[3] ?? '';
    applySpecialization(rel, record[6]);
    touched.add(id);
  }

  function applySpecialization(
    concept: { id: string; type: ElementType | RelationshipType; profileIds: string[] },
    name: string | undefined,
  ): void {
    const normalized = normalise(name).trim();
    if (!normalized) return;
    let profile = Object.values(draft.profiles).find(
      (candidate) =>
        candidate.conceptType === concept.type &&
        candidate.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (!profile) {
      const id = newId();
      profile = {
        id,
        name: normalized,
        conceptType: concept.type,
        specialization: true,
      };
      draft.profiles[id] = profile;
    }
    concept.profileIds = [profile.id];
  }

  function importProperties(text: string): void {
    const records = parseCsvRecords(text);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.length !== PROPERTIES_HEADER.length) {
        throw new CsvParseError(`Wrong number of fields in record: ${record.join(',')}`);
      }
      if (i === 0 && isHeaderRecord(record, PROPERTIES_HEADER)) continue;
      applyPropertyRecord(record);
    }
  }

  function applyPropertyRecord(record: string[]): void {
    const id = record[0];
    if (id === '') throw new CsvParseError('Missing ID value for property');
    checkId(id);

    const key = normalise(record[1]);
    const value = normalise(record[2]);
    propertyRecords++;

    if (modelIds.has(id)) {
      upsertProperty(draft.info.properties, key, value);
      return;
    }

    const element = draft.elements[id];
    const relationship = draft.relationships[id];
    const view = draft.views[id];
    const folder = draft.folders[id];
    const target = element ?? relationship ?? view ?? folder;
    if (!target) throw new CsvParseError(`Property references missing object: ${id}`);
    if (element || relationship) touched.add(id);

    // Special pseudo-properties carry concept attributes (per Archi's
    // exporter; the importer matches by key — Archi compares Directed with
    // endsWith, an evident bug we deliberately do not reproduce).
    if (key === INFLUENCE_STRENGTH && relationship?.type === 'InfluenceRelationship') {
      relationship.strength = value;
      return;
    }
    if (key === ACCESS_TYPE && relationship?.type === 'AccessRelationship') {
      const index = ACCESS_TYPES.indexOf(value);
      relationship.accessType = index >= 0 ? index : 0;
      return;
    }
    if (key === ASSOCIATION_DIRECTED && relationship?.type === 'AssociationRelationship') {
      relationship.directed = value.toLowerCase() === 'true' ? true : undefined;
      return;
    }
    if (key === JUNCTION_TYPE && element?.type === 'Junction') {
      element.junctionType = value === JUNCTION_AND ? 'and' : 'or';
      return;
    }

    upsertProperty(target.properties, key, value);
  }
}

function upsertProperty(properties: { key: string; value: string }[], key: string, value: string) {
  const existing = properties.find((p) => p.key === key);
  if (existing) existing.value = value;
  else properties.push({ key, value });
}

function normalise(s: string | undefined): string {
  return (s ?? '').replace(/\r\n|\r|\n|\t/g, ' ');
}

function isHeaderRecord(record: string[], fields: string[]): boolean {
  if (record.length > fields.length) return false;
  return record.every((r, i) => r.toLowerCase() === fields[i].toLowerCase());
}

function checkId(id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new CsvParseError(`Illegal characters in ID: ${id}`);
  }
  return id;
}

function defaultElementFolder(state: ModelState, type: ElementType): string {
  const layer = type === 'Junction' ? 'other' : ELEMENT_TYPE_MAP[type].layer;
  return topFolderId(state, layer === 'physical' ? 'technology' : layer);
}

function topFolderId(state: ModelState, folderType: string): string {
  for (const id of state.rootFolderIds) {
    if (state.folders[id]?.folderType === folderType) return id;
  }
  throw new CsvParseError(`Missing default folder: ${folderType}`);
}
