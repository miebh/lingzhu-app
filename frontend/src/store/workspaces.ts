import { create } from "zustand";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { SessionInfo, WorkspaceInfo } from "../lib/types";
import { notify } from "./notify";
import { usePreferencesStore } from "./preferences";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  /** Session history cached per workspace, so switching back does not refetch. */
  sessionsByWorkspace: Record<string, SessionInfo[]>;
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

/** The workspace list, the active one, and the session history per workspace. */
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activePath: undefined,
  sessionsByWorkspace: {},

  refresh: async () => {
    try {
      const list = await api.workspaces();
      set((state) => {
        if (state.activePath && list.some((workspace) => workspace.path === state.activePath)) {
          return { workspaces: list };
        }
        const preferred = usePreferencesStore.getState().preferences.defaultWorkspace;
        const preferredPath =
          preferred && list.some((workspace) => workspace.path === preferred) ? preferred : undefined;
        const next = preferredPath ?? (list.find((workspace) => workspace.connected) ?? list[0])?.path;
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
    try {
      const list = await api.sessions(path);
      set((state) => ({ sessionsByWorkspace: { ...state.sessionsByWorkspace, [path]: list } }));
    } catch (error) {
      set((state) => ({ sessionsByWorkspace: { ...state.sessionsByWorkspace, [path]: [] } }));
      notify(messageOf(error));
    }
  },

  connect: async () => {
    try {
      const info = await api.addWorkspace();
      await get().refresh();
      if (info?.path) set({ activePath: info.path });
      notify("Workspace added", "info");
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
      notify("Workspace removed", "info");
    } catch (error) {
      notify(messageOf(error));
    }
  },

  renameSession: async (workspace, sessionID, title) => {
    try {
      await api.rename(workspace, sessionID, title);
      if (workspace === get().activePath) await get().loadSessions(workspace);
      notify("Session renamed", "info");
      return true;
    } catch (error) {
      notify(messageOf(error));
      return false;
    }
  },

  deleteSession: async (workspace, sessionID) => {
    try {
      await api.remove(workspace, sessionID);
      set((state) => ({
        sessionsByWorkspace: {
          ...state.sessionsByWorkspace,
          [workspace]: (state.sessionsByWorkspace[workspace] ?? []).filter((item) => item.id !== sessionID),
        },
      }));
      notify("Session deleted", "info");
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
        await api.remove(workspace, sessionID);
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
