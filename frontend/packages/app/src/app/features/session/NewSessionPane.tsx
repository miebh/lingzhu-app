import { NewSessionHome } from "../../../components/session/NewSessionHome";
import { useShell } from "../../ShellProvider";
import { useComposerCommands } from "../../useComposerCommands";

/** The wordmark surface: project tray, model picker and composer. */
export function NewSessionPane() {
  const shell = useShell();
  const dialogs = shell.dialogs;
  const commands = useComposerCommands({
    commands: shell.agents.commands,
    agents: shell.agents.agents,
    defaultAgent: shell.agents.defaultAgent,
    homeAgent: shell.agents.homeAgent,
    setHomeAgent: shell.agents.setHomeAgent,
    active: () => undefined,
    activeWorkspace: () => undefined,
    homeWorkspace: () => shell.homeWorkspace,
    revertCan: () => ({ undo: false, redo: false }),
    sessionsByWorkspace: () => shell.sessionsByWorkspace,
    openManageModels: shell.sessionActions.openManageModels,
    undoLatestTurn: async () => undefined,
    redoLatestTurn: async () => undefined,
    forkSession: shell.sessionActions.forkSession,
    compactSession: shell.sessionActions.compactSession,
    reload: shell.agents.reload,
  });

  return (
    <NewSessionHome
      workspaceName={shell.homeWorkspace?.name}
      workspacePath={shell.homeWorkspace?.path}
      workspaces={shell.workspaceList}
      connected={shell.homeWorkspace?.connected ?? false}
      providers={shell.providers}
      provider={shell.home.provider}
      model={shell.home.model}
      commands={commands()}
      agents={shell.agents.agents()}
      agent={shell.agents.homeAgent()}
      onSelectAgent={shell.agents.setHomeAgent}
      onSelectModel={(providerID, modelID) =>
        void shell.chatActions.selectModel(providerID, modelID)
      }
      onManageModels={() => shell.sessionActions.openManageModels(false)}
      onAddProvider={() => shell.sessionActions.openManageModels(true)}
      onSend={(text, _delivery, attachments, references) =>
        void shell.chatActions.startSession(text, shell.agents.homeAgent(), attachments, { references })
      }
      onAddWorkspace={() => void shell.workspaceActions.connect()}
      onSelectWorkspace={(path) => shell.workspaceActions.select(path)}
      onSelectWorktree={(path) => void shell.sessionActions.addWorktreeWorkspace(path)}
      onOpenWorktrees={() => {
        const workspace = shell.homeWorkspace;
        if (workspace) dialogs.setWorktreesTarget(workspace.path);
      }}
    />
  );
}
