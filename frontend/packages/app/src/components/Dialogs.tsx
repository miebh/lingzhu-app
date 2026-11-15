import { useEffect, useState } from "react";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { t, useT } from "@lingzhu/ui/i18n";

interface RenameDialogProps {
  open: boolean;
  initial: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (title: string) => void;
}

export function RenameDialog({ open, initial, onOpenChange, onConfirm }: RenameDialogProps) {
  const tr = useT();
  const [title, setTitle] = useState(initial);

  useEffect(() => {
    if (open) setTitle(initial);
  }, [open, initial]);

  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onConfirm(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose>
        <form
          className="select-none"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle>{t("renameSession")}</DialogTitle>
          <DialogDescription>{t("renameHint")}</DialogDescription>
          <Input
            autoFocus
            size="lg"
            value={title}
            aria-label={tr("sessionTitleLabel")}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-4 select-text"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={title.trim() === ""}>
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="select-none">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}

/** Names a git worktree created from the current workspace. */
export function WorktreeDialog({ open, onOpenChange, onConfirm }: WorktreeDialogProps) {
  const tr = useT();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = () => {
    const next = name.trim();
    if (!next) return;
    onConfirm(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose>
        <form
          className="select-none"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle>{t("newWorktree")}</DialogTitle>
          <DialogDescription>{t("newWorktreeHint")}</DialogDescription>
          <Input
            autoFocus
            size="lg"
            value={name}
            aria-label={t("worktreeName")}
            placeholder={tr("dialogWorktreeExample")}
            onChange={(event) => setName(event.target.value)}
            className="mt-4 select-text"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={name.trim() === ""}>
              {t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


interface MoveSessionDialogProps {
  open: boolean;
  workspaces: WorkspaceInfo[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (path: string) => void;
}

/** Picks another workspace for a session transfer. */
export function MoveSessionDialog({ open, workspaces, onOpenChange, onConfirm }: MoveSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="select-none">
        <DialogTitle>{t("moveSession")}</DialogTitle>
        <DialogDescription>{t("moveHint")}</DialogDescription>
        <div className="mt-4 flex flex-col gap-1">
          {workspaces.length === 0 ? (
            <p className="px-2 py-4 text-meta text-text-faint">{t("addWorkspaceFirst")}</p>
          ) : (
            workspaces.map((workspace) => (
              <button
                key={workspace.path}
                type="button"
                onClick={() => onConfirm(workspace.path)}
                className="interactive flex h-control-md w-full flex-col items-start justify-center rounded-md px-2 text-left"
              >
                <span className="text-body text-text-base">{workspace.name}</span>
                <span className="w-full truncate text-caption text-text-faint">{workspace.path}</span>
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
