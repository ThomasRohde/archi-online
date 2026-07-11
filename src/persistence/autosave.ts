import { parseArchimate, serializeArchimate } from '../model/io/archimate-xml';
import {
  activateModelSession,
  addModelSession,
  clearWorkspace,
  workspaceStore,
  type ModelSession,
} from '../model/workspace';
import type { ModelState } from '../model/types';
import { defaultKeyValueStore } from './keyval';

const KEY = 'archi-online.workspace';
const VERSION = 1;

interface WorkspaceSessionRecord {
  sessionId: string;
  xml: string;
  fileName: string | null;
  dirty: boolean;
  openViewIds: string[];
  activeViewId: string | null;
  savedAt: number;
  fileHandle?: FileSystemFileHandle;
}

interface WorkspaceRecord {
  version: typeof VERSION;
  order: string[];
  activeSessionId: string | null;
  activationOrder: string[];
  sessions: WorkspaceSessionRecord[];
}

export interface RestoreWorkspaceResult {
  restored: number;
  failed: number;
}

let timer: number | undefined;
let workspaceUnsubscribe: (() => void) | undefined;
const sessionUnsubscribes = new Map<string, () => void>();
const xmlCache = new Map<string, { model: ModelState; xml: string }>();
let recoveryStore: ReturnType<typeof defaultKeyValueStore> | null = null;
let recoverySessions: WorkspaceSessionRecord[] = [];
let recoveryOrder: string[] = [];

function schedulePersist(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    void persistWorkspace();
  }, 800);
}

function syncSessionSubscriptions(sessions: Record<string, ModelSession>): void {
  for (const [id, unsubscribe] of sessionUnsubscribes) {
    if (!sessions[id]) {
      unsubscribe();
      sessionUnsubscribes.delete(id);
      xmlCache.delete(id);
    }
  }
  for (const [id, session] of Object.entries(sessions)) {
    if (sessionUnsubscribes.has(id)) continue;
    sessionUnsubscribes.set(
      id,
      session.store.subscribe((state, previous) => {
        if (
          state.model !== previous.model ||
          state.fileName !== previous.fileName ||
          state.dirty !== previous.dirty ||
          state.openViewIds !== previous.openViewIds ||
          state.activeViewId !== previous.activeViewId
        ) {
          schedulePersist();
        }
      }),
    );
  }
}

/** Start debounced persistence for the complete editor workspace. Call once at startup. */
export function startAutosave(): void {
  if (workspaceUnsubscribe) return;
  syncSessionSubscriptions(workspaceStore.getState().sessions);
  workspaceUnsubscribe = workspaceStore.subscribe((state, previous) => {
    syncSessionSubscriptions(state.sessions);
    if (
      state.sessions !== previous.sessions ||
      state.order !== previous.order ||
      state.activeSessionId !== previous.activeSessionId ||
      state.activationOrder !== previous.activationOrder
    ) {
      schedulePersist();
    }
  });
}

export async function flushAutosaveNow(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  await persistWorkspace();
}

function sessionRecord(session: ModelSession, savedAt: number): WorkspaceSessionRecord | null {
  const state = session.store.getState();
  if (!state.model) return null;
  let cached = xmlCache.get(session.id);
  if (!cached || cached.model !== state.model) {
    cached = { model: state.model, xml: serializeArchimate(state.model) };
    xmlCache.set(session.id, cached);
  }
  return {
    sessionId: session.id,
    xml: cached.xml,
    fileName: state.fileName,
    dirty: state.dirty,
    openViewIds: state.openViewIds,
    activeViewId: state.activeViewId,
    savedAt,
    ...(session.fileHandle ? { fileHandle: session.fileHandle } : {}),
  };
}

async function persistWorkspace(): Promise<void> {
  const state = workspaceStore.getState();
  const keyValueStore = defaultKeyValueStore();
  try {
    const preserved = keyValueStore === recoveryStore ? recoverySessions : [];
    if (state.order.length === 0 && preserved.length === 0) {
      await keyValueStore.del(KEY);
      return;
    }
    const savedAt = Date.now();
    const liveSessions = state.order
      .map((id) => state.sessions[id])
      .filter((session): session is ModelSession => session !== undefined)
      .map((session) => sessionRecord(session, savedAt))
      .filter((record): record is WorkspaceSessionRecord => record !== null);
    const sessionsById = new Map<string, WorkspaceSessionRecord>();
    preserved.forEach((session) => sessionsById.set(session.sessionId, session));
    liveSessions.forEach((session) => sessionsById.set(session.sessionId, session));
    const orderedIds = [
      ...(keyValueStore === recoveryStore ? recoveryOrder : []),
      ...state.order,
    ].filter((id, index, all) => sessionsById.has(id) && all.indexOf(id) === index);
    const sessions = orderedIds.map((id) => sessionsById.get(id)!);
    const record: WorkspaceRecord = {
      version: VERSION,
      order: orderedIds,
      activeSessionId: state.activeSessionId,
      activationOrder: state.activationOrder,
      sessions,
    };
    try {
      await keyValueStore.set(KEY, record);
    } catch {
      await keyValueStore.set(KEY, {
        ...record,
        sessions: record.sessions.map(({ fileHandle: _fileHandle, ...session }) => session),
      });
    }
  } catch (error) {
    console.warn('workspace autosave failed', error);
  }
}

export async function restoreWorkspace(): Promise<RestoreWorkspaceResult> {
  const keyValueStore = defaultKeyValueStore();
  let record: WorkspaceRecord | undefined;
  try {
    record = await keyValueStore.get<WorkspaceRecord>(KEY);
  } catch (error) {
    console.warn('workspace restore failed', error);
    return { restored: 0, failed: 1 };
  }
  if (!record || record.version !== VERSION || !Array.isArray(record.sessions)) {
    recoveryStore = keyValueStore;
    recoverySessions = [];
    recoveryOrder = [];
    return { restored: 0, failed: 0 };
  }

  clearWorkspace();
  let restored = 0;
  let failed = 0;
  const failedSessions: WorkspaceSessionRecord[] = [];
  for (const saved of record.sessions) {
    try {
      const model = parseArchimate(saved.xml);
      const openViewIds = saved.openViewIds.filter((id) => model.views[id]);
      addModelSession({
        id: saved.sessionId,
        model,
        fileName: saved.fileName,
        dirty: saved.dirty,
        fileHandle: saved.fileHandle ?? null,
        openViewIds,
        activeViewId:
          saved.activeViewId && openViewIds.includes(saved.activeViewId)
            ? saved.activeViewId
            : (openViewIds[openViewIds.length - 1] ?? null),
      });
      restored++;
    } catch (error) {
      failed++;
      failedSessions.push(saved);
      console.warn(`workspace model restore failed: ${saved.fileName ?? saved.sessionId}`, error);
    }
  }

  recoveryStore = keyValueStore;
  recoverySessions = failedSessions;
  recoveryOrder = [...record.order];

  const current = workspaceStore.getState();
  const activationOrder = record.activationOrder.filter((id) => current.sessions[id]);
  workspaceStore.setState({ activationOrder });
  const activeSessionId =
    (record.activeSessionId && current.sessions[record.activeSessionId]
      ? record.activeSessionId
      : activationOrder[activationOrder.length - 1]) ?? current.order[0] ?? null;
  if (activeSessionId) activateModelSession(activeSessionId);
  return { restored, failed };
}

/** Backwards-compatible boot helper; the storage format itself is intentionally greenfield. */
export async function restoreAutosave(): Promise<boolean> {
  return (await restoreWorkspace()).restored > 0;
}
