import { createEffect, createMemo, type Accessor } from "solid-js";
import type { SessionInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Loads the session list for connected workspaces Home has not fetched yet, so
 * the recent list is complete even when the project tree is closed.
 *
 * This runs once from `ShellBridges`: `useShell` is a plain hook that every
 * surface calls, so an effect inside it would run once per caller and each copy
 * would write the store back.
 */
export function useSessionPrefetch({
  homeOpen,
  workspaceList,
  sessionsByWorkspace,
}: {
  homeOpen: Accessor<boolean>;
  workspaceList: Accessor<WorkspaceInfo[]>;
  sessionsByWorkspace: Accessor<Record<string, SessionInfo[]>>;
}) {
  // The shell getters are coarse, so each projection is memoised: the scan
  // should wake on a new workspace or row set, not on a streamed token.
  const open = createMemo(() => homeOpen());
  const workspaces = createMemo(() => workspaceList());
  const sessions = createMemo(() => sessionsByWorkspace());
  const requested = new Set<string>();

  createEffect(() => {
    if (!open()) return;
    const loaded = sessions();
    for (const workspace of workspaces()) {
      if (!workspace.connected) continue;
      // A list already in the store came from the caller that opened it; only a
      // workspace that has never been fetched loads here.
      if (loaded[workspace.path] !== undefined) continue;
      if (requested.has(workspace.path)) continue;
      requested.add(workspace.path);
      void useWorkspaceStore.getState().loadSessions(workspace.path);
    }
  });
}
