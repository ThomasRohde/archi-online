import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ARCHIMATE_NS = 'http://www.archimatetool.com/archimate';
const OUTPUT_PATH = resolve('public/examples/archi-online-capability-model.archimate');

const TOP_FOLDERS = [
  ['Strategy', 'strategy'],
  ['Business', 'business'],
  ['Application', 'application'],
  ['Technology & Physical', 'technology'],
  ['Motivation', 'motivation'],
  ['Implementation & Migration', 'implementation_migration'],
  ['Other', 'other'],
  ['Relations', 'relations'],
  ['Views', 'diagrams'],
];

const state = {
  info: {
    id: 'id-archi-online-capability-model',
    name: 'Archi Online Capability Model',
    documentation:
      'A self-describing ArchiMate model of the Archi Online browser app. It is intentionally detailed enough to exercise inline encoding, gist-backed sharing, read-only viewing, properties inspection, and open-copy editing.',
    properties: [
      { key: 'repository', value: 'C:/Users/thoma/Projects/archi-online' },
      { key: 'generatedBy', value: 'tools/create-archi-online-capability-model.mjs' },
      { key: 'testPurpose', value: 'Milestone 1 model sharing and viewer capability' },
    ],
    version: '5.0.0',
  },
  folders: {},
  rootFolderIds: [],
  elements: {},
  relationships: {},
  views: {},
  nodes: {},
  connections: {},
};

const foldersByType = {};
for (const [name, type] of TOP_FOLDERS) {
  const folder = {
    id: `id-folder-${type}`,
    kind: 'folder',
    name,
    folderType: type,
    documentation: '',
    properties: [],
    parentId: null,
    folderIds: [],
    itemIds: [],
  };
  state.folders[folder.id] = folder;
  state.rootFolderIds.push(folder.id);
  foldersByType[type] = folder.id;
}

const elements = {};
const relationships = {};

function el(slug, type, name, folderType, documentation, properties = {}) {
  const id = `id-el-${slug}`;
  state.elements[id] = {
    id,
    kind: 'element',
    type,
    name,
    documentation,
    properties: Object.entries(properties).map(([key, value]) => ({ key, value })),
    folderId: foldersByType[folderType],
  };
  state.folders[foldersByType[folderType]].itemIds.push(id);
  elements[slug] = id;
  return id;
}

function rel(slug, type, sourceSlug, targetSlug, name, documentation, attrs = {}) {
  const id = `id-rel-${slug}`;
  const sourceId = elements[sourceSlug] ?? relationships[sourceSlug];
  const targetId = elements[targetSlug] ?? relationships[targetSlug];
  if (!sourceId || !targetId) throw new Error(`Missing relationship endpoint for ${slug}`);
  state.relationships[id] = {
    id,
    kind: 'relationship',
    type,
    name,
    documentation,
    properties: attrs.properties ?? [],
    folderId: foldersByType.relations,
    sourceId,
    targetId,
    accessType: attrs.accessType,
    strength: attrs.strength,
    directed: attrs.directed,
  };
  state.folders[foldersByType.relations].itemIds.push(id);
  relationships[slug] = id;
  return id;
}

function view(slug, name, documentation, viewpoint = 'total') {
  const id = `id-view-${slug}`;
  state.views[id] = {
    id,
    kind: 'view',
    name,
    documentation,
    properties: [],
    folderId: foldersByType.diagrams,
    viewpoint,
    childIds: [],
    connectionRouterType: 1,
  };
  state.folders[foldersByType.diagrams].itemIds.push(id);
  return id;
}

function group(viewId, slug, name, x, y, width, height, documentation = '') {
  const id = `${viewId}-group-${slug}`;
  state.nodes[id] = {
    id,
    viewId,
    parentId: viewId,
    nodeType: 'group',
    name,
    documentation,
    properties: [],
    bounds: { x, y, width, height },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    fillColor: '#f7f8fa',
    lineColor: '#8a94a6',
  };
  state.views[viewId].childIds.push(id);
  return id;
}

function node(viewId, parentId, slug, elementSlug, x, y, width = 170, height = 70, fillColor) {
  const id = `${viewId}-node-${slug}`;
  const elementId = elements[elementSlug];
  if (!elementId) throw new Error(`Missing element ${elementSlug}`);
  state.nodes[id] = {
    id,
    viewId,
    parentId,
    nodeType: 'element',
    elementId,
    bounds: { x, y, width, height },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    fillColor,
  };
  if (parentId === viewId) state.views[viewId].childIds.push(id);
  else state.nodes[parentId].childIds.push(id);
  return id;
}

function note(viewId, slug, content, x, y, width, height) {
  const id = `${viewId}-note-${slug}`;
  state.nodes[id] = {
    id,
    viewId,
    parentId: viewId,
    nodeType: 'note',
    content,
    properties: [],
    bounds: { x, y, width, height },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    fillColor: '#fff7d6',
    lineColor: '#c9ad4f',
  };
  state.views[viewId].childIds.push(id);
  return id;
}

function conn(viewId, slug, relSlug, sourceNodeId, targetNodeId, lineColor = '#5f6f89') {
  const id = `${viewId}-conn-${slug}`;
  const relationshipId = relationships[relSlug];
  if (!relationshipId) throw new Error(`Missing relationship ${relSlug}`);
  state.connections[id] = {
    id,
    viewId,
    connType: 'relationship',
    relationshipId,
    sourceId: sourceNodeId,
    targetId: targetNodeId,
    bendpoints: [],
    lineColor,
  };
  state.nodes[sourceNodeId].sourceConnectionIds.push(id);
  state.nodes[targetNodeId].targetConnectionIds.push(id);
  return id;
}

