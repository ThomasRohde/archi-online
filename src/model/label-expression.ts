import { elementLabel, relationshipLabel } from './metamodel';
import { VIEWPOINTS } from './data/viewpoints';
import type {
  ArchimateElement,
  ArchimateRelationship,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Folder,
  ModelInfo,
  ModelState,
  Property,
} from './types';

export interface LabelDiagnostic {
  severity: 'error' | 'warning';
  message: string;
}

export interface LabelEvaluationResult {
  text: string;
  diagnostics: LabelDiagnostic[];
}

const ERROR_TEXT = '*** Error in Label Expression ***';
const RECURSION_TEXT = '*** Recursion Error in Label Expression ***';
const CORE_PREFIXES = new Set(['model', 'view', 'mfolder', 'vfolder', 'parent', 'source', 'target']);
const RELATION_PREFIXES = new Set([
  'connection', 'triggering', 'access', 'specialization', 'composition', 'assignment',
  'aggregation', 'realization', 'serving', 'influence', 'flow', 'association',
]);
const OFFICIAL_PREFIX = new RegExp(
  `\\$(${[...CORE_PREFIXES].join('|')}|(?:${[...RELATION_PREFIXES].join('|')}):(?:source|target))\\{([^{}]*)\\}`,
  'g',
);

type LabelObject = ModelInfo | Folder | DiagramView | DiagramNode | DiagramConnection | ArchimateElement | ArchimateRelationship;

class ExpressionError extends Error {}
class RecursionError extends Error {}

export function evaluateLabelExpression(
  model: ModelState,
  objectId: string,
  expression?: string,
): LabelEvaluationResult {
  const source = objectById(model, objectId);
  if (!source) return { text: '', diagnostics: [{ severity: 'error', message: `Object '${objectId}' was not found.` }] };
  const configured = expression ?? ('labelExpression' in source ? source.labelExpression : undefined);
  if (configured === undefined || configured === '') return { text: defaultLabel(model, source), diagnostics: [] };
  try {
    let text = configured.replace(/\\n/g, '\n').replace(OFFICIAL_PREFIX, (_match, prefix, token) => `\${${prefix}:${token}}`);
    const seen = new Set<string>();
    for (let pass = 0; pass < 10; pass++) {
      seen.add(text);
      const next = renderText(model, source, text, 0);
      if (next !== text && seen.has(next)) throw new RecursionError(RECURSION_TEXT);
      if (next === text || !next.includes('${')) {
        text = next;
        break;
      }
      text = next;
      if (pass === 9) throw new RecursionError(RECURSION_TEXT);
    }
    text = text
      .replace(/\\:/g, ':')
      .replace(/\\\\/g, '\\');
    return { text, diagnostics: [] };
  } catch (error) {
    const recursion = error instanceof RecursionError;
    const text = recursion ? RECURSION_TEXT : ERROR_TEXT;
    return {
      text,
      diagnostics: [{ severity: 'error', message: error instanceof Error ? error.message : text }],
    };
  }
}

export function labelForModelTreeItem(model: ModelState, objectId: string): string {
  const object = objectById(model, objectId);
  if (!object) return '';
  const expression = ancestorFolderExpression(model, object);
  if (expression) return evaluateLabelExpression(model, objectId, expression).text;
  if ('kind' in object && object.kind === 'relationship') {
    const source = model.elements[object.sourceId] ?? model.relationships[object.sourceId];
    const target = model.elements[object.targetId] ?? model.relationships[object.targetId];
    const base = object.name || relationshipLabel(object.type);
    return `${base} (${source?.name ?? '?'} → ${target?.name ?? '?'})`;
  }
  return defaultLabel(model, object);
}

function renderText(model: ModelState, context: LabelObject, text: string, depth: number): string {
  if (depth >= 10) throw new RecursionError(RECURSION_TEXT);
  let result = '';
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('${', cursor);
    if (start < 0) return result + text.slice(cursor);
    result += text.slice(cursor, start);
    const end = matchingBrace(text, start + 2);
    if (end < 0) throw new ExpressionError('Unclosed label expression.');
    const token = text.slice(start + 2, end);
    result += evaluateToken(model, context, token, depth + 1);
    cursor = end + 1;
  }
  return result;
}

function matchingBrace(text: string, from: number): number {
  let nested = 0;
  for (let index = from; index < text.length; index++) {
    if (text[index] === '$' && text[index + 1] === '{') {
      nested++;
      index++;
    } else if (text[index] === '}') {
      if (nested === 0) return index;
      nested--;
    }
  }
  return -1;
}

