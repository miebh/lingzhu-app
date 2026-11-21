import { createMemo, type Accessor } from "solid-js";
import type { ClosedSideTab, SideTab } from "../lib/sessionTabs";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type SessionInfo } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { unreadKeys as computeUnread } from "./useSeenSessions";
import { selectClosedTabs, selectSideTabs, useTabsStore } from "../store/tabs";
import { useWorkspaceStore } from "../store/workspaces";

interface Options {
  activePath: Accessor<string | undefined>;
  activeId: Accessor<string | undefined>;
  sessionsByWorkspace: Accessor<Record<string, SessionInfo[]>>;
}

/**
 * Session tabs are shared across the rail, titlebar, palette and overlays, so
 * their state lives in `store/tabs.ts`. This hook derives the row view models
 * with signature selectors, so a streaming token only recomputes rows whose
 * label or status actually changed. Persistence and the active-tab sync
 * effects live in `useSessionTabsSync` and run once from the shell bridge.
 */
export function useSessionTabs({ activePath, activeId, sessionsByWorkspace }: Options) {
  const tabs = useTabsStore((state) => state.tabs);
  const closed = useTabsStore((state) => state.closed);
  const seen = useTabsStore((state) => state.seen);
  const actions = useTabsStore((state) => ({
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
  }));

  // Row signature: recompute only when a label, draft flag or status changes.
  const chatSignature = useChatStore((state) =>
    tabs().map((tab) => {
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
  );
  const sessionSignature = useWorkspaceStore((state) =>
    tabs().map((tab) => state.sessionsByWorkspace[tab.path]?.find((session) => session.id === tab.sessionID)?.title ?? ""),
  );
  const activeKey = createMemo(() => {
    const path = activePath();
    const id = activeId();
    return path && id ? chatKey(path, id) : undefined;
  });
  const unread = createMemo(() => computeUnread(seen(), sessionsByWorkspace(), activeKey()));

  const sideTabs = createMemo<SideTab[]>(() => {
    chatSignature();
    sessionSignature();
    return selectSideTabs(
      tabs(),
      useChatStore.getState().chats,
      useWorkspaceStore.getState().sessionsByWorkspace,
      unread(),
    );
  });

  const closedSideTabs = createMemo<ClosedSideTab[]>(() => {
    chatSignature();
    return selectClosedTabs(
      closed(),
      useChatStore.getState().chats,
      useWorkspaceStore.getState().sessionsByWorkspace,
    );
  });

  return {
    sessionTabs: tabs,
    closedTabs: closed,
    sideTabs,
    closedSideTabs,
    removeSessionTabs: actions().removeTabs,
    selectSideTab: actions().select,
    closeSideTab: actions().close,
    closeOtherTabs: actions().closeOthers,
    closeTabsAfter: actions().closeAfter,
    deleteTab: actions().deleteTab,
    reopenClosedTab: actions().reopen,
    openNewTab: () => actions().openNew(activePath()),
    renameTab: actions().rename,
    reorderTabs: actions().reorder,
  };
}
