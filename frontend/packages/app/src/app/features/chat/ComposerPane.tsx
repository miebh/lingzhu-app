import { Show, createMemo } from "solid-js";
import { Composer } from "../../../components/session/Composer";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useComposerCommands } from "../../useComposerCommands";
import { useRevert } from "../../useRevert";

/** Composer with the goal pill and history recall. */
export function ComposerPane() {
  const shell = useShell();
  const active = useActiveChat();
  const revert = useRevert({
    workspace: () => shell.activeWorkspace?.path,
    sessionID: () => active()?.id,
    entryCount: () => active()?.entries.length ?? 0,
    restorePrompt: shell.restoreText,
  });
  const composerCommands = useComposerCommands({
    commands: shell.agents.commands,
    agents: shell.agents.agents,
    defaultAgent: shell.agents.defaultAgent,
    homeAgent: shell.agents.homeAgent,
    setHomeAgent: shell.agents.setHomeAgent,
    active,
    activeWorkspace: () => shell.activeWorkspace,
    homeWorkspace: () => shell.homeWorkspace,
    revertCan: revert.revertCan,
    sessionsByWorkspace: () => shell.sessionsByWorkspace,
    openManageModels: shell.sessionActions.openManageModels,
    undoLatestTurn: revert.undoLatestTurn,
    redoLatestTurn: revert.redoLatestTurn,
    forkSession: shell.sessionActions.forkSession,
    compactSession: shell.sessionActions.compactSession,
    reload: shell.agents.reload,
  });

  // History recall rebuilds two lists from the whole transcript. The composer
  // only needs them when the arrow keys ask, so they follow the entry list
  // rather than being rebuilt on every streamed token.
  const entries = () => active()?.entries;
  const history = createMemo(() =>
    (entries() ?? [])
      .filter((entry) => entry.role === "user" && entry.text)
      .map((entry) => entry.text!)
      .reverse(),
  );
  const shellHistory = createMemo(() => [
    ...new Set(
      (entries() ?? [])
        .filter((entry) => entry.role === "shell" && entry.shell?.command)
        .map((entry) => entry.shell!.command!)
        .reverse(),
    ),
  ]);

  return (
    <Show when={active()}>
      {(chat) => (
        <Composer
          running={chat().running}
          disabled={!shell.activeWorkspace?.connected}
          providers={shell.providers}
          provider={chat().provider ?? shell.catalog?.provider ?? ""}
          model={chat().model ?? shell.catalog?.model ?? ""}
          commands={composerCommands()}
          agents={shell.agents.agents()}
          agent={chat().agent || shell.agents.defaultAgent()}
          quote={shell.quote}
          onQuoteConsumed={() => shell.clearQuote()}
          restore={shell.restorePrompt}
          history={history()}
          shellHistory={shellHistory()}
          workspace={shell.activeWorkspace?.path}
          borderUnderlay
          onSelectAgent={(agentID) => void shell.chatActions.selectAgent(agentID)}
          onSelectModel={(providerID, modelID) =>
            void shell.chatActions.selectModel(providerID, modelID)
          }
          onManageModels={() => shell.sessionActions.openManageModels(false)}
          onAddProvider={() => shell.sessionActions.openManageModels(true)}
          onSend={(text, delivery, attachments, references) =>
            void shell.chatActions.send(text, delivery, attachments, { references })
          }
          onStop={() => void shell.chatActions.stop()}
          onRunShell={(command) => void shell.chatActions.runShell(command)}
        />
      )}
    </Show>
  );
}