function splitToken(token: string): string[] {
  const parts: string[] = [];
  let current = '';
  let nested = 0;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === '\\' && index + 1 < token.length) {
      current += char + token[++index];
    } else if (char === '$' && token[index + 1] === '{') {
      nested++;
      current += '${';
      index++;
    } else if (char === '}' && nested > 0) {
      nested--;
      current += char;
    } else if (char === ':' && nested === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function evaluateToken(model: ModelState, context: LabelObject, token: string, depth: number): string {
  const parts = splitToken(token);
  const command = parts[0];
  if (command === 'if') {
    if (parts.length < 3 || parts.length > 4) throw new ExpressionError('Invalid if expression.');
    const condition = renderText(model, context, parts[1], depth);
    return renderText(model, context, condition.trim() ? parts[2] : (parts[3] ?? ''), depth);
  }
  if (command === 'nvl') {
    if (parts.length !== 3) throw new ExpressionError('Invalid nvl expression.');
    const value = renderText(model, context, parts[1], depth);
    return value.trim() ? value : renderText(model, context, parts[2], depth);
  }
  if (command === 'wordwrap') {
    if (parts.length < 3) throw new ExpressionError('Invalid wordwrap expression.');
    const width = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(width) || width < 1) throw new ExpressionError('Invalid wordwrap width.');
    return wordWrap(renderText(model, context, parts.slice(2).join(':'), depth), width);
  }

  let prefix: string | undefined;
  let fieldIndex = 0;
  if (CORE_PREFIXES.has(parts[0])) {
    prefix = parts[0];
    fieldIndex = 1;
  } else if (RELATION_PREFIXES.has(parts[0]) && (parts[1] === 'source' || parts[1] === 'target')) {
    prefix = `${parts[0]}:${parts[1]}`;
    fieldIndex = 2;
  }
  const target = objectForPrefix(model, context, prefix);
  if (!target) return '';
  const field = parts[fieldIndex];
  const args = parts.slice(fieldIndex + 1);
  if (!prefix && field === 'viewpoint' && 'viewId' in context) {
    const viewpoint = model.views[context.viewId]?.viewpoint;
    return VIEWPOINTS.find((candidate) => candidate.id === viewpoint)?.name ?? viewpoint ?? '';
  }
  switch (field) {
    case 'name': return objectName(target);
    case 'documentation':
    case 'doc': return 'documentation' in target ? target.documentation : '';
    case 'type': return objectType(target);
    case 'specialization': return specialization(model, target);
    case 'content': return 'nodeType' in target && target.nodeType === 'note' ? target.content : '';
    case 'property': return propertyValue(propertiesOf(target), args.join(':'));
    case 'properties':
      if (args.length >= 2) return propertyValues(propertiesOf(target), args.slice(1).join(':'), args[0]);
      return propertiesOf(target).map((property) => `${property.key}: ${property.value}`).join('\n');
    case 'propertiesvalues': return propertiesOf(target).map((property) => property.value).join('\n');
    case 'strength': return 'kind' in target && target.kind === 'relationship' ? target.strength ?? '' : '';
    case 'accessType': return accessType(target);
    case 'viewpoint': return '';
    default: return '${' + token + '}';
  }
}

function objectById(model: ModelState, id: string): LabelObject | undefined {
  if (id === model.info.id) return model.info;
  return model.nodes[id] ?? model.connections[id] ?? model.elements[id] ?? model.relationships[id] ?? model.views[id] ?? model.folders[id];
}

function actualObject(model: ModelState, object: LabelObject | undefined): LabelObject | undefined {
  if (!object) return undefined;
  if ('nodeType' in object && object.nodeType === 'element') return model.elements[object.elementId];
  if ('nodeType' in object && object.nodeType === 'ref') return model.views[object.refViewId];
  if ('connType' in object && object.relationshipId) return model.relationships[object.relationshipId];
  return object;
}

function objectForPrefix(model: ModelState, context: LabelObject, prefix?: string): LabelObject | undefined {
  const actual = actualObject(model, context);
  if (!prefix) return actual;
  if (prefix === 'model') return model.info;
  if (prefix === 'view' && ('viewId' in context)) return model.views[context.viewId];
  if (prefix === 'mfolder' && actual && 'folderId' in actual) return model.folders[actual.folderId];
  if (prefix === 'vfolder' && 'viewId' in context) return model.folders[model.views[context.viewId]?.folderId];
  if (prefix === 'parent') {
    if ('nodeType' in context) return actualObject(model, model.nodes[context.parentId] ?? model.views[context.parentId]);
    if ('connType' in context) return actualObject(model, model.nodes[context.sourceId]);
    if ('kind' in context && context.kind === 'folder') return context.parentId ? model.folders[context.parentId] : undefined;
  }
  if ((prefix === 'source' || prefix === 'target') && 'connType' in context) {
    return actualObject(model, model.nodes[prefix === 'source' ? context.sourceId : context.targetId]);
  }
  if (prefix.endsWith(':source') || prefix.endsWith(':target')) {
    const direction = prefix.endsWith(':source') ? 'source' : 'target';
    const relationKind = prefix.slice(0, prefix.indexOf(':'));
    return linkedObject(model, context, relationKind, direction);
  }
  return undefined;
}

