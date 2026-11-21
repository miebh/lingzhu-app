import type { JSX } from "solid-js";
import { DialogHost } from "./DialogHost";
import { useAtHome } from "./hooks";
import { ShellProvider, useShell } from "./ShellProvider";
import { ShellMain } from "./surfaces/ShellMain";
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
 * pulls what it needs, so this component only composes the regions. The router
 * supplies the main pane through `children`.
 */
export function AppShell(props: { children?: JSX.Element }) {
  return (
    <ShellProvider>
      <ShellLayout>{props.children}</ShellLayout>
      <ShellBridges />
    </ShellProvider>
  );
}

/** Side-effect only: it must not make the layout subscribe to chat updates. */
function ShellBridges() {
  const shell = useShell();
  const atHome = useAtHome();
  const activePath = () => shell.activePath;
  // The shortcuts only need the active agent and whether a session is open.
  // Reading the whole chat here would recompute on every streamed token.
  const activeAgent = useChatStore((state) => {
    const path = activePath();
    const sessionID = path ? state.activeByWorkspace[path] : undefined;
    return path && sessionID ? state.chats[chatKey(path, sessionID)]?.agent : undefined;
  });
  const hasActive = useChatStore((state) => {
    const path = activePath();
    const sessionID = path ? state.activeByWorkspace[path] : undefined;
    return Boolean(path && sessionID && state.chats[chatKey(path, sessionID)]);
  });

  useAppNotifications(activePath, () => shell.activeId);
  useSeenSessions({
    workspaceList: () => shell.workspaceList,
    sessionsByWorkspace: () => shell.sessionsByWorkspace,
    activeKey: () => shell.activeKey,
  });
  useSessionPrefetch({
    homeOpen: () => shell.view.homeOpen,
    workspaceList: () => shell.workspaceList,
    sessionsByWorkspace: () => shell.sessionsByWorkspace,
  });
  useSessionTabsSync({
    activePath,
    activeId: () => shell.activeId,
    sessionsByWorkspace: () => shell.sessionsByWorkspace,
    loadingSessions: () => shell.loadingSessions,
    workspaceList: () => shell.workspaceList,
  });
  useShortcuts({
    preferences: () => shell.preferences,
    savePreferences: shell.savePreferences,
    activeAgent,
    hasActive,
    activeWorkspacePath: () => shell.activeWorkspace?.path,
    homeWorkspacePath: () => shell.homeWorkspace?.path,
    agents: shell.agents.agents,
    defaultAgent: shell.agents.defaultAgent,
    homeAgent: shell.agents.homeAgent,
    setHomeAgent: shell.agents.setHomeAgent,
    sideTabs: shell.tabs.sideTabs,
    activeSideTab: () => shell.activeSideTab,
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

function ShellLayout(props: { children?: JSX.Element }) {
  return (
    <div class="relative flex h-full flex-col bg-bg-deep text-text-base">
      <ShellTitleBar />
      <div class="flex min-h-0 flex-1">
        <main class="relative flex min-w-0 flex-1 flex-row">
          <ShellSidebar />
          <ShellMain>{props.children}</ShellMain>
        </main>
      </div>
      <ShellOverlays />
      <DialogHost />
    </div>
  );
}
