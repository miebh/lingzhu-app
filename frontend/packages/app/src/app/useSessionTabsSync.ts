import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SessionInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { useTabsStore } from "../store/tabs";

interface Options {
  activePath?: string;
  activeId?: string;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  loadingSessions: Record<string, boolean | undefined>;
  workspaceList: WorkspaceInfo[];
}

/**
 * Store sync for session tabs: hydrate the restored list, append the active
 * session, prune tabs whose session is gone and persist durable tabs.
 *
 * This must run once, from `ShellBridges`. `useShell` is a plain hook that
 * every surface calls, so an effect inside `useSessionTabs` would run once per
 * caller and each newly mounted surface (Home, the transcript, a dialog) would
 * append the still-active session's tab again after it was closed.
 */
export function useSessionTabsSync({
  activePath,
  activeId,
  sessionsByWorkspace,
  loadingSessions,
  workspaceList,
}: Options) {
  const tabs = useTabsStore((state) => state.tabs);
  const actions = useTabsStore(
    useShallow((state) => ({
      addActiveTab: state.addActiveTab,
      pruneRestored: state.pruneRestored,
      persist: state.persist,
    })),
  );

  // Tabs restored at startup, so stale ones can be dropped without touching
  // tabs opened during this run.
  const restoredTabKeys = useRef<Set<string>>(new Set());
  const reconciled = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    useTabsStore.getState().hydrate();
    restoredTabKeys.current = new Set(useTabsStore.getState().tabs.map((tab) => tab.key));
  }, []);

  useEffect(() => {
    if (!activePath || !activeId) return;
    actions.addActiveTab(activePath, activeId);
  }, [activePath, activeId, actions.addActiveTab]);

  useEffect(() => {
    const ready = workspaceList.filter((workspace) => {
      if (!workspace.connected) return false;
      if (loadingSessions[workspace.path] !== false) return false;
      if (reconciled.current.has(workspace.path)) return false;
      return (sessionsByWorkspace[workspace.path] ?? []).length > 0;
    });
    if (ready.length === 0) return;
    for (const workspace of ready) reconciled.current.add(workspace.path);
    const known = new Map(
      ready.map((workspace) => [
        workspace.path,
        new Set((sessionsByWorkspace[workspace.path] ?? []).map((session) => session.id)),
      ]),
    );
    actions.pruneRestored(known, restoredTabKeys.current);
  }, [workspaceList, loadingSessions, sessionsByWorkspace, actions.pruneRestored]);

  // Drafts are ephemeral; only durable sessions survive a restart.
  const draftSignature = useChatStore(
    useShallow((state) => tabs.map((tab) => (state.chats[tab.key]?.draft ? "1" : "0"))),
  );
  useEffect(() => {
    const drafts = new Set(tabs.filter((_, index) => draftSignature[index] === "1").map((tab) => tab.key));
    actions.persist(drafts);
  }, [tabs, draftSignature, actions.persist]);
}