import { SettingsPage } from "../../../components/settings/SettingsPage";
import { CONFIG_FILE_TAB } from "../../../lib/sidePanel";
import { restartWorkspace } from "../../../lib/shellActions";
import { useShell } from "../../ShellProvider";
import { useAnyChatRunning } from "../../hooks";

/** Settings overlay; it keeps its own section state but reads the shell stores. */
export function SettingsPane() {
  const shell = useShell();
  const view = shell.view;
  const dialogs = shell.dialogs;
  const running = useAnyChatRunning();

  return (
    <div
      class={`absolute inset-0 z-10 flex min-h-0 flex-col ${
        view.tab === "settings" ? "" : "invisible"
      }`}
    >
      <SettingsPage
        busy={running()}
        section={view.settingsSection}
        onSectionChange={view.selectSettingsSection}
        project={shell.settingsProject}
        onProjectConsumed={() => shell.setSettingsProject(undefined)}
        workspaces={shell.workspaceList}
        workspace={shell.activeWorkspace?.path ?? shell.homeWorkspace?.path}
        sessionCounts={shell.workspaceSessionCounts}
        preferences={shell.preferences}
        onSavePreferences={shell.savePreferences}
        onSaved={(reused) => void shell.sessionActions.settingsSaved(reused)}
        onBack={() => view.closeSettings()}
        onAddWorkspace={() => void shell.workspaceActions.connect()}
        onRemoveWorkspace={dialogs.setRemoveWorkspaceTarget}
        onRestartWorkspace={restartWorkspace}
        onOpenSkillFile={
          shell.activeId
            ? (path) => {
                shell.panel.openFileInPanel(path);
                view.closeSettings();
              }
            : undefined
        }
        onOpenConfigFile={
          shell.activeId
            ? () => {
                shell.panel.openFileInPanel(CONFIG_FILE_TAB);
                view.closeSettings();
              }
            : undefined
        }
      />
    </div>
  );
}
