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
  type JKind,
} from './jarchi/wrappers';
