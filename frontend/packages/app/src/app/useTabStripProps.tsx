import type { ComponentProps } from "react";
import { System } from "@wailsio/runtime";
import type { SideTabs } from "../components/shell/SideTabs";
import { useShell } from "./ShellProvider";

const macChrome = System.IsMac();

type TabStripProps = Omit<ComponentProps<typeof SideTabs>, "children">;

/** Everything the vertical tab rail needs, resolved from the provider. */
export function useTabStripProps(): TabStripProps {
  const shell = useShell();
  const { tabs, view, dialogs, keybinds } = shell;

  return {
    tabs: tabs.sideTabs,
    activeKey: shell.activeSideTab,
    homeActive: view.tab === "chat" && view.homeOpen,
    highlightActive:
      shell.projectSelection === undefined || shell.projectSelection !== shell.activeSideTab,
    onCloseOthers: tabs.closeOtherTabs,
    onCloseAfter: tabs.closeTabsAfter,
    onDeleteTab: tabs.deleteTab,
    onRename: tabs.renameTab,
    onReorder: tabs.reorderTabs,
    homeKeybind: keybinds["home.toggle"],
    newKeybind: keybinds["tab.new"],
    searchKeybind: keybinds.palette,
    closedTabs: tabs.closedSideTabs,
    onReopenClosed: tabs.reopenClosedTab,
    width: shell.sideTabsWidth,
    topInset: macChrome ? 8 : 1,
    onWidthChange: shell.setSideTabsWidth,
    onSelect: tabs.selectSideTab,
    onClose: tabs.closeSideTab,
    onHome: () => view.showHome(),
    onNew: () => {
      if (shell.activeWorkspace) void shell.chatActions.newChat(shell.activeWorkspace.path);
    },
    onSearch: () => dialogs.setPaletteOpen(true),
  };
}
