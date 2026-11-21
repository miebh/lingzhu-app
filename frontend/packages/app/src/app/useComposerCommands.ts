import { createMemo, type Accessor } from "solid-js";
import { messageOf } from "../lib/errors";
import { builtinSlashCommands, nextAgentID, withBuiltinCommands } from "../lib/slash";
import type { AgentProfile, ChatState, SessionInfo, SlashCommand, WorkspaceInfo } from "@lingzhu/ui/types";
import { t, useT } from "@lingzhu/ui/i18n";
import { useChatStore } from "../store/chat";
import { openDialog } from "../store/dialogs";
import { notify } from "../store/notify";
import { useViewStore } from "../store/view";

interface Options {
  commands: Accessor<SlashCommand[]>;
  agents: Accessor<AgentProfile[]>;
  defaultAgent: Accessor<string>;
  homeAgent: Accessor<string>;
  setHomeAgent: (value: string) => void;
  active: Accessor<ChatState | undefined>;
  activeWorkspace: Accessor<WorkspaceInfo | undefined>;
  homeWorkspace: Accessor<WorkspaceInfo | undefined>;
  revertCan: Accessor<{ undo: boolean; redo: boolean }>;
  sessionsByWorkspace: Accessor<Record<string, SessionInfo[]>>;
  openManageModels: (connect: boolean) => void;
  undoLatestTurn: (workspace: string, sessionID: string, text?: string) => Promise<void>;
  redoLatestTurn: (workspace: string, sessionID: string) => Promise<void>;
  forkSession: (workspace: string, session: SessionInfo) => void;
  compactSession: (target: { workspace: string; sessionID: string; title: string }) => void | Promise<void>;
  reload: () => Promise<void>;
}

/** Slash commands the composer offers, including the built-in actions. */
export function useComposerCommands(options: Options): Accessor<SlashCommand[]> {
  const tr = useT();

  return createMemo(() => {
    const commands = options.commands();
    const agents = options.agents();
    const defaultAgent = options.defaultAgent();
    const homeAgent = options.homeAgent();
    const active = options.active();
    const activeWorkspace = options.activeWorkspace();
    const homeWorkspace = options.homeWorkspace();
    const revertCan = options.revertCan();
    const sessionsByWorkspace = options.sessionsByWorkspace();
    const path = activeWorkspace?.path ?? homeWorkspace?.path;

    return withBuiltinCommands(
      commands,
      builtinSlashCommands(
        {
          path,
          session:
            active && activeWorkspace
              ? {
                  workspace: activeWorkspace.path,
                  id: active.id,
                  title: active.title,
                  hasMessages: active.entries.length > 0,
                }
              : undefined,
          canUndo: revertCan.undo,
          canRedo: revertCan.redo,
          agentCount: agents.length,
          actions: {
            chooseModel: () => options.openManageModels(false),
            connectProvider: () => options.openManageModels(true),
            reload: () => {
              if (!path) return;
              void (async () => {
                await options.reload();
                if (active) await useChatStore.getState().refresh(path, active.id);
                notify(t("notifyReloadedWorkspace"), "info");
              })().catch((error) => notify(messageOf(error)));
            },
            cycleAgent: () => {
              if (agents.length < 2) return;
              if (active) {
                const next = nextAgentID(agents, active.agent || defaultAgent);
                if (next) void useChatStore.getState().selectAgent(next);
                return;
              }
              const next = nextAgentID(agents, homeAgent);
              if (next) options.setHomeAgent(next);
            },
            newSession: (target) => {
              useViewStore.getState().showChat();
              void useChatStore.getState().newChat(target);
            },
            undo: (target) => {
              void options.undoLatestTurn(target.workspace, target.sessionID).catch((error) => notify(messageOf(error)));
            },
            redo: (target) => {
              void options.redoLatestTurn(target.workspace, target.sessionID).catch((error) => notify(messageOf(error)));
            },
            compact: (target) => void options.compactSession(target),
            fork: (target) => {
              const session = sessionsByWorkspace[target.workspace]?.find((entry) => entry.id === target.sessionID);
              if (session) void options.forkSession(target.workspace, session);
            },
            exportSession: (target) =>
              openDialog({
                id: "transfer",
                props: {
                  workspace: target.workspace,
                  sessionID: target.sessionID,
                  title: target.title,
                },
              }),
            openFile: () => openDialog({ id: "palette", props: {} }),
            mcp: (target) => openDialog({ id: "mcp", props: { path: target } }),
          },
        },
        tr,
      ),
    );
  });
}
