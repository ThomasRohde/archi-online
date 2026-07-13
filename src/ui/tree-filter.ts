import { labelForModelTreeItem } from '../model/label-expression';
import { isRelationshipType, type ConceptType } from '../model/metamodel';
import type {
  ArchimateElement,
  ArchimateRelationship,
  DiagramView,
  Folder,
  ModelInfo,
  ModelState,
  Property,
} from '../model/types';

export interface TreeSearchProfile {
  name: string;
  conceptType: ConceptType;
}

export interface TreeSearchCriteria {
  query: string;
  searchName: boolean;
  searchDocumentation: boolean;
  searchPropertyValues: boolean;
  includeViews: boolean;
  showAllFolders: boolean;
  matchCase: boolean;
  useRegex: boolean;
  propertyKeys: readonly string[];
  conceptTypes: readonly ConceptType[];
  specializations: readonly TreeSearchProfile[];
}

export interface CompiledTreeSearch {
  criteria: TreeSearchCriteria;
  matcher: RegExp | null;
  valid: boolean;
  error: string | null;
  active: boolean;
  typeGroupActive: boolean;
  textGroupActive: boolean;
  propertyKeys: ReadonlySet<string>;
  conceptTypes: ReadonlySet<ConceptType>;
  specializations: ReadonlySet<string>;
  matches(value: string): boolean;
}

export interface TreeSearchResult {
  active: boolean;
  valid: boolean;
  error: string | null;
  matchedIds: Set<string>;
  visibleIds: Set<string>;
}

export interface TreeSearchCatalog {
  propertyKeys: readonly string[];
  specializations: readonly TreeSearchProfile[];
}

