import type { Dispatch, SetStateAction } from "react";
import { messageOf } from "../lib/errors";
import { builtinSlashCommands, nextAgentID, withBuiltinCommands } from "../lib/slash";
import type { AgentProfile, ChatState, SessionInfo, SlashCommand, WorkspaceInfo } from "@lingzhu/ui/types";
import { t, useT } from "@lingzhu/ui/i18n";
import { useChatStore } from "../store/chat";
import { openDialog } from "../store/dialogs";
import { notify } from "../store/notify";
import { useViewStore } from "../store/view";

interface Options {
  commands: SlashCommand[];
  agents: AgentProfile[];
  defaultAgent: string;
  homeAgent: string;
  setHomeAgent: Dispatch<SetStateAction<string>>;
  active?: ChatState;
  activeWorkspace?: WorkspaceInfo;
  homeWorkspace?: WorkspaceInfo;
  revertCan: { undo: boolean; redo: boolean };
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  openManageModels: (connect: boolean) => void;
  undoLatestTurn: (workspace: string, sessionID: string, text?: string) => Promise<void>;
  redoLatestTurn: (workspace: string, sessionID: string) => Promise<void>;
  forkSession: (workspace: string, session: SessionInfo) => void;
  compactSession: (target: { workspace: string; sessionID: string; title: string }) => void | Promise<void>;
  reload: () => Promise<void>;
}

/** Slash commands the composer offers, including the built-in actions. */
export function useComposerCommands(options: Options) {
  const tr = useT();
  const {
    commands,
    agents,
    defaultAgent,
    homeAgent,
    setHomeAgent,
    active,
    activeWorkspace,
    homeWorkspace,
    revertCan,
    sessionsByWorkspace,
    openManageModels,
    undoLatestTurn,
    redoLatestTurn,
    forkSession,
    compactSession,
    reload,
  } = options;

  return withBuiltinCommands(
    commands,
    builtinSlashCommands(
      {
        path: activeWorkspace?.path ?? homeWorkspace?.path,
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
          chooseModel: () => openManageModels(false),
          connectProvider: () => openManageModels(true),
          reload: () => {
            const path = activeWorkspace?.path ?? homeWorkspace?.path;
            if (!path) return;
            void (async () => {
              await reload();
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
            if (next) setHomeAgent(next);
          },
          newSession: (path) => {
            useViewStore.getState().showChat();
            void useChatStore.getState().newChat(path);
          },
          undo: (target) => {
            void undoLatestTurn(target.workspace, target.sessionID).catch((error) => notify(messageOf(error)));
          },
          redo: (target) => {
            void redoLatestTurn(target.workspace, target.sessionID).catch((error) => notify(messageOf(error)));
          },
          compact: (target) => void compactSession(target),
          fork: (target) => {
            const session = sessionsByWorkspace[target.workspace]?.find((entry) => entry.id === target.sessionID);
            if (session) void forkSession(target.workspace, session);
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
          mcp: (path) => openDialog({ id: "mcp", props: { path } }),
        },
      },
      tr,
    ),
  );
}
