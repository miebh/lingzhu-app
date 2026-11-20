import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { focusComposer, navigateMessage, toggleAutoApprove } from "../lib/shellActions";
import { buildPaletteCommands } from "./paletteCommands";
import { useShell } from "./ShellProvider";
import { useActiveChat } from "./hooks";
import { useChatStore } from "../store/chat";
import { useTabsStore } from "../store/tabs";
import { useRevert } from "./useRevert";
import { useT } from "@lingzhu/ui/i18n";

/** Palette data for the shell, built from the provider instead of passed down. */
export function usePaletteCommands() {
  const tr = useT();
  const shell = useShell();
  const { panel, tabs, sessionActions, dialogs } = shell;
  const active = useActiveChat();
  // Only the status of each session changes a palette row, so the list is keyed
  // on a signature instead of the chat map; a streamed token would otherwise
  // rebuild every command.
  const chatSignature = useChatStore(
    useShallow((state) =>
      Object.entries(state.chats).map(([key, chat]) => `${key}:${chat.running ? 1 : 0}`),
    ),
  );
  const chats = useMemo(() => useChatStore.getState().chats, [chatSignature.join("\u0002")]);
  const seenSessions = useTabsStore((state) => state.seen);
  const revert = useRevert({
    workspace: shell.activeWorkspace?.path,
    sessionID: active?.id,
    entryCount: active?.entries.length ?? 0,
    restorePrompt: shell.restoreText,
  });

  return buildPaletteCommands({
    active,
    activeWorkspace: shell.activeWorkspace,
    workspaceList: shell.workspaceList,
    sessionsByWorkspace: shell.sessionsByWorkspace,
    chats,
    seenSessions,
    activeKey: shell.activeKey,
    sideTabs: tabs.sideTabs,
    activeSideTab: shell.activeSideTab,
    revertCan: revert.revertCan,
    preferences: shell.preferences,
    view: shell.view,
    workspaceActions: shell.workspaceActions,
    chatActions: shell.chatActions,
    setSidebarOpen: shell.setSidebarOpen,
    setPanelOpen: panel.setPanelOpen,
    focusComposer,
    toggleAutoApprove,
    openSidePanel: panel.openSidePanel,
    reopenClosedTab: tabs.reopenClosedTab,
    closeSideTab: tabs.closeSideTab,
    navigateMessage,
    forkSession: sessionActions.forkSession,
    compactSession: sessionActions.compactSession,
    undoLatestTurn: revert.undoLatestTurn,
    redoLatestTurn: revert.redoLatestTurn,
    openSummary: sessionActions.openSummary,
    dialogs,
  }, tr);
}
