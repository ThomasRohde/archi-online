import type { FontStyle } from './types';

export function parseFontStyle(value: string | undefined): FontStyle | undefined {
  if (!value) return undefined;
  const parts = value.split('|');
  if (parts.length < 4) return undefined;
  const style = Number.parseInt(parts[3], 10) || 0;
  return {
    family: parts[1] || 'Segoe UI',
    sizePt: Number.parseFloat(parts[2]) || 9,
    bold: (style & 1) !== 0,
    italic: (style & 2) !== 0,
  };
}

export function serializeFontStyle(style: FontStyle | undefined): string | undefined {
  if (!style) return undefined;
  const flags = (style.bold ? 1 : 0) | (style.italic ? 2 : 0);
  return `1|${style.family}|${style.sizePt}|${flags}|`;
}
