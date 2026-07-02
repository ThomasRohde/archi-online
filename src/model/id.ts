/** Archi-style ids: "id-" + 32 hex chars. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'id-' + crypto.randomUUID().replace(/-/g, '');
  }
  let s = 'id-';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
