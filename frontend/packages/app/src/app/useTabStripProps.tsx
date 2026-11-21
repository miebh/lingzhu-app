import { System } from "@wailsio/runtime";
import type { SideTabs } from "../components/shell/SideTabs";
import { useShell } from "./ShellProvider";

const macChrome = System.IsMac();

type TabStripProps = Omit<Parameters<typeof SideTabs>[0], "children">;

/**
 * Defines live fields on a prop bag handed to a child once. The child reads
 * the property while rendering, so the getter re-reads the shell instead of
 * freezing the value captured at setup time.
 */
function liveProps<T extends object>(target: T, live: Partial<Record<keyof T, () => unknown>>): T {
  for (const key of Object.keys(live) as Array<keyof T>) {
    const read = live[key]!;
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get: () => read(),
    });
  }
  return target;
}

/** Everything the vertical tab rail needs, resolved from the provider. */
export function useTabStripProps(): TabStripProps {
  const shell = useShell();
  const { tabs, view, dialogs } = shell;

  const props: TabStripProps = {
    // Replaced by the live getter below; the placeholder only satisfies the type.
    tabs: [],
    onCloseOthers: tabs.closeOtherTabs,
    onCloseAfter: tabs.closeTabsAfter,
    onDeleteTab: tabs.deleteTab,
    onRename: tabs.renameTab,
    onReorder: tabs.reorderTabs,
    topInset: macChrome ? 8 : 1,
    onReopenClosed: tabs.reopenClosedTab,
    onWidthChange: shell.setSideTabsWidth,
    onSelect: tabs.selectSideTab,
    onClose: tabs.closeSideTab,
    onHome: () => view.showHome(),
    onNew: () => {
      const workspace = shell.activeWorkspace;
      if (workspace) void shell.chatActions.newChat(workspace.path);
    },
    onSearch: () => dialogs.setPaletteOpen(true),
  };

  return liveProps(props, {
    tabs: () => tabs.sideTabs(),
    activeKey: () => shell.activeSideTab,
    homeActive: () => view.tab === "chat" && view.homeOpen,
    highlightActive: () => shell.projectSelection === undefined || shell.projectSelection !== shell.activeSideTab,
    homeKeybind: () => shell.keybinds["home.toggle"],
    newKeybind: () => shell.keybinds["tab.new"],
    searchKeybind: () => shell.keybinds.palette,
    closedTabs: () => tabs.closedSideTabs(),
    width: () => shell.sideTabsWidth,
  });
}
