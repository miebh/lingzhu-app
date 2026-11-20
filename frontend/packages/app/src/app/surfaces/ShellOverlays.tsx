import { MobileDrawer } from "../../components/shell/MobileDrawer";
import { useShell } from "../ShellProvider";

/** Floating shell chrome: the mobile drawer. */
export function ShellOverlays() {
  const shell = useShell();
  const { view } = shell;

  return (
    <>
      {shell.mobile && shell.mobileDrawerOpen && (
        <MobileDrawer
          tabs={shell.tabs.sideTabs}
          activeKey={shell.activeSideTab}
          workspaces={shell.workspaceList}
          activePath={shell.activeWorkspace?.path}
          closedCount={shell.tabs.closedTabs.length}
          onReopenClosed={() => {
            shell.tabs.reopenClosedTab();
            shell.setMobileDrawerOpen(false);
          }}
          onSelectWorkspace={(path) => {
            shell.workspaceActions.select(path);
            shell.setMobileDrawerOpen(false);
          }}
          onNewForWorkspace={(path) => {
            shell.workspaceActions.select(path);
            void shell.chatActions.newChat(path);
            shell.setMobileDrawerOpen(false);
          }}
          onRenameTab={(tab) => {
            const entry = shell.tabs.sessionTabs.find((item) => item.key === tab.key);
            const session =
              entry && shell.sessionsByWorkspace[entry.path]?.find((item) => item.id === entry.sessionID);
            if (entry && session) shell.dialogs.setRenameTarget({ workspace: entry.path, session });
            shell.setMobileDrawerOpen(false);
          }}
          onForkTab={(tab) => {
            const entry = shell.tabs.sessionTabs.find((item) => item.key === tab.key);
            const session =
              entry && shell.sessionsByWorkspace[entry.path]?.find((item) => item.id === entry.sessionID);
            if (entry && session) void shell.sessionActions.forkSession(entry.path, session);
            shell.setMobileDrawerOpen(false);
          }}
          onDeleteTab={(tab) => {
            const entry = shell.tabs.sessionTabs.find((item) => item.key === tab.key);
            const session =
              entry && shell.sessionsByWorkspace[entry.path]?.find((item) => item.id === entry.sessionID);
            if (entry && session) shell.dialogs.setDeleteTarget({ workspace: entry.path, session });
            shell.setMobileDrawerOpen(false);
          }}
          onSelect={(tab) => {
            shell.tabs.selectSideTab(tab);
            shell.setMobileDrawerOpen(false);
          }}
          onNew={() => {
            shell.tabs.openNewTab();
            shell.setMobileDrawerOpen(false);
          }}
          onSearch={() => {
            shell.dialogs.setPaletteOpen(true);
            shell.setMobileDrawerOpen(false);
          }}
          onOpenSettings={() => {
            view.openSettings();
            shell.setMobileDrawerOpen(false);
          }}
          onCloseTab={(tab) => {
            shell.tabs.closeSideTab(tab);
            shell.setMobileDrawerOpen(false);
          }}
          onClose={() => shell.setMobileDrawerOpen(false)}
        />
      )}
    </>
  );
}
