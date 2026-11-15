import { BatchExportDialog } from "../../components/BatchExportDialog";
import { ConfirmDialog, MoveSessionDialog, RenameDialog, WorktreeDialog } from "../../components/Dialogs";
import { ManageModelsDialog } from "../../components/ManageModelsDialog";
import { TransferDialog } from "../../components/TransferDialog";
import { useChatStore } from "../../store/chat";
import { dismissDialog as dismiss, useDialogEntry } from "../../store/dialogs";
import { useWorkspaceStore } from "../../store/workspaces";
import { useShell } from "../ShellProvider";
import { useAnyChatRunning } from "../hooks";
import { useT } from "@lingzhu/ui/i18n";

/** Confirmation dialogs, model management and session transfer. */
export function ConfirmDialogs() {
  const tr = useT();
  const shell = useShell();
  const rename = useDialogEntry("rename");
  const remove = useDialogEntry("delete");
  const bulkDelete = useDialogEntry("bulk-delete");
  const move = useDialogEntry("move");
  const bulkMove = useDialogEntry("bulk-move");
  const bulkExport = useDialogEntry("bulk-export");
  const worktree = useDialogEntry("worktree");
  const manageModels = useDialogEntry("manage-models");
  const removeWorkspace = useDialogEntry("remove-workspace");
  const transfer = useDialogEntry("transfer");
  const compact = useDialogEntry("compact");
  const actions = shell.sessionActions;
  const running = useAnyChatRunning();
  const workspaces = shell.workspaceList;

  const nameOf = (path?: string) =>
    workspaces.find((workspace) => workspace.path === path)?.name ?? path ?? "";

  return (
    <>
      {manageModels && (
        <ManageModelsDialog
          open
          busy={running}
          initialConnect={manageModels.props.connect}
          onOpenChange={dismiss("manage-models")}
          onSaved={(reused) => actions.settingsSaved(reused)}
        />
      )}

      <RenameDialog
        open={rename !== undefined}
        initial={rename?.props.session.title ?? ""}
        onOpenChange={dismiss("rename")}
        onConfirm={(title) => {
          if (rename) void actions.confirmRename(rename.props, title);
        }}
      />

      <ConfirmDialog
        open={remove !== undefined}
        title={tr("confirmDialogsDeleteSession")}
        description={`Delete "${remove?.props.session.title || remove?.props.session.id || "this session"}"? Its log is removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={dismiss("delete")}
        onConfirm={() => {
          if (remove) void actions.confirmDelete(remove.props);
        }}
      />

      <ConfirmDialog
        open={bulkDelete !== undefined}
        title={tr("confirmDialogsDeleteSessions")}
        description={`Delete ${bulkDelete?.props.items.length ?? 0} session${
          bulkDelete?.props.items.length === 1 ? "" : "s"
        }? ${bulkDelete?.props.items.length === 1 ? "Its log is" : "Their logs are"} removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={dismiss("bulk-delete")}
        onConfirm={() => {
          if (bulkDelete) void actions.confirmBulkDelete(bulkDelete.props.items);
        }}
      />

      <MoveSessionDialog
        open={move !== undefined}
        workspaces={workspaces.filter((workspace) => workspace.path !== move?.props.path)}
        onOpenChange={dismiss("move")}
        onConfirm={(toPath) => {
          if (move) void actions.confirmMove(move.props, toPath);
        }}
      />

      <MoveSessionDialog
        open={bulkMove !== undefined}
        workspaces={workspaces.filter((workspace) => workspace.path !== bulkMove?.props.items[0]?.path)}
        onOpenChange={dismiss("bulk-move")}
        onConfirm={(toPath) => {
          if (bulkMove) void actions.confirmBulkMove(bulkMove.props.items, toPath);
        }}
      />

      <BatchExportDialog
        open={bulkExport !== undefined}
        items={bulkExport?.props.items ?? []}
        onOpenChange={dismiss("bulk-export")}
      />

      <WorktreeDialog
        open={worktree !== undefined}
        onOpenChange={dismiss("worktree")}
        onConfirm={(value) => {
          if (worktree) void actions.confirmWorktree(worktree.props.path, value);
        }}
      />

      <TransferDialog
        open={transfer !== undefined}
        workspace={transfer?.props.workspace}
        sessionID={transfer?.props.sessionID}
        title={transfer?.props.title}
        onOpenChange={dismiss("transfer")}
        onImported={(session) => {
          if (!transfer) return;
          void useWorkspaceStore.getState().loadSessions(transfer.props.workspace);
          void useChatStore.getState().open(transfer.props.workspace, session.id);
        }}
      />

      <ConfirmDialog
        open={compact !== undefined}
        title={tr("confirmDialogsCompactConversation")}
        description={`Summarize "${compact?.props.title ?? ""}" to free context? Older messages are replaced by a summary and the action cannot be undone.`}
        confirmLabel="Compact"
        onOpenChange={dismiss("compact")}
        onConfirm={() => {
          if (compact) void actions.confirmCompact(compact.props);
        }}
      />

      <ConfirmDialog
        open={removeWorkspace !== undefined}
        title={tr("confirmDialogsRemoveWorkspace")}
        description={`Remove "${removeWorkspace ? nameOf(removeWorkspace.props.path) : ""}" from the sidebar? Session data stays on disk.`}
        confirmLabel="Remove"
        destructive
        onOpenChange={dismiss("remove-workspace")}
        onConfirm={() => {
          if (removeWorkspace) void actions.confirmRemoveWorkspace(removeWorkspace.props.path);
        }}
      />
    </>
  );
}
