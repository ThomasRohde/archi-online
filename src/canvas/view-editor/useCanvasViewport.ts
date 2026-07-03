import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Bounds } from '../../model/types';
import { useSettingsStore } from '../../settings/app-settings';
import type { Point } from '../geometry';
import type { Viewport } from './types';

const viewports = new Map<string, Viewport>();

export function useCanvasViewport(
  viewId: string,
  svgRef: RefObject<SVGSVGElement>,
  absBounds: Map<string, Bounds>,
) {
  const settings = useSettingsStore((s) => s.settings);
  const [viewport, setViewportState] = useState<Viewport>(
    () => viewports.get(viewId) ?? { zoom: 1, x: 20, y: 20 },
  );
  const [spaceHeld, setSpaceHeld] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;

  const setViewport = (v: Viewport) => {
    viewports.set(viewId, v);
    setViewportState(v);
  };
  const setViewportRefFn = useRef(setViewport);
  setViewportRefFn.current = setViewport;

  const toView = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  /** Zoom keeping the canvas centre stable. */
  const zoomTo = (zoom: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = Math.min(settings.maxZoom, Math.max(settings.minZoom, zoom));
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const wx = (cx - viewport.x) / viewport.zoom;
    const wy = (cy - viewport.y) / viewport.zoom;
    setViewport({ zoom: z, x: cx - wx * z, y: cy - wy * z });
  };

  const zoomBy = (factor: number) => zoomTo(viewport.zoom * factor);

  /** Fit the whole diagram into the visible canvas. */
  const fitToView = () => {
    const svg = svgRef.current;
    if (!svg) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of absBounds.values()) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!isFinite(minX)) {
      setViewport({ zoom: 1, x: 20, y: 20 });
      return;
    }
    const rect = svg.getBoundingClientRect();
    const margin = settings.fitPadding;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const maxFitZoom = Math.max(settings.minZoom, settings.fitMaxZoom);
    const zoom = Math.min(
      maxFitZoom,
      Math.max(
        settings.minZoom,
        Math.min((rect.width - margin * 2) / bw, (rect.height - margin * 2) / bh),
      ),
    );
    setViewport({
      zoom,
      x: (rect.width - bw * zoom) / 2 - minX * zoom,
      y: (rect.height - bh * zoom) / 2 - minY * zoom,
    });
  };

  // Ctrl+wheel zoom must preventDefault to stop the browser's page zoom, but
  // React attaches onWheel passively, so use a native non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const currentSettings = settingsRef.current;
      const set = setViewportRefFn.current;
      if (e.ctrlKey || e.metaKey) {
        const factor =
          e.deltaY < 0
            ? currentSettings.wheelZoomFactor
            : 1 / currentSettings.wheelZoomFactor;
        const zoom = Math.min(
          currentSettings.maxZoom,
          Math.max(currentSettings.minZoom, vp.zoom * factor),
        );
        const rect = svg.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const wx = (cx - vp.x) / vp.zoom;
        const wy = (cy - vp.y) / vp.zoom;
        set({ zoom, x: cx - wx * zoom, y: cy - wy * zoom });
      } else if (e.shiftKey) {
        set({ ...vp, x: vp.x - e.deltaY });
      } else {
        set({ ...vp, x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    };
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, [svgRef]);

  // Hold Space for hand-tool panning with the left button.
  useEffect(() => {
    const isTextTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTextTarget(e.target)) {
        if (e.target === svgRef.current) e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const clear = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [svgRef]);

  return {
    viewport,
    viewportRef,
    setViewport,
    toView,
    zoomTo,
    zoomBy,
    fitToView,
    spaceHeld,
    spaceRef,
  };
}
