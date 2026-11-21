import { TitleBar } from "../../components/shell/TitleBar";
import { useShell } from "../ShellProvider";

/** Window chrome: menu, sidebar toggle, window controls and session navigation. */
export function ShellTitleBar() {
  const shell = useShell();
  const view = shell.view;
  const activeWorkspace = () => shell.activeWorkspace;

  return (
    <TitleBar
      sidebarOpen={shell.sidebarOpen}
      onToggleSidebar={shell.mobile ? undefined : () => shell.setSidebarOpen((value) => !value)}
      onOpenDrawer={shell.mobile ? () => shell.setMobileDrawerOpen(true) : undefined}
      onOpenSettings={() => view.openSettings()}
      onOpenPalette={() => shell.dialogs.setPaletteOpen(true)}
      onNewSession={() => {
        const workspace = activeWorkspace();
        if (workspace) void shell.chatActions.newChat(workspace.path);
      }}
      sidebarKeybind={shell.keybinds["sidebar.toggle"]}
      onPreviousTab={() => {
        const tabs = shell.tabs.sideTabs();
        if (tabs.length < 2) return;
        const index = tabs.findIndex((tab) => tab.key === shell.activeSideTab);
        if (index < 0) return;
        shell.tabs.selectSideTab(tabs[(index - 1 + tabs.length) % tabs.length]);
      }}
      onNextTab={() => {
        const tabs = shell.tabs.sideTabs();
        if (tabs.length < 2) return;
        const index = tabs.findIndex((tab) => tab.key === shell.activeSideTab);
        if (index < 0) return;
        shell.tabs.selectSideTab(tabs[(index + 1) % tabs.length]);
      }}
    />
  );
}
