import { HomeDashboard } from "../../../components/HomeDashboard";
import { useShell } from "../../ShellProvider";
import { useHomeRows } from "../../hooks";

/** Home: projects column plus the recent session list and its search. */
export function HomePane() {
  const shell = useShell();
  const { view, workspaceActions, chatActions, dialogs } = shell;
  const rows = useHomeRows().filter((row) => (shell.homeProject ? row.path === shell.homeProject : true));
  const openKeys = new Set(shell.tabs.sessionTabs.map((tab) => tab.key));

  return (
    <HomeDashboard
      workspaces={shell.workspaceList}
      hideProjects={shell.mobile}
      activePath={shell.activePath}
      selectedPath={shell.homeProject}
      hideProjectName={shell.homeProject !== undefined}
      rows={rows}
      openKeys={openKeys}
      loading={shell.sessionsLoading}
      onRename={(row) => {
        const session = shell.sessionsByWorkspace[row.path]?.find((item) => item.id === row.sessionID);
        if (session) dialogs.setRenameTarget({ workspace: row.path, session });
      }}
      onExport={(row) =>
        dialogs.setTransferTarget({ workspace: row.path, sessionID: row.sessionID, title: row.title })
      }
      onDelete={(row) => {
        const session = shell.sessionsByWorkspace[row.path]?.find((item) => item.id === row.sessionID);
        if (session) dialogs.setDeleteTarget({ workspace: row.path, session });
      }}
      onOpenSession={(path, sessionID) => {
        workspaceActions.select(path);
        void chatActions.open(path, sessionID);
      }}
      onSelectWorkspace={(path) => {
        workspaceActions.select(path);
        shell.setHomeProject((current) => (current === path ? undefined : path));
      }}
      onOpenWorkspace={(path) => {
        workspaceActions.select(path);
        view.closeHome();
      }}
      onNewSession={(path) => {
        workspaceActions.select(path);
        void chatActions.newChat(path);
      }}
      onAddWorkspace={() => void workspaceActions.connect()}
      onOpenSettings={() => view.openSettings()}
    />
  );
}
