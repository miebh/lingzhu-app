import { For, Show, createEffect, createSignal } from "solid-js";
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

export function RenameDialog(props: RenameDialogProps) {
  const tr = useT();
  const [title, setTitle] = createSignal(props.initial);

  createEffect(() => {
    if (props.open) setTitle(props.initial);
  });

  const submit = () => {
    const next = title().trim();
    if (!next) return;
    props.onConfirm(next);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent hideClose>
        <form
          class="select-none"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle>{t("renameSession")}</DialogTitle>
          <DialogDescription>{t("renameHint")}</DialogDescription>
          <Input
            autofocus
            size="lg"
            value={title()}
            aria-label={tr("sessionTitleLabel")}
            onInput={(event) => setTitle(event.currentTarget.value)}
            class="mt-4 select-text"
          />
          <div class="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={title().trim() === ""}>
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

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent hideClose class="select-none">
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant={props.destructive ? "destructive" : "default"} onClick={props.onConfirm}>
            {props.confirmLabel}
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
export function WorktreeDialog(props: WorktreeDialogProps) {
  const tr = useT();
  const [name, setName] = createSignal("");

  createEffect(() => {
    if (props.open) setName("");
  });

  const submit = () => {
    const next = name().trim();
    if (!next) return;
    props.onConfirm(next);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent hideClose>
        <form
          class="select-none"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle>{t("newWorktree")}</DialogTitle>
          <DialogDescription>{t("newWorktreeHint")}</DialogDescription>
          <Input
            autofocus
            size="lg"
            value={name()}
            aria-label={t("worktreeName")}
            placeholder={tr("dialogWorktreeExample")}
            onInput={(event) => setName(event.currentTarget.value)}
            class="mt-4 select-text"
          />
          <div class="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={name().trim() === ""}>
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
export function MoveSessionDialog(props: MoveSessionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent hideClose class="select-none">
        <DialogTitle>{t("moveSession")}</DialogTitle>
        <DialogDescription>{t("moveHint")}</DialogDescription>
        <div class="mt-4 flex flex-col gap-1">
          <Show
            when={props.workspaces.length > 0}
            fallback={<p class="px-2 py-4 text-meta text-text-faint">{t("addWorkspaceFirst")}</p>}
          >
            <For each={props.workspaces}>
              {(workspace) => (
                <button
                  type="button"
                  onClick={() => props.onConfirm(workspace.path)}
                  class="interactive flex h-control-md w-full flex-col items-start justify-center rounded-md px-2 text-left"
                >
                  <span class="text-body text-text-base">{workspace.name}</span>
                  <span class="w-full truncate text-caption text-text-faint">{workspace.path}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
        <div class="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
