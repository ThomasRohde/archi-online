import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Bounds, ModelState } from '../../model/types';
import { StaticViewContent } from './StaticViewSvg';

/** Matches the canvas font stack in styles.css so exports render identically. */
export const EXPORT_FONT_STACK = "'Segoe UI', system-ui, -apple-system, sans-serif";

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Whitespace around the diagram content, matching Archi's image export. */
export const DEFAULT_EXPORT_MARGIN = 10;

/** Convert measured SVG content bounds into the shared export/Outline viewBox. */
export function contentViewBox(
  bounds: Pick<Bounds, 'x' | 'y' | 'width' | 'height'>,
  margin = DEFAULT_EXPORT_MARGIN,
): Bounds {
  return {
    x: Math.floor(bounds.x) - margin,
    y: Math.floor(bounds.y) - margin,
    width: Math.max(1, Math.ceil(bounds.width + margin * 2)),
    height: Math.max(1, Math.ceil(bounds.height + margin * 2)),
  };
}

export interface ViewImageOptions {
  /** Rasterization scale for PNG export (1, 2, 4). */
  scale?: number;
  /** Whitespace around the diagram in model pixels. */
  margin?: number;
  background?: 'white' | 'transparent';
  /**
   * Content-bounds measurement. Defaults to getBBox on the rendered content
   * group (exact, includes text); injectable because test DOMs lack getBBox.
   */
  measure?: (content: SVGGraphicsElement) => { x: number; y: number; width: number; height: number };
}

export interface RenderedViewSvg {
  /** Standalone SVG document (XML declaration included). */
  svg: string;
  /** CSS pixel size at scale 1 (content plus margins). */
  width: number;
  height: number;
}

function defaultMeasure(content: SVGGraphicsElement) {
  return content.getBBox();
}

/**
 * Render a view offscreen and produce a standalone SVG document string.
 * The offscreen pass is a real (hidden, but rendered) DOM subtree so content
 * bounds come from getBBox and include text extents exactly.
 */
export function renderViewSvg(
  model: ModelState,
  viewId: string,
  options: ViewImageOptions = {},
): RenderedViewSvg {
  const margin = options.margin ?? DEFAULT_EXPORT_MARGIN;
  if (!model.views[viewId]) throw new Error(`View not found: ${viewId}`);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    flushSync(() => {
      root.render(
        createElement(
          'svg',
          { xmlns: SVG_NS, style: { fontFamily: EXPORT_FONT_STACK } },
          createElement(
            'g',
            { 'data-export-content': '' },
            createElement(StaticViewContent, { model, viewId }),
          ),
        ),
      );
    });
    const svg = container.querySelector('svg');
    const content = svg?.querySelector('g[data-export-content]');
    if (!svg || !content) throw new Error('View render failed');
    // Labels render through <foreignObject> on the live canvas, but SVG
    // images containing foreignObject taint canvases (breaking PNG export)
    // and most external SVG consumers don't render them. Replace each label
    // with native <text> lines at the browser-computed positions.
    inlineForeignObjectText(svg);
    const bbox = (options.measure ?? defaultMeasure)(content as SVGGraphicsElement);
    const box = contentViewBox(bbox, margin);
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.setAttribute('width', String(box.width));
    svg.setAttribute('height', String(box.height));
    if ((options.background ?? 'white') === 'white') {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(box.x));
      rect.setAttribute('y', String(box.y));
      rect.setAttribute('width', String(box.width));
      rect.setAttribute('height', String(box.height));
      rect.setAttribute('fill', '#ffffff');
      svg.insertBefore(rect, svg.firstChild);
    }
    const markup = new XMLSerializer().serializeToString(svg);
    return {
      svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + markup,
      width: box.width,
      height: box.height,
    };
  } finally {
    root.unmount();
    container.remove();
  }
}

interface TextLine {
  text: string;
  /** Client (viewport) coordinates of the line box. */
  left: number;
  top: number;
  bottom: number;
}

/**
 * Replace every foreignObject label with native <text>/<tspan> markup.
 * Line breaks and positions come from the browser's own layout (per-char
 * Range rects), so wrapping matches the canvas exactly. Falls back to a
 * single unwrapped line where Range measurement is unavailable (test DOMs).
 */