function addElements() {
  el('enterprise-architect', 'Stakeholder', 'Enterprise Architect', 'motivation', 'Owns model quality and uses Archi Online to inspect, edit, and share ArchiMate models.');
  el('model-author', 'Stakeholder', 'Model Author', 'motivation', 'Creates and edits models in the browser, then shares links for review.');
  el('reviewer', 'Stakeholder', 'Model Reviewer', 'motivation', 'Opens shared models without installing Archi or receiving editable files.');
  el('extension-developer', 'Stakeholder', 'Extension Developer', 'motivation', 'Adds local extensions and scripts through the app extension surface.');
  el('browser-first-driver', 'Driver', 'Browser-first enterprise modeling', 'motivation', 'Architecture work should be possible from a modern browser without a desktop Archi install.');
  el('review-driver', 'Driver', 'Fast model review loops', 'motivation', 'Sharing a model should be as easy as sending a link while preserving model fidelity.');
  el('url-risk', 'Assessment', 'Long inline links are fragile', 'motivation', 'Real models exceed practical URL limits in browsers, chat clients, and email tools.');
  el('edit-goal', 'Goal', 'Edit ArchiMate models in the browser', 'motivation', 'Provide a usable browser modeler with canvas editing, properties, persistence, and scripting.');
  el('share-goal', 'Goal', 'Share models for review', 'motivation', 'Create a link that opens the same model in read-only mode.');
  el('readonly-goal', 'Goal', 'Keep review links read-only', 'motivation', 'Reviewers can inspect the model and open an editable copy, but the shared source is never mutated by viewing.');
  el('fidelity-goal', 'Goal', 'Preserve Archi .archimate fidelity', 'motivation', 'Import, edit, serialize, and round-trip Archi native XML without losing structure relevant to this app.');
  el('share-links-req', 'Requirement', 'URL and gist share links', 'motivation', 'Small models use compressed fragments; larger models publish a .archimate file to GitHub Gist.');
  el('zero-auth-req', 'Requirement', 'Zero-auth viewer loading', 'motivation', 'Public and secret gist links, plus GitHub raw URLs, open in the viewer without requiring a GitHub token.');
  el('copy-req', 'Requirement', 'Open shared model as editable copy', 'motivation', 'The viewer can switch into the full editor with a cloned model and autosave restore disabled for that transition.');
  el('token-req', 'Requirement', 'GitHub token stays local', 'motivation', 'The gist token is stored in local IndexedDB key-value storage and is only sent to api.github.com.');
  el('gist-reuse-req', 'Requirement', 'Reuse gist per model id', 'motivation', 'Re-sharing a model updates the remembered gist id for the same model.info.id.');
  el('native-file-principle', 'Principle', 'Native .archimate remains source of truth', 'motivation', 'Sharing and persistence are wrappers around the same ArchiMate XML model, not a separate export format.');

  el('modeling-service', 'BusinessService', 'ArchiMate modeling service', 'business', 'The user-facing capability for authoring and maintaining ArchiMate models.');
  el('review-service', 'BusinessService', 'Model review service', 'business', 'The user-facing capability for opening a shared model as a read-only review surface.');
  el('author-process', 'BusinessProcess', 'Author model', 'business', 'Create, edit, script, layout, and save an architecture model.');
  el('share-process', 'BusinessProcess', 'Share model', 'business', 'Generate a share URL and, when needed, publish the serialized model to GitHub Gist.');
  el('review-process', 'BusinessProcess', 'Inspect shared model', 'business', 'Open a viewer link, select views, pan and zoom, and inspect properties without editing the shared model.');
  el('copy-process', 'BusinessProcess', 'Open copy for editing', 'business', 'Clone a read-only shared model into a normal editor session.');
  el('architecture-model', 'BusinessObject', 'Architecture model', 'business', 'The conceptual model being edited and reviewed.');
  el('review-link', 'BusinessObject', 'Review link', 'business', 'A URL containing an inline fragment, gist id, or raw GitHub model URL.');

  el('spa', 'ApplicationComponent', 'Archi Online SPA', 'application', 'The React/Vite browser application containing the editor, viewer, persistence, scripting, and extension surfaces.', { layer: 'application shell' });
  el('runtime-boot', 'ApplicationComponent', 'App runtime boot', 'application', 'Chooses editor or viewer mode from URL state and hydrates only the stores required for that mode.');
  el('app-shell', 'ApplicationComponent', 'Docked editor shell', 'application', 'Normal editable application shell with toolbar, dock layout, model tree, canvas views, properties, scripting, settings, and extensions.');
  el('viewer-shell', 'ApplicationComponent', 'Read-only viewer shell', 'application', 'Lightweight shell for shared models with source label, view picker, canvas, properties, and open-copy action.');
  el('toolbar', 'ApplicationComponent', 'Toolbar and share command', 'application', 'Creates new models, opens/saves files, and runs the share flow with inline or gist-backed links.');
  el('view-editor', 'ApplicationComponent', 'SVG view editor', 'application', 'Renders ArchiMate views on SVG, including editable interactions in editor mode and pan/zoom inspection in read-only mode.');
  el('properties-panel', 'ApplicationComponent', 'Properties panel', 'application', 'Shows concept metadata and edits properties in normal mode while hiding mutating controls in read-only mode.');
  el('model-tree', 'ApplicationComponent', 'Model tree', 'application', 'Navigates model folders, elements, relationships, and views.');
  el('model-store', 'ApplicationComponent', 'Normalized model store', 'application', 'Zustand store for ModelState, selection, active view, tools, dirty state, undo/redo, and read-only mode.');
  el('undo-redo', 'ApplicationComponent', 'Transaction and undo/redo operations', 'application', 'Routes model mutations through transactions so UI, scripting, and undo/redo stay consistent.');
  el('xml-io', 'ApplicationComponent', 'ArchiMate XML I/O', 'application', 'Parser and serializer for Archi native .archimate XML.');
  el('share-encoding', 'ApplicationComponent', 'Share encoding module', 'application', 'Compresses inline share payloads, parses fragments, loads shared models, and remembers gist associations.');
  el('github-persistence', 'ApplicationComponent', 'GitHub Gist persistence module', 'application', 'Creates, updates, and reads GitHub Gists and raw GitHub model URLs.');
  el('file-persistence', 'ApplicationComponent', 'File persistence module', 'application', 'Uses File System Access and download fallback for opening and saving .archimate files.');
  el('autosave', 'ApplicationComponent', 'IndexedDB autosave', 'application', 'Stores and restores editor workspaces, but is deliberately skipped while booting shared viewer links.');
  el('settings-store', 'ApplicationComponent', 'Settings store', 'application', 'Persists canvas, layout, and behavior preferences.');
  el('extension-runtime', 'ApplicationComponent', 'Extension runtime', 'application', 'Loads extension packages, exposes commands, panels, context menus, and app events.');
  el('script-runner', 'ApplicationComponent', 'jArchi script runner', 'application', 'Executes scripts against the model API and reports console output.');
  el('monaco-editor', 'ApplicationComponent', 'Monaco script editor', 'application', 'Provides the browser code editor used by scripting and extension source editing.');
  el('elk-extension', 'ApplicationComponent', 'ELK layout extension', 'application', 'Example extension applying ELK layout to model views.');
  el('model-editing-app-service', 'ApplicationService', 'Browser model editing', 'application', 'Application service exposed by the editor shell.');
  el('viewer-app-service', 'ApplicationService', 'Read-only model viewing', 'application', 'Application service exposed by the viewer shell.');
  el('share-app-service', 'ApplicationService', 'Share link generation', 'application', 'Application service that produces inline, gist-backed, or raw-source viewer links.');
  el('gist-app-service', 'ApplicationService', 'Gist publication', 'application', 'Application service that stores large shared models in GitHub Gist.');
  el('xml-app-service', 'ApplicationService', 'XML import/export', 'application', 'Application service for Archi native file interchange.');
  el('extension-app-service', 'ApplicationService', 'Extension API', 'application', 'Application service consumed by local extensions and future automation.');
  el('scripting-app-service', 'ApplicationService', 'jArchi-compatible scripting', 'application', 'Application service for executing scripts against the current model.');
  el('model-state', 'DataObject', 'ModelState graph', 'application', 'Normalized in-memory model: folders, concepts, views, nodes, connections, and model metadata.');
  el('archimate-xml', 'DataObject', '.archimate XML document', 'application', 'Serialized Archi native XML used by disk persistence, gist sharing, and raw URL loading.');
  el('inline-payload', 'DataObject', 'Compressed inline share payload', 'application', 'Deflated XML encoded as base64url in the URL fragment.');
  el('gist-link-data', 'DataObject', 'Gist-backed viewer link', 'application', 'Viewer URL containing #gist=<id> for a model stored in GitHub Gist.');
  el('raw-url-data', 'DataObject', 'Raw GitHub model URL', 'application', 'Viewer URL containing #raw=<url> that points at GitHub raw content.');
  el('workspace-data', 'DataObject', 'IndexedDB workspace', 'application', 'Autosave, settings, token, and gist association records stored in browser IndexedDB.');
  el('local-file-data', 'DataObject', 'Local .archimate file', 'application', 'A file selected through File System Access or downloaded from the app.');
  el('extension-package-data', 'DataObject', 'Extension package', 'application', 'Extension source or package manifest and files.');

  el('browser-runtime', 'Node', 'Browser runtime', 'technology', 'Modern browser executing the SPA and providing DOM, Clipboard, File System Access, and IndexedDB APIs.');
  el('static-host', 'Node', 'Static web host', 'technology', 'Hosts the built Vite assets for Archi Online.');
  el('github-platform', 'Node', 'GitHub platform', 'technology', 'External platform providing Gist and raw content endpoints.');
  el('local-device', 'Device', 'User workstation', 'technology', 'The device running the browser and holding local files.');
  el('react-runtime', 'SystemSoftware', 'React', 'technology', 'UI runtime used by the app shells, panels, and dialogs.');
  el('vite-build', 'SystemSoftware', 'Vite build', 'technology', 'Development server and production bundler for the browser app.');
  el('typescript', 'SystemSoftware', 'TypeScript', 'technology', 'Strict TypeScript source layer for application and model behavior.');
  el('monaco-lib', 'SystemSoftware', 'Monaco Editor', 'technology', 'Browser code editor library.');
  el('elk-lib', 'SystemSoftware', 'ELK.js', 'technology', 'Graph layout engine used by extension functionality.');
  el('fflate-lib', 'SystemSoftware', 'fflate', 'technology', 'Compression library used for inline share payloads.');
  el('idb-keyval-lib', 'SystemSoftware', 'idb-keyval', 'technology', 'Small key-value wrapper around IndexedDB.');
  el('gist-api', 'TechnologyService', 'GitHub Gist API', 'technology', 'api.github.com/gists create, update, and metadata read endpoints.');
  el('raw-content', 'TechnologyService', 'GitHub raw content', 'technology', 'gist.githubusercontent.com and raw.githubusercontent.com model file reads.');
  el('filesystem-api', 'TechnologyService', 'File System Access API', 'technology', 'Browser API for opening and saving local model files when available.');
  el('indexeddb-api', 'TechnologyService', 'IndexedDB API', 'technology', 'Browser database used by autosave, settings, token, and gist association stores.');
  el('clipboard-api', 'TechnologyService', 'Clipboard API', 'technology', 'Browser API used to place share links on the clipboard.');
  el('static-assets', 'Artifact', 'Production static assets', 'technology', 'Built HTML, CSS, JavaScript, workers, Monaco assets, and ELK bundle.');
  el('gist-file-artifact', 'Artifact', 'Gist .archimate file', 'technology', 'The .archimate file stored inside a GitHub Gist.');

  el('m1-sharing', 'WorkPackage', 'Milestone 1 model sharing', 'implementation_migration', 'Implemented read-only viewer links, inline payloads, GitHub gist-backed links, public raw loading, and open-copy editing.');
  el('m1-deliverable', 'Deliverable', 'Read-only viewer and gist sharing', 'implementation_migration', 'The shipped capability under test with this model.');
}

