import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ViewEditor } from '../canvas/ViewEditor';
import { useStore } from './store-hooks';
import type { ModelState } from '../model/types';
import { treeItemLabel } from './tree-filter';

/** All views in the order the model tree displays them (subfolders first,
 * then items, both sorted alphabetically) — the walk order for presenting. */
export function viewsInTreeOrder(model: ModelState): string[] {
  const result: string[] = [];
  const walk = (folderId: string) => {
    const folder = model.folders[folderId];
    if (!folder) return;
    const subs = [...folder.folderIds].sort((a, b) =>
      (model.folders[a]?.name ?? '').localeCompare(model.folders[b]?.name ?? ''),
    );
    for (const sub of subs) walk(sub);
    const items = [...folder.itemIds].sort((a, b) =>
      treeItemLabel(model, a).localeCompare(treeItemLabel(model, b)),
    );
    for (const id of items) if (model.views[id]) result.push(id);
  };
  for (const fid of model.rootFolderIds) walk(fid);
  return result;
}

/**
 * Full-screen, chrome-free walkthrough of the model's views. Renders as a
 * fixed overlay (never touching the dockview layout) and requests browser
 * fullscreen on top; if that is denied the overlay still works.
 */
export function PresentationMode({ onClose }: { onClose: () => void }) {
  const model = useStore((s) => s.model);
  const activeViewId = useStore((s) => s.activeViewId);
  const order = useMemo(() => (model ? viewsInTreeOrder(model) : []), [model]);
  const [index, setIndex] = useState(() => {
    const i = activeViewId ? order.indexOf(activeViewId) : -1;
    return i >= 0 ? i : 0;
  });
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const enteredFullscreen = useRef(false);

  const currentViewId = order[Math.min(index, Math.max(0, order.length - 1))];

  const pokeHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimer.current) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHudVisible(false), 2500);
  }, []);

  useEffect(() => {
    pokeHud();
    return () => {
      if (hudTimer.current) window.clearTimeout(hudTimer.current);
    };
  }, [pokeHud]);

  useEffect(() => {
    const el = containerRef.current;
    el?.requestFullscreen?.()
      .then(() => {
        enteredFullscreen.current = true;
      })
      .catch(() => {
        /* fullscreen denied — the fixed overlay still presents */
      });
  }, []);

  // Browser-initiated fullscreen exit (Esc, F11, system UI) ends the mode.
  useEffect(() => {
    const onFsChange = () => {
      if (enteredFullscreen.current && !document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [onClose]);

  // Leaving via the app (close button, Esc in overlay mode) exits fullscreen.
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setIndex((i) => Math.min(order.length - 1, i + 1));
        pokeHud();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        pokeHud();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIndex(0);
        pokeHud();
      } else if (e.key === 'End') {
        e.preventDefault();
        setIndex(Math.max(0, order.length - 1));
        pokeHud();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order.length, onClose, pokeHud]);

  if (!model || !currentViewId) return null;
  const view = model.views[currentViewId];

  return createPortal(
    <div ref={containerRef} className="presentation-mode" onMouseMove={pokeHud}>
      <ViewEditor key={currentViewId} viewId={currentViewId} readOnly />
      <div className={'presentation-hud' + (hudVisible ? '' : ' hud-hidden')}>
        <span className="presentation-hud-name">{view?.name ?? ''}</span>
        <span className="presentation-hud-count">
          {index + 1} / {order.length}
        </span>
        <button className="presentation-hud-close" title="Exit presentation (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>,
    document.body,
  );
}
