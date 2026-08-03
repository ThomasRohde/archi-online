export interface PackedLabelSpec {
  text: string;
  fontSizePx: number;
  lineHeightPx?: number;
  maxLines?: number;
  horizontalPadding?: number;
  verticalPadding?: number;
  minFontSizePx?: number;
}

export interface PackedTextLayout {
  lines: readonly string[];
  lineHeightPx: number;
  requiredWidth: number;
  requiredHeight: number;
  fits: boolean;
}

export interface PackedLeafShape {
  width: number;
  height: number;
  kind: 'wide' | 'landscape' | 'narrow' | 'expanded';
  text: PackedTextLayout;
}

const WIDTH_SAFETY = 1.08;
const DEFAULT_HORIZONTAL_PADDING = 8;
const DEFAULT_VERTICAL_PADDING = 6;

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/**
 * Conservative, deterministic Segoe-UI-like width estimate. The canvas uses
 * CSS `white-space: pre-wrap` and `word-break: break-word`; the estimator uses
 * the same whitespace and long-token breaking rules with an 8% safety margin.
 */
export function estimatePackedTextWidth(text: string, fontSizePx: number): number {
  const size = Math.max(1, finite(fontSizePx, 12));
  const width = Array.from(text).reduce((sum, character) =>
    sum + packedGlyphWidth(character, size), 0);
  return width * WIDTH_SAFETY;
}

function packedGlyphWidth(character: string, size: number): number {
  if (character === ' ') return size * 0.32;
  if (/[ilI1'.,:;|!]/.test(character)) return size * 0.28;
  if (/[mMwW@#%&]/.test(character)) return size * 0.82;
  if (/[A-Z0-9]/.test(character)) return size * 0.64;
  return size * 0.54;
}

interface TextChunk {
  text: string;
  width: number;
}

function splitToken(token: string, maxWidth: number, fontSizePx: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunk = '';
  let chunkWidth = 0;
  for (const character of token) {
    const characterWidth = packedGlyphWidth(character, fontSizePx) * WIDTH_SAFETY;
    if (chunk && chunkWidth + characterWidth > maxWidth) {
      chunks.push({ text: chunk, width: chunkWidth });
      chunk = character;
      chunkWidth = characterWidth;
    } else {
      chunk += character;
      chunkWidth += characterWidth;
    }
  }
  if (chunk) chunks.push({ text: chunk, width: chunkWidth });
  return chunks;
}

export function wrapPackedText(
  text: string,
  maxWidth: number,
  fontSizePx: number,
): string[] {
  const normalizedWidth = Math.max(fontSizePx, maxWidth);
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    let lineWidth = 0;
    const spaceWidth = packedGlyphWidth(' ', fontSizePx) * WIDTH_SAFETY;
    for (const word of words) {
      for (const chunk of splitToken(word, normalizedWidth, fontSizePx)) {
        const candidateWidth = line ? lineWidth + spaceWidth + chunk.width : chunk.width;
        if (line && candidateWidth > normalizedWidth) {
          lines.push(line);
          line = chunk.text;
          lineWidth = chunk.width;
        } else {
          line = line ? `${line} ${chunk.text}` : chunk.text;
          lineWidth = candidateWidth;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
}

export function measurePackedLabel(
  spec: PackedLabelSpec,
  outerWidth: number,
  outerHeight: number,
): PackedTextLayout {
  const fontSize = Math.max(1, finite(spec.fontSizePx, 12));
  const minFontSize = Math.max(1, finite(spec.minFontSizePx, fontSize));
  const lineHeight = Math.max(fontSize, finite(spec.lineHeightPx, fontSize * 1.25));
  const horizontalPadding = Math.max(0, finite(spec.horizontalPadding, DEFAULT_HORIZONTAL_PADDING));
  const verticalPadding = Math.max(0, finite(spec.verticalPadding, DEFAULT_VERTICAL_PADDING));
  const maxLines = Math.max(1, Math.floor(finite(spec.maxLines, 3)));
  const contentWidth = Math.max(fontSize, outerWidth - 2 * horizontalPadding);
  const lines = wrapPackedText(spec.text, contentWidth, fontSize);
  const widest = Math.max(0, ...lines.map((line) => estimatePackedTextWidth(line, fontSize)));
  const requiredWidth = Math.ceil(widest + 2 * horizontalPadding);
  const requiredHeight = Math.ceil(lines.length * lineHeight + 2 * verticalPadding);
  return {
    lines,
    lineHeightPx: lineHeight,
    requiredWidth,
    requiredHeight,
    fits: fontSize >= minFontSize && lines.length <= maxLines &&
      requiredWidth <= outerWidth && requiredHeight <= outerHeight,
  };
}

export function minimumPackedLabelWidth(
  spec: PackedLabelSpec,
  maxLines = spec.maxLines ?? 3,
): number {
  const horizontalPadding = Math.max(
    0,
    finite(spec.horizontalPadding, DEFAULT_HORIZONTAL_PADDING),
  );
  const fullWidth = Math.ceil(estimatePackedTextWidth(spec.text, spec.fontSizePx) +
    2 * horizontalPadding);
  let low = Math.max(1, Math.ceil(spec.fontSizePx + 2 * horizontalPadding));
  let high = Math.max(low, fullWidth);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const lines = wrapPackedText(
      spec.text,
      Math.max(spec.fontSizePx, mid - 2 * horizontalPadding),
      spec.fontSizePx,
    );
    if (lines.length <= maxLines) high = mid;
    else low = mid + 1;
  }
  return low;
}

function snap(value: number, quantum = 4): number {
  return Math.ceil(value / quantum) * quantum;
}

export function createPackedLeafShapes(
  spec: PackedLabelSpec,
  leafWidth: number,
  leafHeight: number,
): PackedLeafShape[] {
  const vocabulary = [
    { kind: 'wide' as const, width: snap(leafWidth * 1.4), height: snap(leafHeight * 0.88) },
    { kind: 'landscape' as const, width: snap(leafWidth * 1.1), height: snap(leafHeight * 1.1) },
    { kind: 'narrow' as const, width: snap(leafWidth * 0.88), height: snap(leafHeight * 1.38) },
  ];
  const legal = vocabulary.flatMap((shape) => {
    const text = measurePackedLabel(spec, shape.width, shape.height);
    return text.fits ? [{ ...shape, text }] : [];
  });
  if (legal.length > 0) return legal;

  const maxLines = Math.max(1, Math.floor(finite(spec.maxLines, 3)));
  const width = snap(Math.max(leafWidth, minimumPackedLabelWidth(spec, maxLines)));
  const provisional = measurePackedLabel(spec, width, Number.MAX_SAFE_INTEGER);
  const height = snap(Math.max(leafHeight, provisional.requiredHeight));
  return [{
    kind: 'expanded',
    width,
    height,
    text: measurePackedLabel(spec, width, height),
  }];
}