function addRelationships() {
  rel('author-influences-edit', 'InfluenceRelationship', 'model-author', 'edit-goal', '+', 'Model authors motivate browser-based editing.');
  rel('reviewer-influences-share', 'InfluenceRelationship', 'reviewer', 'share-goal', '+', 'Reviewers motivate link-based sharing.');
  rel('architect-influences-fidelity', 'InfluenceRelationship', 'enterprise-architect', 'fidelity-goal', '+', 'Enterprise architects need model fidelity.');
  rel('browser-driver-influences-edit', 'InfluenceRelationship', 'browser-first-driver', 'edit-goal', '++', 'Browser-first work strongly drives the editing goal.');
  rel('review-driver-influences-share', 'InfluenceRelationship', 'review-driver', 'share-goal', '++', 'Fast review loops strongly drive share links.');
  rel('url-risk-influences-gist', 'InfluenceRelationship', 'url-risk', 'share-links-req', '++', 'The URL risk drives gist-backed fallback.');
  rel('share-realizes-review', 'RealizationRelationship', 'share-links-req', 'share-goal', 'realizes', 'Share link requirement realizes the share goal.');
  rel('zero-auth-realizes-share', 'RealizationRelationship', 'zero-auth-req', 'share-goal', 'realizes', 'Zero-auth opening realizes practical model review.');
  rel('copy-realizes-readonly', 'RealizationRelationship', 'copy-req', 'readonly-goal', 'realizes', 'Open-copy editing keeps review links read-only.');
  rel('token-realizes-security', 'RealizationRelationship', 'token-req', 'readonly-goal', 'supports', 'Local token storage avoids embedding credentials in links.');
  rel('reuse-realizes-share', 'RealizationRelationship', 'gist-reuse-req', 'share-goal', 'supports', 'Stable gist reuse keeps shared URLs durable.');
  rel('principle-influences-fidelity', 'InfluenceRelationship', 'native-file-principle', 'fidelity-goal', '+', 'The native-file principle supports fidelity.');

  rel('author-assigned-author', 'AssignmentRelationship', 'model-author', 'author-process', 'performs', 'Model author performs the authoring process.');
  rel('author-process-accesses-model', 'AccessRelationship', 'author-process', 'architecture-model', 'updates', 'Authoring updates the architecture model.', { accessType: 3 });
  rel('author-triggers-share', 'TriggeringRelationship', 'author-process', 'share-process', 'then shares', 'The author shares after editing.');
  rel('share-accesses-model', 'AccessRelationship', 'share-process', 'architecture-model', 'serializes', 'Sharing reads the current model.', { accessType: 1 });
  rel('share-creates-link', 'AccessRelationship', 'share-process', 'review-link', 'writes', 'Sharing writes a review link.', { accessType: 0 });
  rel('reviewer-assigned-review', 'AssignmentRelationship', 'reviewer', 'review-process', 'performs', 'Reviewer performs the inspection process.');
  rel('review-reads-link', 'AccessRelationship', 'review-process', 'review-link', 'opens', 'Review process reads the shared link.', { accessType: 1 });
  rel('review-reads-model', 'AccessRelationship', 'review-process', 'architecture-model', 'inspects', 'Review process reads the architecture model.', { accessType: 1 });
  rel('review-triggers-copy', 'TriggeringRelationship', 'review-process', 'copy-process', 'optional copy', 'The reviewer can open a copy for editing.');
  rel('modeling-serves-author', 'ServingRelationship', 'modeling-service', 'author-process', 'supports', 'Modeling service serves authoring.');
  rel('review-serves-review', 'ServingRelationship', 'review-service', 'review-process', 'supports', 'Review service serves inspection.');

  rel('spa-composes-runtime', 'CompositionRelationship', 'spa', 'runtime-boot', 'contains', 'SPA contains runtime boot.');
  rel('spa-composes-app-shell', 'CompositionRelationship', 'spa', 'app-shell', 'contains', 'SPA contains editable shell.');
  rel('spa-composes-viewer-shell', 'CompositionRelationship', 'spa', 'viewer-shell', 'contains', 'SPA contains viewer shell.');
  rel('app-shell-composes-toolbar', 'CompositionRelationship', 'app-shell', 'toolbar', 'contains', 'App shell contains toolbar.');
  rel('app-shell-composes-tree', 'CompositionRelationship', 'app-shell', 'model-tree', 'contains', 'App shell contains model tree.');
  rel('app-shell-composes-editor', 'CompositionRelationship', 'app-shell', 'view-editor', 'contains', 'App shell contains view editor panels.');
  rel('app-shell-composes-props', 'CompositionRelationship', 'app-shell', 'properties-panel', 'contains', 'App shell contains properties panel.');
  rel('viewer-composes-editor', 'CompositionRelationship', 'viewer-shell', 'view-editor', 'contains readonly', 'Viewer shell contains read-only view editor.');
  rel('viewer-composes-props', 'CompositionRelationship', 'viewer-shell', 'properties-panel', 'contains inspect', 'Viewer shell contains properties inspection.');
  rel('app-shell-realizes-editing-service', 'RealizationRelationship', 'app-shell', 'model-editing-app-service', 'realizes', 'Editable shell realizes browser model editing.');
  rel('viewer-realizes-viewer-service', 'RealizationRelationship', 'viewer-shell', 'viewer-app-service', 'realizes', 'Viewer shell realizes read-only viewing.');
  rel('toolbar-realizes-share-service', 'RealizationRelationship', 'toolbar', 'share-app-service', 'realizes', 'Toolbar share command realizes share link generation.');
  rel('github-realizes-gist-service', 'RealizationRelationship', 'github-persistence', 'gist-app-service', 'realizes', 'GitHub module realizes gist publication.');
  rel('xml-realizes-xml-service', 'RealizationRelationship', 'xml-io', 'xml-app-service', 'realizes', 'XML module realizes import/export.');
  rel('extension-realizes-extension-service', 'RealizationRelationship', 'extension-runtime', 'extension-app-service', 'realizes', 'Extension runtime realizes extension API.');
  rel('script-realizes-script-service', 'RealizationRelationship', 'script-runner', 'scripting-app-service', 'realizes', 'Script runner realizes scripting service.');
  rel('model-store-accesses-state', 'AccessRelationship', 'model-store', 'model-state', 'owns', 'Store owns the normalized graph.', { accessType: 3 });
  rel('undo-accesses-state', 'AccessRelationship', 'undo-redo', 'model-state', 'mutates', 'Transactions mutate model state.', { accessType: 3 });
  rel('xml-accesses-state', 'AccessRelationship', 'xml-io', 'model-state', 'reads and writes', 'XML I/O parses and serializes ModelState.', { accessType: 3 });
  rel('xml-accesses-xml', 'AccessRelationship', 'xml-io', 'archimate-xml', 'reads/writes XML', 'XML I/O reads and writes ArchiMate XML.', { accessType: 3 });
  rel('share-encoding-accesses-xml', 'AccessRelationship', 'share-encoding', 'archimate-xml', 'compresses', 'Share encoding compresses serialized XML.', { accessType: 1 });
  rel('share-encoding-writes-payload', 'AccessRelationship', 'share-encoding', 'inline-payload', 'writes', 'Share encoding writes inline payloads.', { accessType: 0 });
  rel('share-encoding-writes-gist-link', 'AccessRelationship', 'share-encoding', 'gist-link-data', 'writes', 'Share encoding writes gist-backed links.', { accessType: 0 });
  rel('share-encoding-reads-raw-url', 'AccessRelationship', 'share-encoding', 'raw-url-data', 'reads', 'Share loader accepts raw URL fragments.', { accessType: 1 });
  rel('github-accesses-xml', 'AccessRelationship', 'github-persistence', 'archimate-xml', 'uploads/downloads', 'GitHub persistence uploads and downloads XML.', { accessType: 3 });
  rel('autosave-accesses-workspace', 'AccessRelationship', 'autosave', 'workspace-data', 'stores workspace', 'Autosave stores workspace data.', { accessType: 3 });
  rel('settings-accesses-workspace', 'AccessRelationship', 'settings-store', 'workspace-data', 'stores settings', 'Settings store uses IndexedDB workspace records.', { accessType: 3 });
  rel('file-accesses-local-file', 'AccessRelationship', 'file-persistence', 'local-file-data', 'opens/saves', 'File persistence opens and saves local files.', { accessType: 3 });
  rel('extension-accesses-package', 'AccessRelationship', 'extension-runtime', 'extension-package-data', 'loads', 'Extension runtime loads package data.', { accessType: 1 });
  rel('view-editor-serves-shells', 'ServingRelationship', 'view-editor', 'app-shell', 'renders diagrams', 'View editor serves the shell.');
  rel('properties-serves-shells', 'ServingRelationship', 'properties-panel', 'app-shell', 'shows metadata', 'Properties panel serves editable shell.');
  rel('model-store-serves-ui', 'ServingRelationship', 'model-store', 'app-shell', 'state API', 'Model store serves editor UI.');
  rel('model-store-serves-viewer', 'ServingRelationship', 'model-store', 'viewer-shell', 'readonly state', 'Model store serves viewer UI.');
  rel('share-encoding-serves-toolbar', 'ServingRelationship', 'share-encoding', 'toolbar', 'share helpers', 'Share encoding serves the toolbar.');
  rel('github-serves-share-encoding', 'ServingRelationship', 'github-persistence', 'share-encoding', 'gist helpers', 'GitHub persistence serves share encoding.');
  rel('xml-serves-file', 'ServingRelationship', 'xml-io', 'file-persistence', 'serialize/parse', 'XML I/O serves file persistence.');
  rel('xml-serves-share', 'ServingRelationship', 'xml-io', 'share-encoding', 'serialize/parse', 'XML I/O serves sharing.');
  rel('extension-serves-app-shell', 'ServingRelationship', 'extension-runtime', 'app-shell', 'commands/panels', 'Extension runtime serves app shell.');
  rel('script-serves-app-shell', 'ServingRelationship', 'script-runner', 'app-shell', 'script execution', 'Script runner serves the app shell.');

  rel('static-host-serves-browser', 'ServingRelationship', 'static-host', 'browser-runtime', 'serves assets', 'Static host serves assets to browser runtime.');
  rel('browser-hosts-spa', 'AssignmentRelationship', 'browser-runtime', 'spa', 'executes', 'Browser runtime executes the SPA.');
  rel('static-assets-realize-spa', 'RealizationRelationship', 'static-assets', 'spa', 'implements', 'Built static assets implement the SPA.');
  rel('react-serves-spa', 'ServingRelationship', 'react-runtime', 'spa', 'UI runtime', 'React serves the SPA.');
  rel('vite-realizes-assets', 'RealizationRelationship', 'vite-build', 'static-assets', 'builds', 'Vite produces static assets.');
  rel('typescript-realizes-spa', 'RealizationRelationship', 'typescript', 'spa', 'source', 'TypeScript source realizes application behavior.');
  rel('monaco-serves-editor', 'ServingRelationship', 'monaco-lib', 'monaco-editor', 'library', 'Monaco library serves editor component.');
  rel('elk-serves-extension', 'ServingRelationship', 'elk-lib', 'elk-extension', 'layout engine', 'ELK.js serves the layout extension.');
  rel('fflate-serves-share', 'ServingRelationship', 'fflate-lib', 'share-encoding', 'compression', 'fflate serves share encoding.');
  rel('idb-serves-autosave', 'ServingRelationship', 'idb-keyval-lib', 'autosave', 'keyval', 'idb-keyval serves autosave and local stores.');
  rel('gist-api-serves-github-module', 'ServingRelationship', 'gist-api', 'github-persistence', 'create/update/read', 'GitHub Gist API serves the app module.');
  rel('raw-content-serves-github-module', 'ServingRelationship', 'raw-content', 'github-persistence', 'raw XML', 'Raw content endpoints serve model loading.');
  rel('filesystem-serves-file-module', 'ServingRelationship', 'filesystem-api', 'file-persistence', 'local files', 'File System Access API serves file persistence.');
  rel('indexeddb-serves-stores', 'ServingRelationship', 'indexeddb-api', 'autosave', 'local database', 'IndexedDB serves autosave.');
  rel('clipboard-serves-toolbar', 'ServingRelationship', 'clipboard-api', 'toolbar', 'copy link', 'Clipboard API serves share link copy.');
  rel('github-platform-composes-api', 'CompositionRelationship', 'github-platform', 'gist-api', 'contains', 'GitHub platform contains Gist API.');
  rel('github-platform-composes-raw', 'CompositionRelationship', 'github-platform', 'raw-content', 'contains', 'GitHub platform contains raw content endpoints.');
  rel('local-device-composes-browser', 'CompositionRelationship', 'local-device', 'browser-runtime', 'runs', 'User workstation runs browser runtime.');
  rel('gist-file-realizes-xml', 'RealizationRelationship', 'gist-file-artifact', 'archimate-xml', 'stores', 'Gist file stores ArchiMate XML.');

  rel('m1-realizes-share-req', 'RealizationRelationship', 'm1-sharing', 'share-links-req', 'implements', 'Milestone 1 implements share links.');
  rel('m1-realizes-zero-auth', 'RealizationRelationship', 'm1-sharing', 'zero-auth-req', 'implements', 'Milestone 1 implements zero-auth viewing.');
  rel('m1-realizes-copy', 'RealizationRelationship', 'm1-sharing', 'copy-req', 'implements', 'Milestone 1 implements open-copy editing.');
  rel('m1-produces-deliverable', 'RealizationRelationship', 'm1-deliverable', 'm1-sharing', 'documents', 'Deliverable documents the milestone implementation.');
}

