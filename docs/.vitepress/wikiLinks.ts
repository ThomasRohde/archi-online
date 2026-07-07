import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

// Rewrites GitHub-wiki `[[links]]` (used in docs/wiki/*.md for the GitHub Wiki)
// into normal markdown links so the same source renders on the VitePress site.
// Mirrors the target semantics of tools/check-wiki-docs.mjs `wikiTargetToFile()`:
//   [[Text|slug]] -> link text "Text", target "slug"
//   [[slug]]      -> link text "slug", target "slug"
// The last `|`-segment is the target; an optional `#anchor` is preserved.
// `Home` maps to the site root (the hero replaces the wiki Home page).
function hrefFor(target: string): string {
  const [pagePart, anchor] = target.split('#');
  const page = pagePart.trim();
  const suffix = anchor ? `#${anchor}` : '';
  if (!page || page === 'Home') return `/${suffix}`;
  return `/wiki/${page}${suffix}`;
}

function wikiLink(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5b) return false;
  const end = src.indexOf(']]', start + 2);
  if (end < 0) return false;
  const inner = src.slice(start + 2, end);
  if (inner.includes('\n')) return false;

  const segments = inner.split('|');
  const text = (segments.length > 1 ? segments[0] : inner).trim();
  const target = segments[segments.length - 1].trim();

  if (!silent) {
    const open = state.push('link_open', 'a', 1);
    open.attrs = [['href', hrefFor(target)]];
    const content = state.push('text', '', 0);
    content.content = text;
    state.push('link_close', 'a', -1);
  }
  state.pos = end + 2;
  return true;
}

export function wikiLinksPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', wikiLink);
}
