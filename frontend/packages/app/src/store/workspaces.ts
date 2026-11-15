import { create } from "zustand";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { SessionInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { notify } from "./notify";
import { usePreferencesStore } from "./preferences";
import { t } from "@lingzhu/ui/i18n";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  /** Session history cached per workspace, so switching back does not refetch. */
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  /** Workspaces whose session list is being fetched for the first time. */
  loadingSessions: Record<string, boolean>;
  refresh: () => Promise<void>;
  select: (path: string) => void;
  loadSessions: (path: string) => Promise<void>;
  connect: () => Promise<WorkspaceInfo | undefined>;
  disconnect: (path: string) => Promise<void>;
  renameSession: (workspace: string, sessionID: string, title: string) => Promise<boolean>;
  deleteSession: (workspace: string, sessionID: string) => Promise<boolean>;
  /** Deletes several sessions in one workspace; returns the IDs that were removed. */
  deleteSessions: (workspace: string, sessionIDs: string[]) => Promise<string[]>;
  /** Insert a row optimistically; a draft has no durable session yet. */
  prependSession: (workspace: string, session: SessionInfo) => void;
}

/**
 * The core refuses to delete a session while its agent is running. Stop that
 * run first and retry once, matching what deleting a running session does in
 * the reference app: the session leaves with its tab instead of staying stuck.
 */
async function removeSession(workspace: string, sessionID: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await api.remove(workspace, sessionID);
      return;
    } catch (error) {
      lastError = error;
      if (attempt > 0) {
        // The first failure may be the busy guard; give the interrupted run
        // time to unwind before retrying.
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      try {
        await api.interrupt(workspace, sessionID);
      } catch {
        // A session that is not running has nothing to interrupt.
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

/** The workspace list, the active one, and the session history per workspace. */
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activePath: undefined,
  sessionsByWorkspace: {},
  loadingSessions: {},

  refresh: async () => {
    try {
      const list = await api.workspaces();
      set((state) => {
        if (state.activePath && list.some((workspace) => workspace.path === state.activePath)) {
          return { workspaces: list };
        }
        const preferences = usePreferencesStore.getState().preferences;
        const preferred = preferences.defaultWorkspace;
        const preferredPath =
          preferred && list.some((workspace) => workspace.path === preferred) ? preferred : undefined;
        const destination = preferences.workspaceDestination;
        const next =
          destination === "new"
            ? undefined
            : destination === "local"
              ? list.find((workspace) => workspace.connected)?.path
              : preferredPath ?? (list.find((workspace) => workspace.connected) ?? list[0])?.path;
        return { workspaces: list, activePath: next };
      });
    } catch (error) {
      notify(messageOf(error));
    }
  },

  select: (path) => {
    if (get().activePath === path) return;
    set({ activePath: path });
  },

  loadSessions: async (path) => {
    set((state) => ({ loadingSessions: { ...state.loadingSessions, [path]: true } }));
    try {
      const list = (await api.sessions(path)) ?? [];
      set((state) => ({ sessionsByWorkspace: { ...state.sessionsByWorkspace, [path]: list } }));
    } catch (error) {
      set((state) => ({ sessionsByWorkspace: { ...state.sessionsByWorkspace, [path]: [] } }));
      notify(messageOf(error));
    } finally {
      set((state) => ({ loadingSessions: { ...state.loadingSessions, [path]: false } }));
    }
  },

  connect: async () => {
    try {
      const info = await api.addWorkspace();
      await get().refresh();
      if (info?.path) set({ activePath: info.path });
      notify(t("notifyWorkspaceAdded"), "info");
      return info;
    } catch (error) {
      notify(messageOf(error));
      await get().refresh();
      return undefined;
    }
  },

  disconnect: async (path) => {
    try {
      await api.removeWorkspace(path);
      await get().refresh();
      set((state) => {
        const sessionsByWorkspace = { ...state.sessionsByWorkspace };
        delete sessionsByWorkspace[path];
        return {
          sessionsByWorkspace,
          activePath: state.activePath === path ? undefined : state.activePath,
        };
      });
      notify(t("notifyWorkspaceRemoved"), "info");
    } catch (error) {
      notify(messageOf(error));
    }
  },

  renameSession: async (workspace, sessionID, title) => {
    try {
      await api.rename(workspace, sessionID, title);
      if (workspace === get().activePath) await get().loadSessions(workspace);
      notify(t("notifySessionRenamed"), "info");
      return true;
    } catch (error) {
      notify(messageOf(error));
      return false;
    }
  },

  deleteSession: async (workspace, sessionID) => {
    try {
      await removeSession(workspace, sessionID);
      set((state) => ({
        sessionsByWorkspace: {
          ...state.sessionsByWorkspace,
          [workspace]: (state.sessionsByWorkspace[workspace] ?? []).filter((item) => item.id !== sessionID),
        },
      }));
      notify(t("notifySessionDeleted"), "info");
      return true;
    } catch (error) {
      notify(messageOf(error));
      return false;
    }
  },

  deleteSessions: async (workspace, sessionIDs) => {
    const deleted: string[] = [];
    const failures: string[] = [];
    // Delete one by one so a single failure still removes the rest and keeps
    // the optimistic list in sync with what actually disappeared.
    for (const sessionID of sessionIDs) {
      try {
        await removeSession(workspace, sessionID);
        deleted.push(sessionID);
      } catch (error) {
        failures.push(messageOf(error));
      }
    }
    if (deleted.length > 0) {
      const removed = new Set(deleted);
      set((state) => ({
        sessionsByWorkspace: {
          ...state.sessionsByWorkspace,
          [workspace]: (state.sessionsByWorkspace[workspace] ?? []).filter((item) => !removed.has(item.id)),
        },
      }));
      notify(deleted.length === 1 ? "Session deleted" : `${deleted.length} sessions deleted`, "info");
    }
    for (const failure of failures) notify(failure);
    return deleted;
  },

  prependSession: (workspace, session) => {
    set((state) => ({
      sessionsByWorkspace: {
        ...state.sessionsByWorkspace,
        [workspace]: [session, ...(state.sessionsByWorkspace[workspace] ?? [])],
      },
    }));
  },
}));

export function useWorkspaces(): WorkspaceInfo[] {
  return useWorkspaceStore((state) => state.workspaces);
}

export function useActivePath(): string | undefined {
  return useWorkspaceStore((state) => state.activePath);
}

export function useSessionsByWorkspace(): Record<string, SessionInfo[]> {
  return useWorkspaceStore((state) => state.sessionsByWorkspace);
}

/** True while any workspace is still fetching its first session list. */
export function useSessionsLoading(): boolean {
  return useWorkspaceStore((state) => Object.values(state.loadingSessions).some(Boolean));
}
