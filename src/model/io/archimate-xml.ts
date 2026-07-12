// Reader/writer for Archi's native .archimate XML format.
// The facade preserves the existing import path while parser and serializer
// internals live in smaller modules.

export { ArchimateParseError, parseArchimate } from './archimate-xml/parse';
export { serializeArchimate } from './archimate-xml/serialize';
export {
  isArchimateZip,
  parseArchimateDocument,
  serializeArchimateDocument,
} from './archimate-document';