function addViews() {
  const goals = view('01-goals', '01 - Product Goals and Requirements', 'Motivation view for the model-sharing capable Archi Online app.', 'requirements_realization');
  const gStake = group(goals, 'stakeholders', 'Stakeholders and drivers', 20, 20, 720, 220);
  const gGoals = group(goals, 'goals', 'Goals', 780, 20, 600, 220);
  const gReqs = group(goals, 'requirements', 'Milestone 1 requirements', 120, 300, 1180, 270);
  const nAuthor = node(goals, gStake, 'author', 'model-author', 30, 35, 160, 60, '#ccccff');
  const nReviewer = node(goals, gStake, 'reviewer', 'reviewer', 210, 35, 160, 60, '#ccccff');
  const nArchitect = node(goals, gStake, 'architect', 'enterprise-architect', 390, 35, 170, 60, '#ccccff');
  const nBrowserDriver = node(goals, gStake, 'browser-driver', 'browser-first-driver', 110, 130, 220, 60, '#ccccff');
  const nReviewDriver = node(goals, gStake, 'review-driver', 'review-driver', 360, 130, 220, 60, '#ccccff');
  const nUrlRisk = node(goals, goals, 'url-risk', 'url-risk', 310, 250, 210, 70, '#ccccff');
  const nEditGoal = node(goals, gGoals, 'edit-goal', 'edit-goal', 40, 35, 200, 65, '#ccccff');
  const nShareGoal = node(goals, gGoals, 'share-goal', 'share-goal', 300, 35, 200, 65, '#ccccff');
  const nReadonlyGoal = node(goals, gGoals, 'readonly-goal', 'readonly-goal', 170, 130, 220, 65, '#ccccff');
  const nFidelityGoal = node(goals, gGoals, 'fidelity-goal', 'fidelity-goal', 430, 130, 150, 65, '#ccccff');
  const nShareReq = node(goals, gReqs, 'share-req', 'share-links-req', 35, 45, 190, 65, '#ccccff');
  const nZeroAuth = node(goals, gReqs, 'zero-auth', 'zero-auth-req', 245, 45, 190, 65, '#ccccff');
  const nCopyReq = node(goals, gReqs, 'copy-req', 'copy-req', 455, 45, 190, 65, '#ccccff');
  const nTokenReq = node(goals, gReqs, 'token-req', 'token-req', 665, 45, 190, 65, '#ccccff');
  const nReuseReq = node(goals, gReqs, 'reuse-req', 'gist-reuse-req', 875, 45, 190, 65, '#ccccff');
  const nPrinciple = node(goals, gReqs, 'native-principle', 'native-file-principle', 365, 160, 260, 65, '#ccccff');
  conn(goals, 'author-edit', 'author-influences-edit', nAuthor, nEditGoal);
  conn(goals, 'reviewer-share', 'reviewer-influences-share', nReviewer, nShareGoal);
  conn(goals, 'architect-fidelity', 'architect-influences-fidelity', nArchitect, nFidelityGoal);
  conn(goals, 'browser-edit', 'browser-driver-influences-edit', nBrowserDriver, nEditGoal);
  conn(goals, 'review-share', 'review-driver-influences-share', nReviewDriver, nShareGoal);
  conn(goals, 'risk-req', 'url-risk-influences-gist', nUrlRisk, nShareReq, '#a55');
  conn(goals, 'share-realizes', 'share-realizes-review', nShareReq, nShareGoal);
  conn(goals, 'zero-realizes', 'zero-auth-realizes-share', nZeroAuth, nShareGoal);
  conn(goals, 'copy-realizes', 'copy-realizes-readonly', nCopyReq, nReadonlyGoal);
  conn(goals, 'token-realizes', 'token-realizes-security', nTokenReq, nReadonlyGoal);
  conn(goals, 'reuse-realizes', 'reuse-realizes-share', nReuseReq, nShareGoal);
  conn(goals, 'principle-fidelity', 'principle-influences-fidelity', nPrinciple, nFidelityGoal);
  note(goals, 'scope', 'This model is the share-test artifact: it is large enough for gist fallback and structured enough to inspect in read-only viewer mode.', 980, 590, 340, 95);

  const app = view('02-application-map', '02 - Application Component Map', 'Application structure of the browser modeler and sharing slice.', 'application_structure');
  const gUi = group(app, 'ui', 'UI shells and panels', 30, 30, 520, 500);
  const gCore = group(app, 'core', 'Model core', 590, 30, 440, 500);
  const gPersist = group(app, 'persistence', 'Persistence and sharing', 1070, 30, 500, 500);
  const gExt = group(app, 'extension', 'Scripting and extensions', 420, 570, 680, 250);
  const nSpa = node(app, app, 'spa', 'spa', 30, 560, 260, 80, '#b5ffff');
  const nRuntime = node(app, gUi, 'runtime', 'runtime-boot', 25, 35, 175, 65, '#b5ffff');
  const nAppShell = node(app, gUi, 'app-shell', 'app-shell', 25, 135, 180, 65, '#b5ffff');
  const nViewer = node(app, gUi, 'viewer', 'viewer-shell', 250, 135, 180, 65, '#b5ffff');
  const nToolbar = node(app, gUi, 'toolbar', 'toolbar', 25, 235, 180, 65, '#b5ffff');
  const nCanvas = node(app, gUi, 'view-editor', 'view-editor', 250, 235, 180, 65, '#b5ffff');
  const nProps = node(app, gUi, 'properties', 'properties-panel', 250, 335, 180, 65, '#b5ffff');
  const nTree = node(app, gUi, 'tree', 'model-tree', 25, 335, 180, 65, '#b5ffff');
  const nStore = node(app, gCore, 'store', 'model-store', 35, 35, 180, 65, '#b5ffff');
  const nUndo = node(app, gCore, 'undo', 'undo-redo', 235, 35, 180, 65, '#b5ffff');
  const nXml = node(app, gCore, 'xml', 'xml-io', 35, 155, 180, 65, '#b5ffff');
  const nState = node(app, gCore, 'state', 'model-state', 235, 155, 180, 65, '#b5ffff');
  const nArchXml = node(app, gCore, 'archimate-xml', 'archimate-xml', 135, 295, 190, 65, '#b5ffff');
  const nShare = node(app, gPersist, 'share', 'share-encoding', 35, 35, 190, 65, '#b5ffff');
  const nGithub = node(app, gPersist, 'github', 'github-persistence', 270, 35, 190, 65, '#b5ffff');
  const nFile = node(app, gPersist, 'file', 'file-persistence', 35, 155, 190, 65, '#b5ffff');
  const nAutosave = node(app, gPersist, 'autosave', 'autosave', 270, 155, 190, 65, '#b5ffff');
  const nSettings = node(app, gPersist, 'settings', 'settings-store', 270, 275, 190, 65, '#b5ffff');
  const nPayload = node(app, gPersist, 'payload', 'inline-payload', 35, 275, 190, 65, '#b5ffff');
  const nWorkspace = node(app, gPersist, 'workspace', 'workspace-data', 270, 385, 190, 65, '#b5ffff');
  const nExtRuntime = node(app, gExt, 'extension-runtime', 'extension-runtime', 35, 45, 190, 65, '#b5ffff');
  const nScript = node(app, gExt, 'script-runner', 'script-runner', 255, 45, 190, 65, '#b5ffff');
  const nMonaco = node(app, gExt, 'monaco-editor', 'monaco-editor', 475, 45, 170, 65, '#b5ffff');
  const nPackage = node(app, gExt, 'extension-package', 'extension-package-data', 145, 150, 220, 65, '#b5ffff');
  conn(app, 'spa-runtime', 'spa-composes-runtime', nSpa, nRuntime);
  conn(app, 'spa-app-shell', 'spa-composes-app-shell', nSpa, nAppShell);
  conn(app, 'spa-viewer', 'spa-composes-viewer-shell', nSpa, nViewer);
  conn(app, 'app-toolbar', 'app-shell-composes-toolbar', nAppShell, nToolbar);
  conn(app, 'app-tree', 'app-shell-composes-tree', nAppShell, nTree);
  conn(app, 'app-editor', 'app-shell-composes-editor', nAppShell, nCanvas);
  conn(app, 'app-props', 'app-shell-composes-props', nAppShell, nProps);
  conn(app, 'viewer-editor', 'viewer-composes-editor', nViewer, nCanvas);
  conn(app, 'viewer-props', 'viewer-composes-props', nViewer, nProps);
  conn(app, 'store-ui', 'model-store-serves-ui', nStore, nAppShell);
  conn(app, 'store-viewer', 'model-store-serves-viewer', nStore, nViewer);
  conn(app, 'undo-state', 'undo-accesses-state', nUndo, nState);
  conn(app, 'store-state', 'model-store-accesses-state', nStore, nState);
  conn(app, 'xml-state', 'xml-accesses-state', nXml, nState);
  conn(app, 'xml-doc', 'xml-accesses-xml', nXml, nArchXml);
  conn(app, 'share-toolbar', 'share-encoding-serves-toolbar', nShare, nToolbar);
  conn(app, 'github-share', 'github-serves-share-encoding', nGithub, nShare);
  conn(app, 'share-xml', 'xml-serves-share', nXml, nShare);
  conn(app, 'share-payload', 'share-encoding-writes-payload', nShare, nPayload);
  conn(app, 'file-xml', 'xml-serves-file', nXml, nFile);
  conn(app, 'autosave-workspace', 'autosave-accesses-workspace', nAutosave, nWorkspace);
  conn(app, 'settings-workspace', 'settings-accesses-workspace', nSettings, nWorkspace);
  conn(app, 'extension-app', 'extension-serves-app-shell', nExtRuntime, nAppShell);
  conn(app, 'script-app', 'script-serves-app-shell', nScript, nAppShell);
  conn(app, 'extension-package', 'extension-accesses-package', nExtRuntime, nPackage);
  conn(app, 'script-service', 'script-realizes-script-service', nScript, nMonaco);

  const flow = view('03-share-flow', '03 - Share and Read-only Viewer Flow', 'End-to-end model sharing flow exercised by this generated test model.', 'application_usage');
  const nProcAuthor = node(flow, flow, 'author-process', 'author-process', 30, 80, 170, 70, '#ffffb5');
  const nProcShare = node(flow, flow, 'share-process', 'share-process', 250, 80, 170, 70, '#ffffb5');
  const nToolbarFlow = node(flow, flow, 'toolbar', 'toolbar', 470, 80, 180, 70, '#b5ffff');
  const nShareMod = node(flow, flow, 'share-module', 'share-encoding', 700, 80, 190, 70, '#b5ffff');
  const nGithubFlow = node(flow, flow, 'github-module', 'github-persistence', 940, 80, 200, 70, '#b5ffff');
  const nGistApi = node(flow, flow, 'gist-api', 'gist-api', 1190, 80, 170, 70, '#c9e7b7');
  const nXmlData = node(flow, flow, 'xml-data', 'archimate-xml', 700, 230, 190, 70, '#b5ffff');
  const nGistLink = node(flow, flow, 'gist-link', 'gist-link-data', 940, 230, 200, 70, '#b5ffff');
  const nReviewProcess = node(flow, flow, 'review-process', 'review-process', 1190, 230, 170, 70, '#ffffb5');
  const nViewerFlow = node(flow, flow, 'viewer-shell', 'viewer-shell', 940, 390, 200, 70, '#b5ffff');
  const nCopyProcess = node(flow, flow, 'copy-process', 'copy-process', 700, 390, 190, 70, '#ffffb5');
  const nStoreFlow = node(flow, flow, 'store', 'model-store', 470, 390, 180, 70, '#b5ffff');
  conn(flow, 'author-share', 'author-triggers-share', nProcAuthor, nProcShare);
  conn(flow, 'share-toolbar', 'toolbar-realizes-share-service', nToolbarFlow, nProcShare);
  conn(flow, 'share-service', 'share-encoding-serves-toolbar', nShareMod, nToolbarFlow);
  conn(flow, 'github-service', 'github-serves-share-encoding', nGithubFlow, nShareMod);
  conn(flow, 'gist-api', 'gist-api-serves-github-module', nGistApi, nGithubFlow);
  conn(flow, 'github-xml', 'github-accesses-xml', nGithubFlow, nXmlData);
  conn(flow, 'share-gist-link', 'share-encoding-writes-gist-link', nShareMod, nGistLink);
  conn(flow, 'review-link', 'review-reads-link', nReviewProcess, nGistLink);
  conn(flow, 'viewer-service', 'viewer-realizes-viewer-service', nViewerFlow, nReviewProcess);
  conn(flow, 'review-copy', 'review-triggers-copy', nReviewProcess, nCopyProcess);
  conn(flow, 'copy-store', 'copy-realizes-readonly', nCopyProcess, nStoreFlow);
  note(flow, 'flow-note', 'The viewer boot path hydrates settings and shared model only. It skips autosave and extensions so a copied shared model cannot be overwritten by a previous workspace.', 45, 350, 360, 110);

  const runtime = view('04-runtime-context', '04 - Runtime and Persistence Context', 'Technology and external services used by the browser app.', 'technology');
  const nDevice = node(runtime, runtime, 'device', 'local-device', 40, 80, 190, 75, '#c9e7b7');
  const nBrowser = node(runtime, runtime, 'browser', 'browser-runtime', 290, 80, 190, 75, '#c9e7b7');
  const nHost = node(runtime, runtime, 'host', 'static-host', 40, 260, 190, 75, '#c9e7b7');
  const nAssets = node(runtime, runtime, 'assets', 'static-assets', 290, 260, 190, 75, '#c9e7b7');
  const nSpaRuntime = node(runtime, runtime, 'spa', 'spa', 540, 80, 190, 75, '#b5ffff');
  const nGithubPlatform = node(runtime, runtime, 'github-platform', 'github-platform', 1040, 80, 210, 75, '#c9e7b7');
  const nGistService = node(runtime, runtime, 'gist-api', 'gist-api', 1040, 220, 210, 75, '#c9e7b7');
  const nRawService = node(runtime, runtime, 'raw-content', 'raw-content', 1040, 360, 210, 75, '#c9e7b7');
  const nGithubModule = node(runtime, runtime, 'github-module', 'github-persistence', 790, 220, 190, 75, '#b5ffff');
  const nFileModule = node(runtime, runtime, 'file-module', 'file-persistence', 540, 410, 190, 75, '#b5ffff');
  const nIndexedDb = node(runtime, runtime, 'indexeddb', 'indexeddb-api', 290, 440, 190, 75, '#c9e7b7');
  const nFileApi = node(runtime, runtime, 'file-api', 'filesystem-api', 40, 440, 190, 75, '#c9e7b7');
  const nClipboard = node(runtime, runtime, 'clipboard-api', 'clipboard-api', 540, 260, 190, 75, '#c9e7b7');
  const nGistArtifact = node(runtime, runtime, 'gist-file', 'gist-file-artifact', 790, 360, 190, 75, '#c9e7b7');
  conn(runtime, 'device-browser', 'local-device-composes-browser', nDevice, nBrowser);
  conn(runtime, 'host-browser', 'static-host-serves-browser', nHost, nBrowser);
  conn(runtime, 'assets-spa', 'static-assets-realize-spa', nAssets, nSpaRuntime);
  conn(runtime, 'browser-spa', 'browser-hosts-spa', nBrowser, nSpaRuntime);
  conn(runtime, 'clipboard-toolbar', 'clipboard-serves-toolbar', nClipboard, nSpaRuntime);
  conn(runtime, 'fileapi-file', 'filesystem-serves-file-module', nFileApi, nFileModule);
  conn(runtime, 'idb-autosave', 'indexeddb-serves-stores', nIndexedDb, nSpaRuntime);
  conn(runtime, 'gist-platform-api', 'github-platform-composes-api', nGithubPlatform, nGistService);
  conn(runtime, 'gist-platform-raw', 'github-platform-composes-raw', nGithubPlatform, nRawService);
  conn(runtime, 'gist-api-module', 'gist-api-serves-github-module', nGistService, nGithubModule);
  conn(runtime, 'raw-module', 'raw-content-serves-github-module', nRawService, nGithubModule);
  conn(runtime, 'gist-file-xml', 'gist-file-realizes-xml', nGistArtifact, nGithubModule);
}