function inlineForeignObjectText(svg: SVGSVGElement): void {
  for (const fo of [...svg.querySelectorAll('foreignObject')]) {
    const div = fo.firstElementChild as HTMLElement | null;
    const parent = fo.parentNode;
    if (!div || !parent) {
      fo.remove();
      continue;
    }

    const style = div.style;
    const fontSize = parseFloat(style.fontSize) || 12;
    const lines = measureTextLines(div);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('fill', style.color || '#000000');
    text.setAttribute('font-family', style.fontFamily || EXPORT_FONT_STACK);
    text.setAttribute('font-size', String(fontSize));
    if (style.fontWeight && style.fontWeight !== '400') {
      text.setAttribute('font-weight', style.fontWeight);
    }
    if (style.fontStyle && style.fontStyle !== 'normal') {
      text.setAttribute('font-style', style.fontStyle);
    }

    if (lines.length > 0) {
      // Map client coordinates into the parent <g>'s user space.
      const ctm = (parent as SVGGraphicsElement).getScreenCTM?.();
      const inv = ctm ? ctm.inverse() : null;
      const toUser = (x: number, y: number) =>
        inv ? { x: inv.a * x + inv.c * y + inv.e, y: inv.b * x + inv.d * y + inv.f } : { x, y };
      text.setAttribute('dominant-baseline', 'central');
      for (const line of lines) {
        const p = toUser(line.left, (line.top + line.bottom) / 2);
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.setAttribute('x', p.x.toFixed(2));
        tspan.setAttribute('y', p.y.toFixed(2));
        tspan.textContent = line.text;
        text.appendChild(tspan);
      }
    } else {
      // Measurement unavailable: one unwrapped line inside the label box.
      const x = Number(fo.getAttribute('x') ?? 0) + 4;
      const y = Number(fo.getAttribute('y') ?? 0) + 3 + fontSize;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.textContent = div.textContent ?? '';
    }

    parent.insertBefore(text, fo);
    fo.remove();
  }
}

/** The wrapped line boxes of a label div, from per-character Range rects. */
function measureTextLines(div: HTMLElement): TextLine[] {
  const lines: TextLine[] = [];
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  if (typeof range.getBoundingClientRect !== 'function') return lines; // test DOMs
  let current: TextLine | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const content = node.textContent ?? '';
    for (let i = 0; i < content.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // unmeasurable (or collapsed)
      const midY = (rect.top + rect.bottom) / 2;
      if (current && midY >= current.top && midY <= current.bottom) {
        current.text += content[i];
        if (rect.width > 0) {
          current.left = Math.min(current.left, rect.left);
          current.top = Math.min(current.top, rect.top);
          current.bottom = Math.max(current.bottom, rect.bottom);
        }
      } else {
        if (current) lines.push(current);
        current = { text: content[i], left: rect.left, top: rect.top, bottom: rect.bottom };
      }
    }
  }
  if (current) lines.push(current);
  for (const line of lines) line.text = line.text.replace(/\s+$/, '').replace(/^\s+/, '');
  return lines.filter((l) => l.text !== '');
}

/** Rasterize a view to a PNG blob at the requested scale. */
export async function renderViewPng(
  model: ModelState,
  viewId: string,
  options: ViewImageOptions = {},
): Promise<Blob> {
  const scale = options.scale ?? 1;
  const { svg, width, height } = renderViewSvg(model, viewId, options);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function supportsImageClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

/**
 * Copy a view to the system clipboard as a PNG. Uses the promise form of
 * ClipboardItem so Safari keeps the transient user activation alive while
 * the image renders.
 */
export async function copyViewPngToClipboard(
  model: ModelState,
  viewId: string,
  options: ViewImageOptions = {},
): Promise<void> {
  if (!supportsImageClipboard()) {
    throw new Error(
      'Copying images to the clipboard is not supported in this browser — use "Export view as image" instead.',
    );
  }
  const item = new ClipboardItem({ 'image/png': renderViewPng(model, viewId, options) });
  await navigator.clipboard.write([item]);
}
