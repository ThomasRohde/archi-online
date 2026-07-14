/** Locale-independent UTF-16 lexical ordering for deterministic persisted and truncated output. */
export function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
