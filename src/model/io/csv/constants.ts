// CSV format constants, ported from Archi's CSVConstants.java.

export const ARCHIMATE_MODEL_TYPE = 'ArchimateModel';

export const MODEL_ELEMENTS_HEADER = ['ID', 'Type', 'Name', 'Documentation', 'Specialization'];
export const RELATIONSHIPS_HEADER = [
  'ID',
  'Type',
  'Name',
  'Documentation',
  'Source',
  'Target',
  'Specialization',
];
export const PROPERTIES_HEADER = ['ID', 'Key', 'Value'];

export const ELEMENTS_FILENAME = 'elements';
export const RELATIONS_FILENAME = 'relations';
export const PROPERTIES_FILENAME = 'properties';
export const CSV_FILE_EXTENSION = '.csv';

export const CRLF = '\r\n';

export const CSV_DELIMITERS = [',', ';', '\t'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export const INFLUENCE_STRENGTH = 'Influence_Strength';
export const ACCESS_TYPE = 'Access_Type';
/** Index in this list == our accessType value (0=Write 1=Read 2=Access 3=ReadWrite). */
export const ACCESS_TYPES = ['Write', 'Read', 'Access', 'ReadWrite'];
export const ASSOCIATION_DIRECTED = 'Directed';
export const JUNCTION_TYPE = 'Junction_Type';
export const JUNCTION_OR = 'Or';
export const JUNCTION_AND = 'And';
