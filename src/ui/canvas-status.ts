import { create } from 'zustand';

export type CanvasStatusTone = 'neutral' | 'anchor' | 'valid' | 'invalid';

export interface CanvasStatusEntry {
  sessionId: string;
  viewId: string;
  zoom: number | null;
  x: number | null;
  y: number | null;
  message: string | null;
  tone: CanvasStatusTone;
}

interface CanvasStatusStore {
  entries: Record<string, CanvasStatusEntry>;
  setCanvasStatus: (
    sessionId: string,
    viewId: string,
    partial: Partial<Omit<CanvasStatusEntry, 'sessionId' | 'viewId'>>,
  ) => void;
  clearCanvasStatus: (sessionId: string, viewId: string) => void;
}

const messageTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function canvasStatusKey(sessionId: string, viewId: string): string {
  return JSON.stringify([sessionId, viewId]);
}

export const useCanvasStatus = create<CanvasStatusStore>((set) => ({
  entries: {},
  setCanvasStatus: (sessionId, viewId, partial) =>
    set((state) => {
      const key = canvasStatusKey(sessionId, viewId);
      const previous = state.entries[key];
      return {
        entries: {
          ...state.entries,
          [key]: previous
            ? { ...previous, ...partial }
            : {
                sessionId,
                viewId,
                zoom: null,
                x: null,
                y: null,
                message: null,
                tone: 'neutral',
                ...partial,
              },
        },
      };
    }),
  clearCanvasStatus: (sessionId, viewId) =>
    set((state) => {
      const key = canvasStatusKey(sessionId, viewId);
      if (!(key in state.entries)) return state;
      const entries = { ...state.entries };
      delete entries[key];
      return { entries };
    }),
}));

export function setCanvasStatus(
  sessionId: string,
  viewId: string,
  partial: Partial<Omit<CanvasStatusEntry, 'sessionId' | 'viewId'>>,
): void {
  if (partial.message !== undefined) {
    const key = canvasStatusKey(sessionId, viewId);
    const timer = messageTimers.get(key);
    if (timer) clearTimeout(timer);
    messageTimers.delete(key);
  }
  useCanvasStatus.getState().setCanvasStatus(sessionId, viewId, partial);
}

export function clearCanvasStatus(sessionId: string, viewId: string): void {
  const key = canvasStatusKey(sessionId, viewId);
  const timer = messageTimers.get(key);
  if (timer) clearTimeout(timer);
  messageTimers.delete(key);
  useCanvasStatus.getState().clearCanvasStatus(sessionId, viewId);
}

export function clearCanvasStatusMessage(sessionId: string, viewId: string): void {
  const key = canvasStatusKey(sessionId, viewId);
  if (!useCanvasStatus.getState().entries[key]) return;
  setCanvasStatus(sessionId, viewId, { message: null, tone: 'neutral' });
}

export function flashCanvasStatus(
  sessionId: string,
  viewId: string,
  partial: Pick<CanvasStatusEntry, 'message' | 'tone'>,
  duration = 1500,
): void {
  const key = canvasStatusKey(sessionId, viewId);
  setCanvasStatus(sessionId, viewId, partial);
  messageTimers.set(
    key,
    setTimeout(() => {
      const current = useCanvasStatus.getState().entries[key];
      if (current?.message === partial.message) {
        setCanvasStatus(sessionId, viewId, { message: null, tone: 'neutral' });
      }
      messageTimers.delete(key);
    }, duration),
  );
}
