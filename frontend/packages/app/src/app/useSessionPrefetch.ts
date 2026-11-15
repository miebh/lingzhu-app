import { useEffect, useRef } from "react";
import type { SessionInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Loads the session list for connected workspaces Home has not fetched yet, so
 * the recent list is complete even when the project tree is closed.
 *
 * This runs once from `ShellBridges`: `useShell` is a plain hook that every
 * surface calls, so an effect inside it would run once per caller and each copy
 * would write the store back, spinning React into an update-depth error.
 */
export function useSessionPrefetch({
  homeOpen,
  workspaceList,
  sessionsByWorkspace,
}: {
  homeOpen: boolean;
  workspaceList: WorkspaceInfo[];
  sessionsByWorkspace: Record<string, SessionInfo[]>;
}) {
  const sessionsRef = useRef(sessionsByWorkspace);
  sessionsRef.current = sessionsByWorkspace;
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!homeOpen) return;
    for (const workspace of workspaceList) {
      if (!workspace.connected) continue;
      // A list already in the store came from the caller that opened it; only a
      // workspace that has never been fetched loads here.
      if (sessionsRef.current[workspace.path] !== undefined) continue;
      if (requested.current.has(workspace.path)) continue;
      requested.current.add(workspace.path);
      void useWorkspaceStore.getState().loadSessions(workspace.path);
    }
  }, [homeOpen, workspaceList]);
}
