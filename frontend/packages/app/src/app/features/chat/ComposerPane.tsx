import { useMemo } from "react";
import { Composer } from "../../../components/session/Composer";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useComposerCommands } from "../../useComposerCommands";
import { useRevert } from "../../useRevert";

/** Composer with the goal pill and history recall. */
export function ComposerPane() {
  const shell = useShell();
  const { activeWorkspace, catalog, chatActions, agents, providers } = shell;
  const active = useActiveChat();
  const revert = useRevert({
    workspace: activeWorkspace?.path,
    sessionID: active?.id,
    entryCount: active?.entries.length ?? 0,
    restorePrompt: shell.restoreText,
  });
  const composerCommands = useComposerCommands({
    commands: agents.commands,
    agents: agents.agents,
    defaultAgent: agents.defaultAgent,
    homeAgent: agents.homeAgent,
    setHomeAgent: agents.setHomeAgent,
    active,
    activeWorkspace,
    homeWorkspace: shell.homeWorkspace,
    revertCan: revert.revertCan,
    sessionsByWorkspace: shell.sessionsByWorkspace,
    openManageModels: shell.sessionActions.openManageModels,
    undoLatestTurn: revert.undoLatestTurn,
    redoLatestTurn: revert.redoLatestTurn,
    forkSession: shell.sessionActions.forkSession,
    compactSession: shell.sessionActions.compactSession,
    reload: agents.reload,
  });

  // History recall rebuilds two lists from the whole transcript. The composer
  // only needs them when the arrow keys ask, so they follow the entry list
  // rather than being rebuilt on every streamed token.
  const entries = active?.entries;
  const history = useMemo(
    () =>
      (entries ?? [])
        .filter((entry) => entry.role === "user" && entry.text)
        .map((entry) => entry.text!)
        .reverse(),
    [entries],
  );
  const shellHistory = useMemo(
    () => [
      ...new Set(
        (entries ?? [])
          .filter((entry) => entry.role === "shell" && entry.shell?.command)
          .map((entry) => entry.shell!.command!)
          .reverse(),
      ),
    ],
    [entries],
  );

  if (!active) return null;

  return (
    <Composer
      running={active.running}
      disabled={!activeWorkspace?.connected}
      providers={providers}
      provider={active.provider ?? catalog?.provider ?? ""}
      model={active.model ?? catalog?.model ?? ""}
      commands={composerCommands}
      agents={agents.agents}
      agent={active.agent || agents.defaultAgent}
      quote={shell.quote}
      onQuoteConsumed={() => shell.clearQuote()}
      restore={shell.restorePrompt}
      history={history}
      shellHistory={shellHistory}
      workspace={activeWorkspace?.path}
      borderUnderlay
      onSelectAgent={(agentID) => void chatActions.selectAgent(agentID)}
      onSelectModel={(providerID, modelID) => void chatActions.selectModel(providerID, modelID)}
      onManageModels={() => shell.sessionActions.openManageModels(false)}
      onAddProvider={() => shell.sessionActions.openManageModels(true)}
      onSend={(text, delivery, attachments, references) =>
        void chatActions.send(text, delivery, attachments, { references })
      }
      onStop={() => void chatActions.stop()}
      onRunShell={(command) => void chatActions.runShell(command)}
    />
  );
}
