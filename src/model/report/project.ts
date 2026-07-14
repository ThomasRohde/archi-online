import { modelRelations, viewsUsing } from '../analysis';
import { viewpointName } from '../data/viewpoints';
import { elementLabel, relationshipLabel } from '../metamodel';
import type { ModelState, ProfileDefinition, Property } from '../types';
import {
  STATIC_REPORT_SCHEMA_VERSION,
  type StaticReportAnalysis,
  type StaticReportData,
  type StaticReportElement,
  type StaticReportFolder,
  type StaticReportProperty,
  type StaticReportRelationship,
  type StaticReportView,
} from './types';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byNameThenId<T extends { id: string; name: string }>(left: T, right: T): number {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

function cloneProperties(properties: readonly Property[]): StaticReportProperty[] {
  return properties.map(({ key, value }) => ({ key, value }));
}

function specialization(
  profiles: Readonly<Record<string, ProfileDefinition>>,
  profileIds: readonly string[],
): string | undefined {
  const name = profiles[profileIds[0] ?? '']?.name.trim();
  return name || undefined;
}

function orderedFolderIds(model: ModelState): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (folderId: string) => {
    if (visited.has(folderId)) return;
    const folder = model.folders[folderId];
    if (!folder) return;
    visited.add(folderId);
    result.push(folderId);
    folder.folderIds.forEach(visit);
  };
  model.rootFolderIds.forEach(visit);
  Object.values(model.folders)
    .filter(({ id }) => !visited.has(id))
    .sort(byNameThenId)
    .forEach(({ id }) => visit(id));
  return result;
}

function orderedViewIds(model: ModelState): string[] {
  const result: string[] = [];
  const visitedFolders = new Set<string>();
  const visitedViews = new Set<string>();
  const visit = (folderId: string) => {
    if (visitedFolders.has(folderId)) return;
    const folder = model.folders[folderId];
    if (!folder) return;
    visitedFolders.add(folderId);
    folder.folderIds.forEach(visit);
    for (const itemId of folder.itemIds) {
      if (model.views[itemId] && !visitedViews.has(itemId)) {
        visitedViews.add(itemId);
        result.push(itemId);
      }
    }
  };
  model.rootFolderIds.forEach(visit);
  Object.values(model.views)
    .filter(({ id }) => !visitedViews.has(id))
    .sort(byNameThenId)
    .forEach(({ id }) => result.push(id));
  return result;
}

function projectFolders(model: ModelState): StaticReportFolder[] {
  return orderedFolderIds(model).map((id) => {
    const folder = model.folders[id];
    return {
      id,
      kind: 'folder',
      name: folder.name,
      documentation: folder.documentation,
      properties: cloneProperties(folder.properties),
      parentId: folder.parentId,
      folderIds: [...folder.folderIds],
      itemIds: [...folder.itemIds],
    };
  });
}

function projectElements(model: ModelState): StaticReportElement[] {
  return Object.values(model.elements).sort(byNameThenId).map((element) => ({
    id: element.id,
    kind: 'element',
    name: element.name,
    documentation: element.documentation,
    properties: cloneProperties(element.properties),
    typeLabel: elementLabel(element.type),
    specialization: specialization(model.profiles, element.profileIds),
    folderId: element.folderId,
  }));
}

function projectRelationships(model: ModelState): StaticReportRelationship[] {
  return Object.values(model.relationships).sort(byNameThenId).map((relationship) => ({
    id: relationship.id,
    kind: 'relationship',
    name: relationship.name,
    documentation: relationship.documentation,
    properties: cloneProperties(relationship.properties),
    typeLabel: relationshipLabel(relationship.type),
    specialization: specialization(model.profiles, relationship.profileIds),
    folderId: relationship.folderId,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
  }));
}

function projectViews(model: ModelState): StaticReportView[] {
  return orderedViewIds(model).map((id, index) => {
    const view = model.views[id];
    return {
      id,
      kind: 'view',
      name: view.name,
      documentation: view.documentation,
      properties: cloneProperties(view.properties),
      folderId: view.folderId,
      viewpoint: viewpointName(view.viewpoint) || view.viewpoint || '',
      svgPath: `views/view-${String(index + 1).padStart(4, '0')}.svg`,
    };
  });
}

function projectAnalysis(model: ModelState): Record<string, StaticReportAnalysis> {
  const result: Record<string, StaticReportAnalysis> = {};
  for (const conceptId of [
    ...Object.keys(model.elements),
    ...Object.keys(model.relationships),
  ]) {
    result[conceptId] = {
      relationshipIds: modelRelations(model, conceptId).map(({ id }) => id).sort(compareText),
      viewIds: viewsUsing(model, conceptId).map(({ id }) => id).sort(compareText),
    };
  }
  return result;
}

export function projectStaticReport(model: ModelState, productVersion: string): StaticReportData {
  const views = projectViews(model);
  return {
    schemaVersion: STATIC_REPORT_SCHEMA_VERSION,
    productVersion,
    model: {
      id: model.info.id,
      kind: 'model',
      name: model.info.name,
      documentation: model.info.documentation,
      properties: cloneProperties(model.info.properties),
      rootFolderIds: [...model.rootFolderIds],
      counts: {
        folders: Object.keys(model.folders).length,
        elements: Object.keys(model.elements).length,
        relationships: Object.keys(model.relationships).length,
        views: views.length,
      },
    },
    folders: projectFolders(model),
    elements: projectElements(model),
    relationships: projectRelationships(model),
    views,
    analysis: projectAnalysis(model),
    ...(views[0] ? { initialViewId: views[0].id } : {}),
  };
}