function linkedObject(model: ModelState, context: LabelObject, relationKind: string, direction: 'source' | 'target'): LabelObject | undefined {
  const node = 'nodeType' in context ? context : undefined;
  if (node) {
    const connectionIds = direction === 'source' ? node.targetConnectionIds : node.sourceConnectionIds;
    for (const id of connectionIds) {
      const connection = model.connections[id];
      const rel = connection?.relationshipId ? model.relationships[connection.relationshipId] : undefined;
      const type = rel?.type.toLowerCase() ?? 'connection';
      if (type.includes(relationKind)) return actualObject(model, model.nodes[direction === 'source' ? connection.sourceId : connection.targetId]);
    }
  }
  const actual = actualObject(model, context);
  if (actual && 'kind' in actual && (actual.kind === 'element' || actual.kind === 'relationship')) {
    for (const rel of Object.values(model.relationships)) {
      const matchesEndpoint = direction === 'source' ? rel.targetId === actual.id : rel.sourceId === actual.id;
      if (matchesEndpoint && rel.type.toLowerCase().includes(relationKind)) {
        return model.elements[direction === 'source' ? rel.sourceId : rel.targetId] ?? model.relationships[direction === 'source' ? rel.sourceId : rel.targetId];
      }
    }
  }
  return undefined;
}

function propertiesOf(object: LabelObject): Property[] {
  return 'properties' in object ? object.properties : [];
}

function propertyValue(properties: Property[], key: string): string {
  return properties.find((property) => property.key === key)?.value ?? '';
}

function propertyValues(properties: Property[], key: string, separator: string): string {
  return properties.filter((property) => property.key === key).map((property) => property.value).join(separator);
}

function specialization(model: ModelState, object: LabelObject): string {
  if (!('profileIds' in object)) return '';
  return model.profiles[object.profileIds[0]]?.name ?? '';
}

function objectName(object: LabelObject): string {
  if ('name' in object) return object.name;
  if ('nodeType' in object && object.nodeType === 'note') return object.content;
  return '';
}

function objectType(object: LabelObject): string {
  if ('kind' in object && object.kind === 'element') return elementLabel(object.type);
  if ('kind' in object && object.kind === 'relationship') return relationshipLabel(object.type);
  if ('kind' in object && object.kind === 'view') return 'View';
  if ('kind' in object && object.kind === 'folder') return 'Folder';
  if ('nodeType' in object) return object.nodeType === 'group' ? 'Group' : object.nodeType === 'note' ? 'Note' : 'View Reference';
  if ('connType' in object) return 'Connection';
  return 'Model';
}

function accessType(object: LabelObject): string {
  if (!('kind' in object) || object.kind !== 'relationship' || object.type !== 'AccessRelationship') return '';
  return ['Write', 'Read', 'Access', 'Read/Write'][object.accessType ?? 0] ?? '';
}

function defaultLabel(model: ModelState, object: LabelObject): string {
  const actual = actualObject(model, object) ?? object;
  return objectName(actual);
}

function ancestorFolderExpression(model: ModelState, object: LabelObject): string | undefined {
  let folderId = 'folderId' in object ? object.folderId : ('kind' in object && object.kind === 'folder' ? object.parentId : undefined);
  while (folderId) {
    const folder = model.folders[folderId];
    if (!folder) return undefined;
    if (folder.labelExpression !== undefined) return folder.labelExpression;
    folderId = folder.parentId ?? undefined;
  }
  return undefined;
}

function wordWrap(text: string, width: number): string {
  const inputLines = text.match(/[^\n]*\n|[^\n]+/g) ?? [];
  return inputLines.map((line) => {
    if (line.length <= width) return line;
    const words = line.match(/.*? |.+$/g) ?? [];
    const completed: string[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length <= width) current += word;
      else if (current.length + word.trim().length <= width) current += word.trim();
      else {
        if (current) completed.push(current);
        current = word;
      }
    }
    if (current) completed.push(current);
    return completed.join('\n');
  }).join('');
}
