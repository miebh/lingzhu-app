import { TitleBar } from "../../components/TitleBar";
import { TopTabs } from "../../components/TopTabs";
import { useShell } from "../ShellProvider";
import { useTopTabsProps } from "../useTabStripProps";

/** Window chrome: menu, Home/Search, window controls and the horizontal tab strip. */
export function ShellTitleBar() {
  const shell = useShell();
  const topTabs = useTopTabsProps();
  const { view, mobile, resolvedLayout, keybinds, chatActions, activeWorkspace } = shell;
  const horizontal = resolvedLayout === "horizontal";

  return (
    <TitleBar
      sidebarOpen={shell.sidebarOpen}
      onToggleSidebar={
        mobile || horizontal ? undefined : () => shell.setSidebarOpen((value) => !value)
      }
      onOpenDrawer={mobile ? () => shell.setMobileDrawerOpen(true) : undefined}
      onOpenSettings={() => view.openSettings()}
      onOpenPalette={() => shell.dialogs.setPaletteOpen(true)}
      onNewSession={() => {
        if (activeWorkspace) void chatActions.newChat(activeWorkspace.path);
      }}
      onHome={horizontal && !mobile ? () => view.showHome() : undefined}
      onSearch={horizontal && !mobile ? () => shell.dialogs.setPaletteOpen(true) : undefined}
      homeActive={view.tab === "chat" && view.homeOpen}
      searchKeybind={keybinds.palette}
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
    >
      {horizontal && !mobile && <TopTabs {...topTabs} />}
    </TitleBar>
  );
}
