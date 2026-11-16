import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ClosedSideTab, SideTab } from "../lib/sessionTabs";
import { chatKey, type SessionInfo } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { unreadKeys as computeUnread } from "./useSeenSessions";
import { selectClosedTabs, selectSideTabs, useTabsStore } from "../store/tabs";
import { useWorkspaceStore } from "../store/workspaces";

interface Options {
  activePath?: string;
  activeId?: string;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
}

/**
 * Session tabs are shared across the rail, titlebar, palette and overlays, so
 * their state lives in `store/tabs.ts`. This hook derives the row view models
 * with signature selectors, so a streaming token only re-renders rows whose
 * label or status actually changed. Persistence and the active-tab sync
 * effects live in `useSessionTabsSync` and run once from the shell bridge.
 */
export function useSessionTabs({ activePath, activeId, sessionsByWorkspace }: Options) {
  const tabs = useTabsStore((state) => state.tabs);
  const closed = useTabsStore((state) => state.closed);
  const seen = useTabsStore((state) => state.seen);
  const actions = useTabsStore(
    useShallow((state) => ({
      removeTabs: state.removeTabs,
      select: state.select,
      close: state.close,
      closeOthers: state.closeOthers,
      closeAfter: state.closeAfter,
      deleteTab: state.deleteTab,
      reopen: state.reopen,
      openNew: state.openNew,
      rename: state.rename,
      reorder: state.reorder,
    })),
  );

  // Row signature: rebuild only when a label, draft flag or status changes.
  const chatSignature = useChatStore(
    useShallow((state) =>
      tabs.map((tab) => {
        const chat = state.chats[tab.key];
        if (!chat) return "";
        return [
          chat.title ?? "",
          chat.draft ? 1 : 0,
          chat.running ? 1 : 0,
          chat.pending.length,
          chat.questions.length,
          chat.lastRunStatus ?? "",
        ].join("|");
      }),
    ),
  );
  const sessionSignature = useWorkspaceStore(
    useShallow((state) =>
      tabs.map(
        (tab) =>
          state.sessionsByWorkspace[tab.path]?.find((session) => session.id === tab.sessionID)?.title ?? "",
      ),
    ),
  );
  const activeKey = activePath && activeId ? chatKey(activePath, activeId) : undefined;
  // Unread derivation walks every loaded session row; memoizing it keeps that
  // scan off every render of the shell (streamed tokens included).
  const unread = useMemo(
    () => computeUnread(seen, sessionsByWorkspace, activeKey),
    [seen, sessionsByWorkspace, activeKey],
  );
  const unreadSignature = [...unread].sort().join("\u0001");

  const sideTabs: SideTab[] = useMemo(
    () =>
      selectSideTabs(
        tabs,
        useChatStore.getState().chats,
        useWorkspaceStore.getState().sessionsByWorkspace,
        new Set(unreadSignature ? unreadSignature.split("\u0001") : []),
      ),
    [tabs, chatSignature.join("\u0002"), sessionSignature.join("\u0002"), unreadSignature],
  );

  const closedSideTabs: ClosedSideTab[] = useMemo(
    () =>
      selectClosedTabs(
        closed,
        useChatStore.getState().chats,
        useWorkspaceStore.getState().sessionsByWorkspace,
      ),
    [closed, chatSignature.join("\u0002")],
  );

  // The provider hands this object to every surface, so a fresh identity on each
  // render would defeat the memoized layout components below it.
  return useMemo(
    () => ({
      sessionTabs: tabs,
      closedTabs: closed,
      sideTabs,
      closedSideTabs,
      removeSessionTabs: actions.removeTabs,
      selectSideTab: actions.select,
      closeSideTab: actions.close,
      closeOtherTabs: actions.closeOthers,
      closeTabsAfter: actions.closeAfter,
      deleteTab: actions.deleteTab,
      reopenClosedTab: actions.reopen,
      openNewTab: () => actions.openNew(activePath),
      renameTab: actions.rename,
      reorderTabs: actions.reorder,
    }),
    [tabs, closed, sideTabs, closedSideTabs, actions, activePath],
  );
}
