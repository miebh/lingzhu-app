import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect } from "solid-js";
import { sessionHref } from "../lib/routes";
import { finishStartupRestore, startupRestoreArmed } from "../lib/startupRestore";
import { useTabsStore } from "../store/tabs";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Reopens the tab the app was last on, matching the desktop reference: the
 * launch URL is Home, the tab strip came from storage, and the most recent
 * durable tab takes over with a replace navigation once workspaces are known.
 */
export function useStartupRestore(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const ready = useWorkspaceStore((state) => state.ready);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const tabs = useTabsStore((state) => state.tabs);
  const recent = useTabsStore((state) => state.recent);

  createEffect(() => {
    if (!startupRestoreArmed()) return;
    if (location.pathname !== "/") {
      finishStartupRestore();
      return;
    }
    const open = tabs();
    if (open.length === 0) {
      finishStartupRestore();
      return;
    }
    // Wait for the first workspace read; until then a missing path is not proof
    // that the project was removed. An empty list after a failed read waits for
    // the next refresh instead of throwing the remembered tab away.
    if (!ready() || workspaces().length === 0) return;
    // A disconnected workspace still knows its tab; the session route shows the
    // connection error, matching the reference instead of silently going Home.
    const known = new Set(workspaces().map((workspace) => workspace.path));
    const candidates = open.filter((tab) => known.has(tab.path));
    finishStartupRestore();
    if (candidates.length === 0) {
      useTabsStore.getState().clearRecent();
      return;
    }
    const saved = recent();
    const target = (saved && candidates.find((tab) => tab.key === saved.key)) ?? candidates[candidates.length - 1];
    if (saved && saved.key !== target.key) useTabsStore.getState().clearRecent();
    navigate(sessionHref(target.path, target.sessionID), { replace: true });
  });
}