function tag(indent, name, attrs = [], children = []) {
  const filtered = attrs.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const attrText = filtered.map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`).join('');
  if (children.length === 0) return `${indent}<${name}${attrText}/>`;
  return `${indent}<${name}${attrText}>\n${children.join('\n')}\n${indent}</${name}>`;
}

function textTag(indent, name, text) {
  return `${indent}<${name}>${escapeXml(text)}</${name}>`;
}

function docTag(indent, text) {
  return text ? [textTag(indent, 'documentation', text)] : [];
}

function propertyTags(indent, properties) {
  return properties.map((property) =>
    tag(indent, 'property', [['key', property.key]], [textTag(indent + '  ', 'value', property.value)]),
  );
}

function writeBounds(indent, bounds) {
  return tag(indent, 'bounds', [
    ['x', bounds.x !== 0 ? bounds.x : undefined],
    ['y', bounds.y !== 0 ? bounds.y : undefined],
    ['width', bounds.width],
    ['height', bounds.height],
  ]);
}

function writeConnection(indent, connection) {
  return tag(
    indent,
    'sourceConnection',
    [
      ['xsi:type', 'archimate:Connection'],
      ['id', connection.id],
      ['lineColor', connection.lineColor],
      ['lineWidth', connection.lineWidth],
      ['source', connection.sourceId],
      ['target', connection.targetId],
      ['archimateRelationship', connection.relationshipId],
    ],
    [],
  );
}

function writeNode(indent, nodeId) {
  const item = state.nodes[nodeId];
  const xsiType =
    item.nodeType === 'element'
      ? 'archimate:DiagramObject'
      : item.nodeType === 'group'
        ? 'archimate:Group'
        : item.nodeType === 'note'
          ? 'archimate:Note'
          : 'archimate:DiagramModelReference';
  const attrs = [
    ['xsi:type', xsiType],
    ['id', item.id],
    ['name', item.nodeType === 'group' ? item.name : undefined],
    ['targetConnections', item.targetConnectionIds.length ? item.targetConnectionIds.join(' ') : undefined],
    ['lineColor', item.lineColor],
    ['fillColor', item.fillColor],
    ['archimateElement', item.nodeType === 'element' ? item.elementId : undefined],
    ['borderType', item.nodeType === 'group' || item.nodeType === 'note' ? item.borderType : undefined],
  ];
  const children = [writeBounds(indent + '  ', item.bounds)];
  for (const connectionId of item.sourceConnectionIds) children.push(writeConnection(indent + '  ', state.connections[connectionId]));
  for (const childId of item.childIds) children.push(writeNode(indent + '  ', childId));
  if (item.nodeType === 'note') children.push(textTag(indent + '  ', 'content', item.content));
  if (item.nodeType === 'group') children.push(...docTag(indent + '  ', item.documentation));
  return tag(indent, 'child', attrs, children);
}

function writeItem(indent, id) {
  const element = state.elements[id];
  if (element) {
    return tag(
      indent,
      'element',
      [
        ['xsi:type', `archimate:${element.type}`],
        ['name', element.name],
        ['id', element.id],
      ],
      [...docTag(indent + '  ', element.documentation), ...propertyTags(indent + '  ', element.properties)],
    );
  }
  const relationship = state.relationships[id];
  if (relationship) {
    return tag(
      indent,
      'element',
      [
        ['xsi:type', `archimate:${relationship.type}`],
        ['name', relationship.name],
        ['id', relationship.id],
        ['source', relationship.sourceId],
        ['target', relationship.targetId],
        ['accessType', relationship.accessType],
        ['strength', relationship.strength],
        ['directed', relationship.directed ? 'true' : undefined],
      ],
      [...docTag(indent + '  ', relationship.documentation), ...propertyTags(indent + '  ', relationship.properties)],
    );
  }
  const diagram = state.views[id];
  if (diagram) {
    return tag(
      indent,
      'element',
      [
        ['xsi:type', 'archimate:ArchimateDiagramModel'],
        ['name', diagram.name],
        ['id', diagram.id],
        ['connectionRouterType', diagram.connectionRouterType],
        ['viewpoint', diagram.viewpoint],
      ],
      [
        ...diagram.childIds.map((childId) => writeNode(indent + '  ', childId)),
        ...docTag(indent + '  ', diagram.documentation),
        ...propertyTags(indent + '  ', diagram.properties),
      ],
    );
  }
  return '';
}

function writeFolder(indent, folderId) {
  const folder = state.folders[folderId];
  return tag(
    indent,
    'folder',
    [
      ['name', folder.name],
      ['id', folder.id],
      ['type', folder.folderType],
    ],
    [
      ...folder.folderIds.map((childId) => writeFolder(indent + '  ', childId)),
      ...folder.itemIds.map((itemId) => writeItem(indent + '  ', itemId)),
      ...docTag(indent + '  ', folder.documentation),
      ...propertyTags(indent + '  ', folder.properties),
    ],
  );
}

function serialize() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    tag(
      '',
      'archimate:model',
      [
        ['xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'],
        ['xmlns:archimate', ARCHIMATE_NS],
        ['name', state.info.name],
        ['id', state.info.id],
        ['version', state.info.version],
      ],
      [
        ...state.rootFolderIds.map((folderId) => writeFolder('  ', folderId)),
        textTag('  ', 'purpose', state.info.documentation),
        ...propertyTags('  ', state.info.properties),
      ],
    )
  );
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

addElements();
addRelationships();
addViews();

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, serialize(), 'utf8');

console.log(`Wrote ${OUTPUT_PATH}`);
console.log(
  JSON.stringify(
    {
      elements: Object.keys(state.elements).length,
      relationships: Object.keys(state.relationships).length,
      views: Object.keys(state.views).length,
      nodes: Object.keys(state.nodes).length,
      connections: Object.keys(state.connections).length,
    },
    null,
    2,
  ),
);
