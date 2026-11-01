import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { SessionInfo, WorkspaceInfo } from "../lib/types";
import { useNotify } from "./NotifyProvider";
import { usePreferences } from "./PreferencesProvider";
import { useLatest } from "./use-latest";

interface WorkspaceValue {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  activeWorkspace?: WorkspaceInfo;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  refresh: () => Promise<void>;
  select: (path: string) => void;
  loadSessions: (path: string) => Promise<void>;
  connect: () => Promise<WorkspaceInfo | undefined>;
  disconnect: (path: string) => Promise<void>;
  renameSession: (workspace: string, sessionID: string, title: string) => Promise<boolean>;
  deleteSession: (workspace: string, sessionID: string) => Promise<boolean>;
  /** Insert a row optimistically; a draft has no durable session yet. */
  prependSession: (workspace: string, session: SessionInfo) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | undefined>(undefined);

/** The workspace list, the active one, and the session history cached per workspace. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const notify = useNotify();
  const { preferences, ready } = usePreferences();
  const preferencesRef = useLatest(preferences);

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionInfo[]>>({});
  const activePathRef = useLatest(activePath);

  const refresh = useCallback(async () => {
    try {
      const list = await api.workspaces();
      setWorkspaces(list);
      setActivePath((prev) => {
        if (prev && list.some((workspace) => workspace.path === prev)) return prev;
        const preferred = preferencesRef.current.defaultWorkspace;
        if (preferred && list.some((workspace) => workspace.path === preferred)) return preferred;
        const first = list.find((workspace) => workspace.connected) ?? list[0];
        return first?.path;
      });
    } catch (error) {
      notify(messageOf(error));
    }
  }, [notify, preferencesRef]);

  // Preferences decide the startup workspace, so the first read waits for them.
  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  const select = useCallback((path: string) => {
    setActivePath((prev) => (prev === path ? prev : path));
  }, []);

  const loadSessions = useCallback(
    async (path: string) => {
      try {
        const list = await api.sessions(path);
        setSessionsByWorkspace((prev) => ({ ...prev, [path]: list }));
      } catch (error) {
        setSessionsByWorkspace((prev) => ({ ...prev, [path]: [] }));
        notify(messageOf(error));
      }
    },
    [notify],
  );

  const connect = useCallback(async () => {
    try {
      const info = await api.addWorkspace();
      await refresh();
      if (info?.path) setActivePath(info.path);
      notify("Workspace added", "info");
      return info;
    } catch (error) {
      notify(messageOf(error));
      await refresh();
      return undefined;
    }
  }, [notify, refresh]);

  const disconnect = useCallback(
    async (path: string) => {
      try {
        await api.removeWorkspace(path);
        await refresh();
        setSessionsByWorkspace((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setActivePath((prev) => (prev === path ? undefined : prev));
        notify("Workspace removed", "info");
      } catch (error) {
        notify(messageOf(error));
      }
    },
    [notify, refresh],
  );

  const renameSession = useCallback(
    async (workspace: string, sessionID: string, title: string) => {
      try {
        await api.rename(workspace, sessionID, title);
        if (workspace === activePathRef.current) await loadSessions(workspace);
        notify("Session renamed", "info");
        return true;
      } catch (error) {
        notify(messageOf(error));
        return false;
      }
    },
    [activePathRef, loadSessions, notify],
  );

  const deleteSession = useCallback(
    async (workspace: string, sessionID: string) => {
      try {
        await api.remove(workspace, sessionID);
        setSessionsByWorkspace((prev) => ({
          ...prev,
          [workspace]: (prev[workspace] ?? []).filter((item) => item.id !== sessionID),
        }));
        notify("Session deleted", "info");
        return true;
      } catch (error) {
        notify(messageOf(error));
        return false;
      }
    },
    [notify],
  );

  const prependSession = useCallback((workspace: string, session: SessionInfo) => {
    setSessionsByWorkspace((prev) => ({ ...prev, [workspace]: [session, ...(prev[workspace] ?? [])] }));
  }, []);

  const activeWorkspace = workspaces.find((workspace) => workspace.path === activePath);

  const value = useMemo(
    () => ({
      workspaces,
      activePath,
      activeWorkspace,
      sessionsByWorkspace,
      refresh,
      select,
      loadSessions,
      connect,
      disconnect,
      renameSession,
      deleteSession,
      prependSession,
    }),
    [
      workspaces,
      activePath,
      activeWorkspace,
      sessionsByWorkspace,
      refresh,
      select,
      loadSessions,
      connect,
      disconnect,
      renameSession,
      deleteSession,
      prependSession,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspaces must be used inside WorkspaceProvider");
  return value;
}
