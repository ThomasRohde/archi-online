import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ModelState } from '../../model/types';
import { StaticViewContent } from './StaticViewSvg';

/** Matches the canvas font stack in styles.css so exports render identically. */
export const EXPORT_FONT_STACK = "'Segoe UI', system-ui, -apple-system, sans-serif";

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Whitespace around the diagram content, matching Archi's image export. */
export const DEFAULT_EXPORT_MARGIN = 10;

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
    const bbox = (options.measure ?? defaultMeasure)(content as SVGGraphicsElement);
    const width = Math.max(1, Math.ceil(bbox.width + margin * 2));
    const height = Math.max(1, Math.ceil(bbox.height + margin * 2));
    const minX = Math.floor(bbox.x) - margin;
    const minY = Math.floor(bbox.y) - margin;
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    if ((options.background ?? 'white') === 'white') {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(minX));
      rect.setAttribute('y', String(minY));
      rect.setAttribute('width', String(width));
      rect.setAttribute('height', String(height));
      rect.setAttribute('fill', '#ffffff');
      svg.insertBefore(rect, svg.firstChild);
    }
    const markup = new XMLSerializer().serializeToString(svg);
    return { svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + markup, width, height };
  } finally {
    root.unmount();
    container.remove();
  }
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
