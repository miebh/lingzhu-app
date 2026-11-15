import { SettingsPage } from "../../../components/settings/SettingsPage";
import { restartWorkspace } from "../../../lib/shellActions";
import { useShell } from "../../ShellProvider";
import { useAnyChatRunning } from "../../hooks";

/** Settings overlay; it keeps its own section state but reads the shell stores. */
export function SettingsPane() {
  const shell = useShell();
  const { view, activeWorkspace, homeWorkspace, workspaceList, preferences, dialogs } = shell;
  const running = useAnyChatRunning();

  return (
    <div
      className={`absolute inset-0 z-10 flex min-h-0 flex-col ${
        view.tab === "settings" ? "" : "invisible"
      }`}
    >
      <SettingsPage
        busy={running}
        section={view.settingsSection}
        onSectionChange={view.selectSettingsSection}
        project={shell.settingsProject}
        onProjectConsumed={() => shell.setSettingsProject(undefined)}
        workspaces={workspaceList}
        workspace={activeWorkspace?.path ?? homeWorkspace?.path}
        sessionCounts={shell.workspaceSessionCounts}
        preferences={preferences}
        onSavePreferences={shell.savePreferences}
        onSaved={(reused) => void shell.sessionActions.settingsSaved(reused)}
        onBack={() => view.closeSettings()}
        onAddWorkspace={() => void shell.workspaceActions.connect()}
        onRemoveWorkspace={dialogs.setRemoveWorkspaceTarget}
        onRestartWorkspace={restartWorkspace}
      />
    </div>
  );
}
