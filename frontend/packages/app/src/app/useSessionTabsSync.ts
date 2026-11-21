import { createEffect, createMemo, onMount, type Accessor } from "solid-js";
import type { SessionInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { useTabsStore } from "../store/tabs";

interface Options {
  activePath: Accessor<string | undefined>;
  activeId: Accessor<string | undefined>;
  sessionsByWorkspace: Accessor<Record<string, SessionInfo[]>>;
  loadingSessions: Accessor<Record<string, boolean | undefined>>;
  workspaceList: Accessor<WorkspaceInfo[]>;
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
  const actions = useTabsStore((state) => ({
    addActiveTab: state.addActiveTab,
    pruneRestored: state.pruneRestored,
    persist: state.persist,
  }));

  // Tabs restored at startup, so stale ones can be dropped without touching
  // tabs opened during this run.
  const restoredTabKeys = new Set<string>();
  const reconciled = new Set<string>();
  // The shell getters are coarse, so each projection is memoised: these
  // effects should wake on a session or list change, not on a streamed token.
  const path = createMemo(() => activePath());
  const id = createMemo(() => activeId());
  const workspaces = createMemo(() => workspaceList());
  const loading = createMemo(() => loadingSessions());
  const sessions = createMemo(() => sessionsByWorkspace());

  onMount(() => {
    useTabsStore.getState().hydrate();
    for (const tab of useTabsStore.getState().tabs) restoredTabKeys.add(tab.key);
  });

  createEffect(() => {
    const currentPath = path();
    const currentId = id();
    if (!currentPath || !currentId) return;
    actions().addActiveTab(currentPath, currentId);
  });

  createEffect(() => {
    const list = workspaces();
    const loadingState = loading();
    const sessionRows = sessions();
    const ready = list.filter((workspace) => {
      if (!workspace.connected) return false;
      if (loadingState[workspace.path] !== false) return false;
      if (reconciled.has(workspace.path)) return false;
      return (sessionRows[workspace.path] ?? []).length > 0;
    });
    if (ready.length === 0) return;
    for (const workspace of ready) reconciled.add(workspace.path);
    const known = new Map(
      ready.map((workspace) => [
        workspace.path,
        new Set((sessionRows[workspace.path] ?? []).map((session) => session.id)),
      ]),
    );
    actions().pruneRestored(known, restoredTabKeys);
  });

  // Drafts are ephemeral; only durable sessions survive a restart.
  const draftSignature = useChatStore((state) =>
    tabs().map((tab) => (state.chats[tab.key]?.draft ? "1" : "0")),
  );
  createEffect(() => {
    const current = tabs();
    const signature = draftSignature();
    const drafts = new Set(current.filter((_, index) => signature[index] === "1").map((tab) => tab.key));
    actions().persist(drafts);
  });
}
