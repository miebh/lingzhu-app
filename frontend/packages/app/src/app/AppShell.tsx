import { DialogHost } from "./DialogHost";
import { useAtHome } from "./hooks";
import { ShellProvider, useShell } from "./ShellProvider";
import { ShellContent } from "./surfaces/ShellContent";
import { ShellOverlays } from "./surfaces/ShellOverlays";
import { ShellSidebar } from "./surfaces/ShellSidebar";
import { ShellTitleBar } from "./surfaces/ShellTitleBar";
import { useAppNotifications } from "./useAppNotifications";
import { useSeenSessions } from "./useSeenSessions";
import { useSessionPrefetch } from "./useSessionPrefetch";
import { useSessionTabsSync } from "./useSessionTabsSync";
import { useShortcuts } from "./useShortcuts";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { useChatStore } from "../store/chat";

/**
 * The window layout. All shell state lives in `ShellProvider` and each surface
 * pulls what it needs, so this component only composes the regions.
 */
export function AppShell() {
  return (
    <ShellProvider>
      <ShellLayout />
      <ShellBridges />
    </ShellProvider>
  );
}

/** Side-effect only: it must not make the layout subscribe to chat updates. */
function ShellBridges() {
  const shell = useShell();
  const atHome = useAtHome();
  const activePath = shell.activePath;
  // The shortcuts only need the active agent and whether a session is open.
  // Reading the whole chat here would re-render the bridge on every streamed
  // token and re-register its window listeners.
  const activeAgent = useChatStore((state) => {
    const sessionID = activePath ? state.activeByWorkspace[activePath] : undefined;
    return activePath && sessionID ? state.chats[chatKey(activePath, sessionID)]?.agent : undefined;
  });
  const hasActive = useChatStore((state) => {
    const sessionID = activePath ? state.activeByWorkspace[activePath] : undefined;
    return Boolean(activePath && sessionID && state.chats[chatKey(activePath, sessionID)]);
  });

  useAppNotifications(shell.activePath, shell.activeId);
  useSeenSessions({
    workspaceList: shell.workspaceList,
    sessionsByWorkspace: shell.sessionsByWorkspace,
    activeKey: shell.activeKey,
  });
  useSessionPrefetch({
    homeOpen: shell.view.homeOpen,
    workspaceList: shell.workspaceList,
    sessionsByWorkspace: shell.sessionsByWorkspace,
  });
  useSessionTabsSync({
    activePath: shell.activePath,
    activeId: shell.activeId,
    sessionsByWorkspace: shell.sessionsByWorkspace,
    loadingSessions: shell.loadingSessions,
    workspaceList: shell.workspaceList,
  });
  useShortcuts({
    preferences: shell.preferences,
    savePreferences: shell.savePreferences,
    activeAgent,
    hasActive,
    activeWorkspacePath: shell.activeWorkspace?.path,
    homeWorkspacePath: shell.homeWorkspace?.path,
    agents: shell.agents.agents,
    defaultAgent: shell.agents.defaultAgent,
    homeAgent: shell.agents.homeAgent,
    setHomeAgent: shell.agents.setHomeAgent,
    sideTabs: shell.tabs.sideTabs,
    activeSideTab: shell.activeSideTab,
    atHome,
    reopenClosedTab: shell.tabs.reopenClosedTab,
    openNewTab: shell.tabs.openNewTab,
    closeSideTab: shell.tabs.closeSideTab,
    selectSideTab: shell.tabs.selectSideTab,
    setSidebarOpen: shell.setSidebarOpen,
    setPanelOpen: shell.panel.setPanelOpen,
    openManageModels: shell.sessionActions.openManageModels,
    setMCPTarget: shell.dialogs.setMCPTarget,
    togglePalette: shell.dialogs.togglePalette,
  });

  return null;
}

function ShellLayout() {
  return (
    <div className="relative flex h-full flex-col bg-bg-deep text-text-base">
      <ShellTitleBar />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-row">
          <ShellSidebar />
          <ShellContent />
        </main>
      </div>
      <ShellOverlays />
      <DialogHost />
    </div>
  );
}
