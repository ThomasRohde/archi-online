import { compareStableText } from './stable-order';

/** Low -> high default: red, amber, green (maturity-style heat maps). */
export const DEFAULT_HEATMAP_PALETTE: readonly string[] = ['#d64550', '#f0c24b', '#4c9f70'];

export const DEFAULT_CATEGORICAL_PALETTE: readonly string[] = [
  '#5b8ff9', '#61ddaa', '#f6bd16', '#7262fd',
  '#78d3f8', '#9661bc', '#f6903d', '#e8684a',
];

export interface HeatmapBucket {
  label: string;
  color: string;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value;
  const num = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(num)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function toHex(rgb: readonly [number, number, number]): string {
  const clamp = (c: number) => Math.min(255, Math.max(0, Math.round(c)));
  return `#${rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear RGB mix of two hex colors; t=0 -> a, t=1 -> b. */
export function mixHex(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  const clamped = Math.min(1, Math.max(0, t));
  return toHex([
    from[0] + (to[0] - from[0]) * clamped,
    from[1] + (to[1] - from[1]) * clamped,
    from[2] + (to[2] - from[2]) * clamped,
  ]);
}

/**
 * Monotone luminance ramp for nesting depth: level 0 keeps the base fill and
 * each deeper level mixes further toward white, so hierarchy stays legible
 * without relying on borders alone.
 */
export function deriveLevelFills(baseHex: string, levels: number): string[] {
  const fills: string[] = [];
  for (let level = 0; level < Math.max(1, levels); level++) {
    fills.push(mixHex(baseHex, '#ffffff', Math.min(0.72, level * 0.18)));
  }
  return fills;
}

/** Sample a multi-stop palette at t in [0, 1] with piecewise-linear interpolation. */
export function samplePalette(palette: readonly string[], t: number): string {
  if (palette.length === 0) throw new Error('Palette must not be empty');
  if (palette.length === 1) return palette[0];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(scaled));
  return mixHex(palette[index], palette[index + 1], scaled - index);
}

export interface NumericColorScaleOptions {
  min?: number;
  max?: number;
  palette?: readonly string[];
}

export interface NumericColorScale {
  min: number;
  max: number;
  colorFor: (value: number) => string;
  buckets: (count?: number) => HeatmapBucket[];
}

function formatBound(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function numericColorScale(
  values: readonly number[],
  options: NumericColorScaleOptions = {},
): NumericColorScale {
  const palette = options.palette?.length ? options.palette : DEFAULT_HEATMAP_PALETTE;
  const finite = values.filter((value) => Number.isFinite(value));
  const min = options.min ?? (finite.length > 0 ? Math.min(...finite) : 0);
  const max = options.max ?? (finite.length > 0 ? Math.max(...finite) : 1);
  const span = max - min;
  const colorFor = (value: number) =>
    samplePalette(palette, span > 0 ? (value - min) / span : 0.5);
  return {
    min,
    max,
    colorFor,
    buckets: (count = 5) => {
      if (span <= 0) return [{ label: formatBound(min), color: colorFor(min) }];
      const bucketCount = Math.max(1, Math.min(12, Math.floor(count)));
      return Array.from({ length: bucketCount }, (_, index) => {
        const from = min + (span * index) / bucketCount;
        const to = min + (span * (index + 1)) / bucketCount;
        return {
          label: `${formatBound(from)} – ${formatBound(to)}`,
          color: colorFor((from + to) / 2),
        };
      });
    },
  };
}

/** Map sorted distinct values to palette colors (cycled when exhausted). */
export function categoricalColorScale(
  values: readonly string[],
  palette: readonly string[] = DEFAULT_CATEGORICAL_PALETTE,
): Map<string, string> {
  const distinct = [...new Set(values)].sort(compareStableText);
  return new Map(distinct.map((value, index) => [value, palette[index % palette.length]]));
}
