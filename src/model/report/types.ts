export const STATIC_REPORT_SCHEMA_VERSION = 1;

export interface StaticReportProperty {
  key: string;
  value: string;
}

export interface StaticReportBase {
  id: string;
  name: string;
  documentation: string;
  properties: StaticReportProperty[];
}

export interface StaticReportModel extends StaticReportBase {
  kind: 'model';
  rootFolderIds: string[];
  counts: {
    folders: number;
    elements: number;
    relationships: number;
    views: number;
  };
}

export interface StaticReportFolder extends StaticReportBase {
  kind: 'folder';
  parentId: string | null;
  folderIds: string[];
  itemIds: string[];
}

export interface StaticReportElement extends StaticReportBase {
  kind: 'element';
  typeLabel: string;
  specialization?: string;
  folderId: string;
}

export interface StaticReportRelationship extends StaticReportBase {
  kind: 'relationship';
  typeLabel: string;
  specialization?: string;
  folderId: string;
  sourceId: string;
  targetId: string;
}

export interface StaticReportView extends StaticReportBase {
  kind: 'view';
  folderId: string;
  viewpoint: string;
  svgPath: string;
}

export interface StaticReportAnalysis {
  relationshipIds: string[];
  viewIds: string[];
}

export type StaticReportObject =
  | StaticReportModel
  | StaticReportFolder
  | StaticReportElement
  | StaticReportRelationship
  | StaticReportView;

export interface StaticReportData {
  schemaVersion: typeof STATIC_REPORT_SCHEMA_VERSION;
  productVersion: string;
  model: StaticReportModel;
  folders: StaticReportFolder[];
  elements: StaticReportElement[];
  relationships: StaticReportRelationship[];
  views: StaticReportView[];
  analysis: Record<string, StaticReportAnalysis>;
  initialViewId?: string;
}
