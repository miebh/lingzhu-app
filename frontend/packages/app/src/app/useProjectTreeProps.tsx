import type { ComponentProps } from "react";
import { Sidebar } from "../components/Sidebar";
import { chatKey } from "@lingzhu/ui/types";
import { useShell } from "./ShellProvider";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/chat";
import { useUnreadKeys } from "./hooks";

type ProjectTreeProps = Omit<ComponentProps<typeof Sidebar>, "children">;

/**
 * The Projects tree wiring. Every menu entry opens a dialog by id or runs a
 * session action, so the surface only has to render `<Sidebar {...tree} />`.
 */
export function useProjectTreeProps(): ProjectTreeProps {
  const shell = useShell();
  const { dialogs, workspaceActions, chatActions, sessionsByWorkspace } = shell;
  // Keep the tree calm while tokens stream: subscribe to a status signature,
  // then read the map snapshot for the render.
  const chatSignature = useChatStore(
    useShallow((state) =>
      Object.entries(state.chats).map(
        ([key, chat]) => `${key}:${chat.running ? 1 : 0}:${chat.pending.length}:${chat.questions.length}:${chat.lastRunStatus ?? ""}`,
      ),
    ),
  );
  const chats = useMemo(() => useChatStore.getState().chats, [chatSignature.join("\u0002")]);
  const unread = useUnreadKeys(shell.activeKey);

  const sessionTarget = (path: string, sessionID: string, title: string) => ({
    workspace: path,
    sessionID,
    title,
  });

  return {
    embedded: true,
    unreadKeys: unread,
    workspaces: shell.workspaceList,
    activePath: shell.activePath,
    sessionsByWorkspace,
    openSessionKeys: shell.tabs.sessionTabs.map((tab) => chatKey(tab.path, tab.sessionID)),
    chats,
    activeId: shell.activeId,
    onSelectWorkspace: (path) => {
      shell.view.showChat();
      workspaceActions.select(path);
    },
    onLoadSessions: workspaceActions.loadSessions,
    onAddWorkspace: () => void workspaceActions.connect(),
    onRemoveWorkspace: dialogs.setRemoveWorkspaceTarget,
    onWorktree: dialogs.setWorktreeTarget,
    onSourceControl: dialogs.setSourceControlTarget,
    onFiles: (path) => dialogs.setFilesTarget({ workspace: path }),
    onArtifacts: dialogs.setArtifactsTarget,
    onProject: dialogs.setProjectTarget,
    onImport: (path) => dialogs.setTransferTarget({ workspace: path }),
    onServices: dialogs.setServicesTarget,
    onCore: dialogs.setCoreTarget,
    onCoreModels: dialogs.setCoreModelsTarget,
    onMCP: dialogs.setMCPTarget,
    onPlugins: dialogs.setPluginsTarget,
    onSearch: dialogs.setSearchTarget,
    onLiveEvents: dialogs.setLiveEventsTarget,
    onSchedulesOverview: dialogs.setSchedulesOverviewTarget,
    onJobsOverview: dialogs.setJobsOverviewTarget,
    onUsageOverview: dialogs.setUsageOverviewTarget,
    onWebSearch: dialogs.setWebSearchTarget,
    onImageGen: dialogs.setImageGenTarget,
    onFormatters: dialogs.setFormattersTarget,
    onOAuth: dialogs.setOAuthTarget,
    onWorktreesManage: dialogs.setWorktreesTarget,
    onNew: (path) => void chatActions.newChat(path),
    onOpen: (path, id) => {
      shell.setProjectSelection(chatKey(path, id));
      void chatActions.open(path, id);
    },
    onRename: (path, session) => dialogs.setRenameTarget({ workspace: path, session }),
    onFork: (path, session) => void shell.sessionActions.forkSession(path, session),
    onSchedules: (path, session) =>
      dialogs.setSchedulesTarget(sessionTarget(path, session.id, session.title || session.id)),
    onPairing: (path, session) =>
      dialogs.setPairingTarget(sessionTarget(path, session.id, session.title || session.id)),
    onMedia: (path, session) =>
      dialogs.setMediaTarget(sessionTarget(path, session.id, session.title || session.id)),
    onUsage: (path, session) =>
      dialogs.setUsageTarget(sessionTarget(path, session.id, session.title || session.id)),
    onContext: (path, session) => {
      workspaceActions.select(path);
      void chatActions.open(path, session.id);
      shell.panel.openSidePanel("details");
    },
    onReferences: (path, session) =>
      dialogs.setReferencesTarget(sessionTarget(path, session.id, session.title || session.id)),
    onLog: (path, session) =>
      dialogs.setLogTarget(sessionTarget(path, session.id, session.title || session.id)),
    onInbox: (path, session) =>
      dialogs.setInboxTarget(sessionTarget(path, session.id, session.title || session.id)),
    onForms: (path, session) =>
      dialogs.setFormsTarget(sessionTarget(path, session.id, session.title || session.id)),
    onJobs: (path, session) =>
      dialogs.setJobsTarget(sessionTarget(path, session.id, session.title || session.id)),
    onSkills: (path, session) =>
      dialogs.setSkillsTarget(sessionTarget(path, session.id, session.title || session.id)),
    onSynthetic: (path, session) =>
      dialogs.setSyntheticTarget(sessionTarget(path, session.id, session.title || session.id)),
    onRunCommand: (path, session) =>
      dialogs.setRunCommandTarget(sessionTarget(path, session.id, session.title || session.id)),
    onWait: (path, session) =>
      dialogs.setWaitTarget(sessionTarget(path, session.id, session.title || session.id)),
    onPromptOnce: (path, session) =>
      dialogs.setPromptOnceTarget(sessionTarget(path, session.id, session.title || session.id)),
    onRevert: (path, session) =>
      dialogs.setRevertTarget(sessionTarget(path, session.id, session.title || session.id)),
    onReview: (path, session) => {
      workspaceActions.select(path);
      void chatActions.open(path, session.id);
      shell.panel.openSidePanel("review");
    },
    onCompact: (path, session) =>
      void shell.sessionActions.compactSession(sessionTarget(path, session.id, session.title || session.id)),
    onExport: (path, session) =>
      dialogs.setTransferTarget(sessionTarget(path, session.id, session.title || session.id)),
    onEnvironment: (path, session) =>
      dialogs.setEnvironmentTarget(sessionTarget(path, session.id, session.title || session.id)),
    onDelete: (path, session) => dialogs.setDeleteTarget({ workspace: path, session }),
    onShare: (path, session) =>
      dialogs.setShareTarget(sessionTarget(path, session.id, session.title || session.id)),
    onMove: (path, session) => dialogs.setMoveTarget({ path, session }),
    onDeleteSelected: dialogs.setBulkDeleteTarget,
    onMoveSelected: dialogs.setBulkMoveTarget,
    onExportSelected: (items) =>
      dialogs.setBulkExportTarget(items.map((item) => ({ path: item.path, id: item.id }))),
    selectionReset: shell.selectionReset,
  };
}
