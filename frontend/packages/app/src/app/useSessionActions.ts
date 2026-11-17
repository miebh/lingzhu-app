import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { SessionInfo, SessionSelection } from "@lingzhu/ui/types";
import { useCatalogStore } from "../store/catalog";
import { useChatStore } from "../store/chat";
import { closeDialog, openDialog, useDialogStore } from "../store/dialogs";
import { notify } from "../store/notify";
import { useViewStore } from "../store/view";
import { useWorkspaceStore } from "../store/workspaces";
import { t } from "@lingzhu/ui/i18n";

interface Options {
  restorePrompt: (text: string) => void;
  removeSessionTabs: (entries: Array<{ path: string; id: string }>) => void;
  /** Bumped after a bulk delete so the sidebar leaves selection mode. */
  onSelectionReset: () => void;
}

/**
 * Session operations that span stores: rename, fork, compact, summary, move,
 * delete and workspace worktrees. Each one takes its target explicitly, so the
 * same function backs the header menu, the sidebar and the command palette.
 */
export function useSessionActions({ restorePrompt, removeSessionTabs, onSelectionReset }: Options) {
  const confirmRename = async (target: { workspace: string; session: SessionInfo }, title: string) => {
    closeDialog("rename");
    await useWorkspaceStore.getState().renameSession(target.workspace, target.session.id, title);
  };

  const forkSession = async (path: string, session: SessionInfo) => {
    try {
      const forked = await api.forkSession(path, session.id, 0, "");
      await useWorkspaceStore.getState().loadSessions(path);
      notify(t("notifyForked", { title: session.title || session.id }), "info");
      await useChatStore.getState().open(path, forked.id);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  /** Forks the history before one prompt and returns that prompt to the composer. */
  const forkMessage = async (path: string, sessionID: string, text: string) => {
    const state = await api.revertState(path, sessionID);
    const turn = [...state.turns].reverse().find((entry) => entry.text === text);
    const forked = await api.forkSession(path, sessionID, turn?.seq ?? 0, "");
    await useWorkspaceStore.getState().loadSessions(path);
    notify(t("notifyForkedSession"), "info");
    await useChatStore.getState().open(path, forked.id);
    restorePrompt(text);
  };

  const compactSession = async (target: { workspace: string; sessionID: string; title: string }) => {
    try {
      await api.compact(target.workspace, target.sessionID);
      await useChatStore.getState().refresh(target.workspace, target.sessionID);
      notify(t("notifyCompacted"), "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const openSummary = async (target: { workspace: string; sessionID: string; title: string }) => {
    openDialog({ id: "summary", props: { ...target, text: "", loading: true, error: "" } });
    const patch = useDialogStore.getState().patch;
    try {
      const text = await api.summarizeSession(target.workspace, target.sessionID);
      patch("summary", { text, loading: false });
    } catch (error) {
      patch("summary", { error: messageOf(error), loading: false });
    }
  };

  const confirmBulkMove = async (items: SessionSelection[], toPath: string) => {
    if (items.length === 0) return;
    closeDialog("bulk-move");
    const source = items[0].path;
    if (items.some((item) => item.path !== source)) {
      notify(t("notifyOneWorkspace"));
      return;
    }
    const workspace = useWorkspaceStore.getState();
    const chat = useChatStore.getState();
    let moved = 0;
    const failures: string[] = [];
    for (const item of items) {
      try {
        await api.moveSession(source, toPath, item.id);
        chat.discard(source, item.id);
        moved += 1;
      } catch (error) {
        failures.push(messageOf(error));
      }
    }
    await Promise.all([workspace.loadSessions(source), workspace.loadSessions(toPath)]);
    workspace.select(toPath);
    onSelectionReset();
    if (moved > 0) {
      notify(moved === 1 ? t("notifySessionMoved") : t("notifySessionsMoved", { count: moved }), "info");
    }
    for (const failure of failures) notify(failure);
  };

  const confirmDelete = async (target: { workspace: string; session: SessionInfo }) => {
    closeDialog("delete");
    if (await useWorkspaceStore.getState().deleteSession(target.workspace, target.session.id)) {
      useChatStore.getState().discard(target.workspace, target.session.id);
      removeSessionTabs([{ path: target.workspace, id: target.session.id }]);
    }
  };

  const confirmWorktree = async (path: string, name: string) => {
    closeDialog("worktree");
    try {
      const entry = await api.createWorktree(path, name);
      const info = await api.addWorkspaceAt(entry.path);
      await useWorkspaceStore.getState().refresh();
      useWorkspaceStore.getState().select(info.path);
      notify(t("notifyWorktreeCreated", { name: entry.branch ?? name }), "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const confirmMove = async (target: { path: string; session: SessionInfo }, toPath: string) => {
    closeDialog("move");
    const workspace = useWorkspaceStore.getState();
    const chat = useChatStore.getState();
    try {
      await api.moveSession(target.path, toPath, target.session.id);
      chat.discard(target.path, target.session.id);
      await Promise.all([workspace.loadSessions(target.path), workspace.loadSessions(toPath)]);
      workspace.select(toPath);
      await chat.open(toPath, target.session.id);
      notify(t("notifySessionMoved"), "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const addWorktreeWorkspace = async (path: string) => {
    try {
      const info = await api.addWorkspaceAt(path);
      await useWorkspaceStore.getState().refresh();
      useWorkspaceStore.getState().select(info.path);
      notify(t("notifyWorkspaceAddedNamed", { name: info.name }), "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const confirmRemoveWorkspace = async (path: string) => {
    closeDialog("remove-workspace");
    await useWorkspaceStore.getState().disconnect(path);
  };

  const confirmBulkDelete = async (items: SessionSelection[]) => {
    closeDialog("bulk-delete");
    const workspace = useWorkspaceStore.getState();
    const chat = useChatStore.getState();
    const byWorkspace = new Map<string, string[]>();
    for (const item of items) {
      const ids = byWorkspace.get(item.path) ?? [];
      ids.push(item.id);
      byWorkspace.set(item.path, ids);
    }
    const removed: Array<{ path: string; id: string }> = [];
    await Promise.all(
      [...byWorkspace].map(async ([path, ids]) => {
        const deleted = await workspace.deleteSessions(path, ids);
        for (const id of deleted) {
          chat.discard(path, id);
          removed.push({ path, id });
        }
      }),
    );
    removeSessionTabs(removed);
    onSelectionReset();
  };

  const settingsSaved = async (reused: string[]) => {
    await Promise.all([useWorkspaceStore.getState().refresh(), useCatalogStore.getState().reload()]);
    if (reused.length > 0) {
      notify(t("notifySettingsSaved", { names: reused.join(", ") }), "info");
    }
  };

  // The model picker manages the catalog in place, like the reference dialog;
  // a hidden settings page would keep a stale draft, so close it first.
  const openManageModels = (connect: boolean) => {
    const view = useViewStore.getState();
    if (view.settingsOpen) view.closeSettings();
    openDialog({ id: "manage-models", props: { connect } });
  };

  return {
    confirmRename,
    forkSession,
    forkMessage,
    compactSession,
    openSummary,
    confirmBulkMove,
    confirmDelete,
    confirmWorktree,
    confirmMove,
    addWorktreeWorkspace,
    confirmRemoveWorkspace,
    confirmBulkDelete,
    settingsSaved,
    openManageModels,
  };
}
