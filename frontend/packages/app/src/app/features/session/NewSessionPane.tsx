import { NewSessionHome } from "../../../components/session/NewSessionHome";
import { useShell } from "../../ShellProvider";
import { useComposerCommands } from "../../useComposerCommands";

/** The wordmark surface: project tray, model picker and composer. */
export function NewSessionPane() {
  const shell = useShell();
  const { homeWorkspace, workspaceList, home, providers, chatActions, agents } = shell;
  const dialogs = shell.dialogs;
  const commands = useComposerCommands({
    commands: agents.commands,
    agents: agents.agents,
    defaultAgent: agents.defaultAgent,
    homeAgent: agents.homeAgent,
    setHomeAgent: agents.setHomeAgent,
    active: undefined,
    activeWorkspace: undefined,
    homeWorkspace,
    revertCan: { undo: false, redo: false },
    sessionsByWorkspace: shell.sessionsByWorkspace,
    openManageModels: shell.sessionActions.openManageModels,
    undoLatestTurn: async () => undefined,
    redoLatestTurn: async () => undefined,
    forkSession: shell.sessionActions.forkSession,
    compactSession: shell.sessionActions.compactSession,
    reload: agents.reload,
  });

  return (
    <NewSessionHome
      workspaceName={homeWorkspace?.name}
      workspacePath={homeWorkspace?.path}
      workspaces={workspaceList}
      connected={homeWorkspace?.connected ?? false}
      providers={providers}
      provider={home.provider}
      model={home.model}
      commands={commands}
      agents={agents.agents}
      agent={agents.homeAgent}
      onSelectAgent={agents.setHomeAgent}
      onSelectModel={(providerID, modelID) => void chatActions.selectModel(providerID, modelID)}
      onManageModels={() => shell.sessionActions.openManageModels(false)}
      onAddProvider={() => shell.sessionActions.openManageModels(true)}
      onSend={(text, _delivery, attachments, references) =>
        void chatActions.startSession(text, agents.homeAgent, attachments, { references })
      }
      onAddWorkspace={() => void shell.workspaceActions.connect()}
      onSelectWorkspace={(path) => shell.workspaceActions.select(path)}
      onSelectWorktree={(path) => void shell.sessionActions.addWorktreeWorkspace(path)}
      onOpenWorktrees={() => homeWorkspace && dialogs.setWorktreesTarget(homeWorkspace.path)}
    />
  );
}
