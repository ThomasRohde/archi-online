import { getActiveModelStore, type ModelStore } from '../../model/store';
import { state } from './state';
import { JConcept, JFolder, JModel, JObject, JView } from './wrappers';

export function matchesSelector(obj: JObject, selector: string): boolean {
  if (selector === '*') return true;
  if (selector.startsWith('#')) return obj.id === selector.slice(1);
  if (selector.startsWith('.')) return obj.name === selector.slice(1);

  // Type selector with optional .name suffix: "business-actor.Bob".
  const dot = selector.indexOf('.');
  const typePart = dot >= 0 ? selector.slice(0, dot) : selector;
  const namePart = dot >= 0 ? selector.slice(dot + 1) : undefined;
  let typeOk: boolean;
  switch (typePart) {
    case 'concept':
      typeOk = obj.kind === 'element' || obj.kind === 'relationship';
      break;
    case 'element':
      typeOk = obj.kind === 'element';
      break;
    case 'relationship':
      typeOk = obj.kind === 'relationship';
      break;
    case 'view':
      typeOk = obj.kind === 'view';
      break;
    case 'folder':
      typeOk = obj.kind === 'folder';
      break;
    default:
      typeOk = obj.type === typePart;
  }
  return typeOk && (namePart === undefined || obj.name === namePart);
}

export function allObjects(store: ModelStore = getActiveModelStore()): JObject[] {
  const m = state(store);
  const out: JObject[] = [];
  for (const id of Object.keys(m.folders)) out.push(new JFolder(id, store));
  for (const id of Object.keys(m.elements)) out.push(new JConcept(id, store));
  for (const id of Object.keys(m.relationships)) out.push(new JConcept(id, store));
  for (const id of Object.keys(m.views)) out.push(new JView(id, store));
  return out;
}

export function modelObject(store: ModelStore = getActiveModelStore()): JModel {
  return new JModel('model', store);
}
