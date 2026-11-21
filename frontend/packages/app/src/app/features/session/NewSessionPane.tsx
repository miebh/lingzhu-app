import { NewSessionHome } from "../../../components/session/NewSessionHome";
import { useWorkspaceStore } from "../../../store/workspaces";
import { useShell } from "../../ShellProvider";
import { useComposerCommands } from "../../useComposerCommands";

/** The wordmark surface: project tray, model picker and composer. */
export function NewSessionPane(props: { draftId?: string }) {
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

  const selectWorkspace = (path: string) => {
    // For a draft the move also selects the workspace; only a pane without a
    // draft falls back to changing the global selection on its own.
    if (props.draftId && shell.chatActions.relocateDraft(props.draftId, path)) return;
    shell.workspaceActions.select(path);
  };

  const selectWorktree = (path: string) => {
    void shell.sessionActions.addWorktreeWorkspace(path).then(() => {
      if (!props.draftId) return;
      // A failed add leaves the path out of the workspace list; only re-target
      // the draft once the checkout is a real workspace. Read the store rather
      // than the captured shell, whose workspace list predates the add.
      if (!useWorkspaceStore.getState().workspaces.some((workspace) => workspace.path === path)) return;
      shell.chatActions.relocateDraft(props.draftId, path);
    });
  };

  const addWorkspace = () => {
    void shell.workspaceActions.connect().then((added) => {
      if (!added || !props.draftId) return;
      shell.chatActions.relocateDraft(props.draftId, added.path);
    });
  };

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
      onAddWorkspace={addWorkspace}
      onSelectWorkspace={selectWorkspace}
      onSelectWorktree={selectWorktree}
      onOpenWorktrees={() => {
        const workspace = shell.homeWorkspace;
        if (workspace) dialogs.setWorktreesTarget(workspace.path);
      }}
    />
  );
}
