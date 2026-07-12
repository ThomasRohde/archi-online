import { transact, type ModelStore } from '../store';
import type { DublinCoreEntry } from '../types';

export function setModelExchangeInfo(
  metadata: DublinCoreEntry[],
  language: string,
  store?: ModelStore,
): void {
  transact('Edit Exchange Metadata', (draft) => {
    draft.info.metadata = metadata.map((entry) => ({ ...entry }));
    draft.info.language = language;
  }, store);
}
