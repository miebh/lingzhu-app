import { Show } from "solid-js";
import { BatchExportDialog } from "../../components/dialogs/BatchExportDialog";
import { ConfirmDialog, MoveSessionDialog, RenameDialog, WorktreeDialog } from "../../components/dialogs/Dialogs";
import { ManageModelsDialog } from "../../components/dialogs/ManageModelsDialog";
import { TransferDialog } from "../../components/dialogs/TransferDialog";
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
  const actions = shell.sessionActions;
  const running = useAnyChatRunning();

  const nameOf = (path?: string) =>
    shell.workspaceList.find((workspace) => workspace.path === path)?.name ?? path ?? "";

  return (
    <>
      <Show when={manageModels()}>
        {(entry) => (
          <ManageModelsDialog
            open
            busy={running()}
            initialConnect={entry().props.connect}
            onOpenChange={dismiss("manage-models")}
            onSaved={(reused) => actions.settingsSaved(reused)}
          />
        )}
      </Show>

      <RenameDialog
        open={rename() !== undefined}
        initial={rename()?.props.session.title ?? ""}
        onOpenChange={dismiss("rename")}
        onConfirm={(title) => {
          const entry = rename();
          if (entry) void actions.confirmRename(entry.props, title);
        }}
      />

      <ConfirmDialog
        open={remove() !== undefined}
        title={tr("confirmDialogsDeleteSession")}
        description={`Delete "${remove()?.props.session.title || remove()?.props.session.id || "this session"}"? Its log is removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={dismiss("delete")}
        onConfirm={() => {
          const entry = remove();
          if (entry) void actions.confirmDelete(entry.props);
        }}
      />

      <ConfirmDialog
        open={bulkDelete() !== undefined}
        title={tr("confirmDialogsDeleteSessions")}
        description={`Delete ${bulkDelete()?.props.items.length ?? 0} session${
          bulkDelete()?.props.items.length === 1 ? "" : "s"
        }? ${bulkDelete()?.props.items.length === 1 ? "Its log is" : "Their logs are"} removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={dismiss("bulk-delete")}
        onConfirm={() => {
          const entry = bulkDelete();
          if (entry) void actions.confirmBulkDelete(entry.props.items);
        }}
      />

      <MoveSessionDialog
        open={move() !== undefined}
        workspaces={shell.workspaceList.filter((workspace) => workspace.path !== move()?.props.path)}
        onOpenChange={dismiss("move")}
        onConfirm={(toPath) => {
          const entry = move();
          if (entry) void actions.confirmMove(entry.props, toPath);
        }}
      />

      <MoveSessionDialog
        open={bulkMove() !== undefined}
        workspaces={shell.workspaceList.filter((workspace) => workspace.path !== bulkMove()?.props.items[0]?.path)}
        onOpenChange={dismiss("bulk-move")}
        onConfirm={(toPath) => {
          const entry = bulkMove();
          if (entry) void actions.confirmBulkMove(entry.props.items, toPath);
        }}
      />

      <BatchExportDialog
        open={bulkExport() !== undefined}
        items={bulkExport()?.props.items ?? []}
        onOpenChange={dismiss("bulk-export")}
      />

      <WorktreeDialog
        open={worktree() !== undefined}
        onOpenChange={dismiss("worktree")}
        onConfirm={(value) => {
          const entry = worktree();
          if (entry) void actions.confirmWorktree(entry.props.path, value);
        }}
      />

      <TransferDialog
        open={transfer() !== undefined}
        workspace={transfer()?.props.workspace}
        sessionID={transfer()?.props.sessionID}
        title={transfer()?.props.title}
        onOpenChange={dismiss("transfer")}
        onImported={(session) => {
          const entry = transfer();
          if (!entry) return;
          void useWorkspaceStore.getState().loadSessions(entry.props.workspace);
          void useChatStore.getState().open(entry.props.workspace, session.id);
        }}
      />

      <ConfirmDialog
        open={removeWorkspace() !== undefined}
        title={tr("confirmDialogsRemoveWorkspace")}
        description={`Remove "${removeWorkspace() ? nameOf(removeWorkspace()!.props.path) : ""}" from the sidebar? Session data stays on disk.`}
        confirmLabel="Remove"
        destructive
        onOpenChange={dismiss("remove-workspace")}
        onConfirm={() => {
          const entry = removeWorkspace();
          if (entry) void actions.confirmRemoveWorkspace(entry.props.path);
        }}
      />
    </>
  );
}
