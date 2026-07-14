// Model operations facade. Every mutation still goes through transact() in the
// implementation modules so undo/redo, UI, and scripting behave uniformly.

export * from './ops/concepts';
export * from './ops/concept-transform';
export * from './ops/relationship-inversion';
export * from './ops/alignment';
export * from './ops/c4';
export * from './ops/csv-import';
export * from './ops/profiles';
export * from './ops/plain-connection';
export * from './ops/legend';
export * from './ops/reconnection';
export * from './ops/assets';
export * from './ops/deletion';
export * from './ops/duplicate';
export * from './ops/layout';
export * from './ops/magic-connector';
export * from './ops/metadata';
export * from './ops/movement';
export * from './ops/nesting';
export * from './ops/style';
export * from './ops/view';
export * from './ops/find-replace';
export * from './ops/property-manager';
export * from './ops/generate-view';
