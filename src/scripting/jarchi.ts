// jArchi-compatible scripting API (https://github.com/archimatetool/archi-scripting-plugin).
// This facade preserves the public imports while the implementation lives in
// smaller modules grouped by wrappers, selectors, collections, and globals.

export { JCollection } from './jarchi/collection';
export { createJArchiGlobals } from './jarchi/globals';
export { $$ } from './jarchi/query';
export {
  JConcept,
  JConnection,
  JFolder,
  JModel,
  JView,
  JVisual,
  wrap,
  type JConnectable,
  type JFindReplaceOptions,
  type JFindReplacePreview,
  type JFindReplaceRow,
  type JFindReplaceSearchOptions,
  type JKind,
  type JPropertyKeyUsage,
  type JPropertyMutationPreview,
  type JPropertyOccurrence,
} from './jarchi/wrappers';
