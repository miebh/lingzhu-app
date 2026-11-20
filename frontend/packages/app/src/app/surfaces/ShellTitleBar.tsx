import { TitleBar } from "../../components/shell/TitleBar";
import { useShell } from "../ShellProvider";

/** Window chrome: menu, sidebar toggle, window controls and session navigation. */
export function ShellTitleBar() {
  const shell = useShell();
  const { view, mobile, keybinds, chatActions, activeWorkspace } = shell;

  return (
    <TitleBar
      sidebarOpen={shell.sidebarOpen}
      onToggleSidebar={mobile ? undefined : () => shell.setSidebarOpen((value) => !value)}
      onOpenDrawer={mobile ? () => shell.setMobileDrawerOpen(true) : undefined}
      onOpenSettings={() => view.openSettings()}
      onOpenPalette={() => shell.dialogs.setPaletteOpen(true)}
      onNewSession={() => {
        if (activeWorkspace) void chatActions.newChat(activeWorkspace.path);
      }}
      sidebarKeybind={keybinds["sidebar.toggle"]}
      onPreviousTab={() => {
        if (shell.tabs.sideTabs.length < 2) return;
        const index = shell.tabs.sideTabs.findIndex((tab) => tab.key === shell.activeSideTab);
        if (index < 0) return;
        shell.tabs.selectSideTab(
          shell.tabs.sideTabs[(index - 1 + shell.tabs.sideTabs.length) % shell.tabs.sideTabs.length],
        );
      }}
      onNextTab={() => {
        if (shell.tabs.sideTabs.length < 2) return;
        const index = shell.tabs.sideTabs.findIndex((tab) => tab.key === shell.activeSideTab);
        if (index < 0) return;
        shell.tabs.selectSideTab(shell.tabs.sideTabs[(index + 1) % shell.tabs.sideTabs.length]);
      }}
    />
  );
}
