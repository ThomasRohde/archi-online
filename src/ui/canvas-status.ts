import { create } from 'zustand';

/**
 * Transient status of the active view's canvas, published by the active
 * ViewEditor and read by the bottom status bar. Not persisted, not undoable —
 * purely a live read-out of zoom and the cursor position (in view coordinates).
 * `zoom === null` means no view is active; `x/y === null` means the cursor is
 * not currently over the canvas.
 */
export interface CanvasStatus {
  zoom: number | null;
  x: number | null;
  y: number | null;
}

interface CanvasStatusStore extends CanvasStatus {
  setCanvasStatus: (partial: Partial<CanvasStatus>) => void;
}

export const useCanvasStatus = create<CanvasStatusStore>((set) => ({
  zoom: null,
  x: null,
  y: null,
  setCanvasStatus: (partial) => set(partial),
}));

export function setCanvasStatus(partial: Partial<CanvasStatus>): void {
  useCanvasStatus.getState().setCanvasStatus(partial);
}
