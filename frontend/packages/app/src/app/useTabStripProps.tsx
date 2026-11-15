import type { ComponentProps } from "react";
import { System } from "@wailsio/runtime";
import { InboxList } from "../components/InboxList";
import type { SideTabs } from "../components/SideTabs";
import type { TopTabs } from "../components/TopTabs";
import { useShell } from "./ShellProvider";
import { useInboxEntries } from "./hooks";

const macChrome = System.IsMac();

type TabStripProps = Omit<ComponentProps<typeof SideTabs>, "children">;
type TopTabsProps = ComponentProps<typeof TopTabs>;

/**
 * Everything the vertical tab rail needs, resolved from the provider. The
 * surface spreads this object instead of listing twenty wiring props.
 */
export function useTabStripProps(): TabStripProps {
  const shell = useShell();
  const { tabs, view, dialogs, keybinds, resolvedLayout } = shell;
  const inbox = useInboxEntries();

  return {
    tabs: tabs.sideTabs,
    activeKey: shell.activeSideTab,
    orientation: resolvedLayout,
    homeActive: view.tab === "chat" && view.homeOpen,
    highlightActive:
      shell.projectSelection === undefined || shell.projectSelection !== shell.activeSideTab,
    inbox:
      resolvedLayout === "inbox" ? (
        <InboxList
          entries={inbox.entries}
          activeKey={shell.activeSideTab}
          onOpen={inbox.open}
        />
      ) : undefined,
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

/** Horizontal tab strip inputs, resolved from the provider. */
export function useTopTabsProps(): TopTabsProps {
  const shell = useShell();
  const { tabs, keybinds } = shell;

  return {
    tabs: tabs.sideTabs,
    activeKey: shell.activeSideTab,
    onSelect: tabs.selectSideTab,
    onClose: tabs.closeSideTab,
    onCloseOthers: tabs.closeOtherTabs,
    onCloseAfter: tabs.closeTabsAfter,
    onDeleteTab: tabs.deleteTab,
    onRename: tabs.renameTab,
    onReorder: tabs.reorderTabs,
    onNew: tabs.openNewTab,
    newKeybind: keybinds["tab.new"],
    closedTabs: tabs.closedSideTabs,
    onReopenClosed: tabs.reopenClosedTab,
  };
}