export const DEFAULT_TREE_SEARCH_CRITERIA: TreeSearchCriteria = {
  query: '',
  searchName: true,
  searchDocumentation: false,
  searchPropertyValues: false,
  includeViews: false,
  showAllFolders: false,
  matchCase: false,
  useRegex: false,
  propertyKeys: [],
  conceptTypes: [],
  specializations: [],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile once per criteria change, then reuse the same Unicode matcher for every open model. */
export function compileTreeSearch(criteria: TreeSearchCriteria): CompiledTreeSearch {
  const hasQuery = criteria.query.length > 0;
  const typeGroupActive = criteria.conceptTypes.length > 0
    || criteria.specializations.length > 0
    || criteria.includeViews;
  const textGroupActive = (hasQuery && (
    criteria.searchName
    || criteria.searchDocumentation
    || criteria.searchPropertyValues
  )) || criteria.propertyKeys.length > 0;
  let matcher: RegExp | null = null;
  let error: string | null = null;

  if (hasQuery) {
    try {
      matcher = new RegExp(criteria.useRegex ? criteria.query : escapeRegex(criteria.query),
        criteria.matchCase ? 'u' : 'iu');
    } catch {
      error = 'Invalid regular expression.';
    }
  }

  return {
    criteria,
    matcher,
    valid: error === null,
    error,
    active: typeGroupActive || textGroupActive,
    typeGroupActive,
    textGroupActive,
    propertyKeys: new Set(criteria.propertyKeys),
    conceptTypes: new Set(criteria.conceptTypes),
    specializations: new Set(criteria.specializations.map(treeSearchProfileKey)),
    matches: (value: string) => value.length > 0 && matcher !== null && matcher.test(value),
  };
}

type SearchableTreeItem = ModelInfo | Folder | ArchimateElement | ArchimateRelationship | DiagramView;

function itemProperties(item: SearchableTreeItem): readonly Property[] {
  return item.properties;
}

function itemName(item: SearchableTreeItem): string {
  return item.name;
}

function itemDocumentation(item: SearchableTreeItem): string {
  return item.documentation;
}

function isConcept(item: SearchableTreeItem): item is ArchimateElement | ArchimateRelationship {
  return 'kind' in item && (item.kind === 'element' || item.kind === 'relationship');
}

export function treeSearchProfileKey(profile: TreeSearchProfile): string {
  return `${profile.conceptType}\u0000${profile.name.toLowerCase()}`;
}

function matchesSpecialization(
  item: ArchimateElement | ArchimateRelationship,
  model: ModelState,
  selected: ReadonlySet<string>,
): boolean {
  return item.profileIds.some((id) => {
    const profile = model.profiles[id];
    return profile !== undefined && selected.has(treeSearchProfileKey(profile));
  });
}

function matchesTypeGroup(
  item: SearchableTreeItem,
  model: ModelState,
  compiled: CompiledTreeSearch,
  selectedTypes: ReadonlySet<ConceptType>,
  selectedProfiles: ReadonlySet<string>,
): boolean {
  if (!compiled.typeGroupActive) return true;
  if ('kind' in item && item.kind === 'view') return compiled.criteria.includeViews;
  if (!isConcept(item)) return false;
  return selectedTypes.has(item.type) || matchesSpecialization(item, model, selectedProfiles);
}

function matchesProperties(item: SearchableTreeItem, compiled: CompiledTreeSearch): boolean {
  const { criteria } = compiled;
  const hasSelectedKeys = criteria.propertyKeys.length > 0;
  const valueFiltering = criteria.searchPropertyValues && criteria.query.length > 0;

  for (const property of itemProperties(item)) {
    if (hasSelectedKeys) {
      if (!compiled.propertyKeys.has(property.key)) continue;
      // Desktop returns immediately for the first property whose key is selected,
      // even if a later selected-key property would have matched the query.
      return !valueFiltering || compiled.matches(property.value);
    } else if (valueFiltering && compiled.matches(property.value)) {
      return true;
    }
  }

  return false;
}

function matchesTextGroup(item: SearchableTreeItem, compiled: CompiledTreeSearch): boolean {
  if (!compiled.textGroupActive) return true;
  const { criteria } = compiled;
  const hasQuery = criteria.query.length > 0;
  return (hasQuery && criteria.searchName && compiled.matches(itemName(item)))
    || (hasQuery && criteria.searchDocumentation && compiled.matches(itemDocumentation(item)))
    || ((criteria.propertyKeys.length > 0 || (hasQuery && criteria.searchPropertyValues))
      && matchesProperties(item, compiled));
}

function addFolderAncestors(model: ModelState, visible: Set<string>, folderId: string | null): void {
  let current = folderId;
  while (current && !visible.has(current)) {
    visible.add(current);
    current = model.folders[current]?.parentId ?? null;
  }
}

/** Apply structured Desktop search semantics to one model without compiling another matcher. */
export function searchModelTree(model: ModelState, compiled: CompiledTreeSearch): TreeSearchResult {
  const matchedIds = new Set<string>();
  const visibleIds = new Set<string>();
  if (!compiled.active) {
    return {
      active: false,
      valid: compiled.valid,
      error: compiled.error,
      matchedIds,
      visibleIds,
    };
  }

  const matches = (item: SearchableTreeItem) =>
    matchesTypeGroup(item, model, compiled, compiled.conceptTypes, compiled.specializations)
    && matchesTextGroup(item, compiled);

  if (matches(model.info)) matchedIds.add(model.info.id);

  for (const folder of Object.values(model.folders)) {
    if (matches(folder)) {
      matchedIds.add(folder.id);
      visibleIds.add(folder.id);
      addFolderAncestors(model, visibleIds, folder.parentId);
    }
  }
  for (const item of [
    ...Object.values(model.elements),
    ...Object.values(model.relationships),
    ...Object.values(model.views),
  ]) {
    if (matches(item)) {
      matchedIds.add(item.id);
      visibleIds.add(item.id);
      addFolderAncestors(model, visibleIds, item.folderId);
    }
  }

  if (compiled.criteria.showAllFolders) {
    for (const folder of Object.values(model.folders)) visibleIds.add(folder.id);
  }
  if (matchedIds.size > 0 || visibleIds.size > 0) visibleIds.add(model.info.id);

  return {
    active: true,
    valid: compiled.valid,
    error: compiled.error,
    matchedIds,
    visibleIds,
  };
}

function propertyOwners(model: ModelState): readonly SearchableTreeItem[] {
  return [
    model.info,
    ...Object.values(model.folders),
    ...Object.values(model.elements),
    ...Object.values(model.relationships),
    ...Object.values(model.views),
  ];
}

/** Aggregate exact property keys and cross-model specialization descriptors. */
export function collectTreeSearchCatalog(models: readonly ModelState[]): TreeSearchCatalog {
  const propertyKeys = new Set<string>();
  const specializations = new Map<string, TreeSearchProfile>();

  for (const model of models) {
    for (const owner of propertyOwners(model)) {
      for (const property of owner.properties) {
        if (property.key.trim()) propertyKeys.add(property.key);
      }
    }
    for (const profile of Object.values(model.profiles)) {
      const descriptor = { name: profile.name, conceptType: profile.conceptType };
      const key = treeSearchProfileKey(descriptor);
      if (!specializations.has(key)) specializations.set(key, descriptor);
    }
  }

  return {
    propertyKeys: [...propertyKeys].sort((left, right) =>
      left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase()) || left.localeCompare(right)),
    specializations: [...specializations.values()].sort((left, right) =>
      Number(isRelationshipType(left.conceptType)) - Number(isRelationshipType(right.conceptType))
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      || left.conceptType.localeCompare(right.conceptType)),
  };
}

export function treeSearchCatalogSignature(catalog: TreeSearchCatalog): string {
  return JSON.stringify([
    catalog.propertyKeys,
    catalog.specializations.map(treeSearchProfileKey),
  ]);
}

/** Desktop clears model-derived choices on catalog changes, but preserves static concept types. */
export function reconcileTreeSearchCatalog(
  criteria: TreeSearchCriteria,
  previous: TreeSearchCatalog,
  next: TreeSearchCatalog,
): TreeSearchCriteria {
  if (treeSearchCatalogSignature(previous) === treeSearchCatalogSignature(next)) return criteria;
  return { ...criteria, propertyKeys: [], specializations: [] };
}

/** Desktop Reset intentionally leaves the query, folder/case/regex modifiers, and search open. */
export function resetTreeSearchCriteria(criteria: TreeSearchCriteria): TreeSearchCriteria {
  return {
    ...DEFAULT_TREE_SEARCH_CRITERIA,
    query: criteria.query,
    showAllFolders: criteria.showAllFolders,
    matchCase: criteria.matchCase,
    useRegex: criteria.useRegex,
  };
}

/** Display labels remain independent from the raw strings searched above. */
export function treeItemLabel(model: ModelState, id: string): string {
  if (model.elements[id] || model.relationships[id] || model.views[id] || model.folders[id]) {
    return labelForModelTreeItem(model, id);
  }
  return '?';
}
