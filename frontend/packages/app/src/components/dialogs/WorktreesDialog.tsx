import { For, Show, createEffect, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { GitBranch, Plus, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { ConfirmDialog } from "./Dialogs";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { serializeWorktrees, worktreesExportName } from "../../lib/worktreesExport";
import type { Worktree, WorktreeList } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onAddWorkspace?: (path: string) => void | Promise<void>;
  /** Command run inside a newly created worktree. */
  startup?: string;
}

/** Lists, creates and removes git worktrees of one workspace. */
export function WorktreesDialog(props: Props) {
  const tr = useT();
  const [list, setList] = createSignal<WorktreeList>();
  const [newName, setNewName] = createSignal("");
  const [force, setForce] = createSignal(false);
  const [removeTarget, setRemoveTarget] = createSignal<Worktree>();
  const [loading, setLoading] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setList(await api.worktrees(props.workspace));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void load();
    } else {
      setList(undefined);
      setNewName("");
      setForce(false);
      setRemoveTarget(undefined);
      setError("");
      setNotice("");
      setSaving(false);
    }
  });

  const saveList = async () => {
    const current = list();
    if (!current || current.worktrees.length === 0) return;
    setSaving(true);
    try {
      const repo = current.repo || props.workspace || "workspace";
      const path = await api.saveTextFile(
        worktreesExportName(repo, current.worktrees.length),
        serializeWorktrees({ workspace: props.workspace ?? "", repo: current.repo, worktrees: current.worktrees }),
      );
      if (path) {
        setNotice(tr("savedPath", { path }));
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    const value = newName().trim();
    if (!value) {
      setError(tr("worktreeNameRequired"));
      return;
    }
    setCreating(true);
    try {
      const created = await api.createWorktree(workspace, value);
      const command = props.startup?.trim();
      if (command) {
        try {
          await api.createShell(workspace, { command, cwd: created.path });
        } catch {
          // The worktree exists; a failed startup command is reported by the shell list.
        }
      }
      update(setList, list, (current) =>
        current
          ? { ...current, worktrees: [...current.worktrees, created] }
          : { worktrees: [created], repo: "" },
      );
      setNewName("");
      setNotice(
        command
          ? tr("worktreeCreatedWithStartup", { name: created.branch || created.path })
          : tr("worktreeCreated", { name: created.branch || created.path }),
      );
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    const target = removeTarget();
    const workspace = props.workspace;
    if (!target || !workspace) return;
    setRemoveTarget(undefined);
    try {
      await api.removeWorktree(workspace, target.path, force());
      update(setList, list, (current) =>
        current
          ? { ...current, worktrees: current.worktrees.filter((item) => item.path !== target.path) }
          : current,
      );
      setNotice(tr("worktreeRemoved", { name: target.branch || target.path }));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent size="wide" class="flex flex-col">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <DialogTitle class="flex items-center gap-2">
                <GitBranch class="size-4 text-text-faint" />
                {tr("worktrees")}
              </DialogTitle>
              <DialogDescription class="truncate">
                {props.name || props.workspace}
                {list()?.repo ? ` · ${list()!.repo}` : ""}
              </DialogDescription>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving() || !list() || list()!.worktrees.length === 0}
                onClick={() => void saveList()}
              >
                <Save />
                {saving() ? tr("saving") : tr("dialogSaveFile")}
              </Button>
              <RefreshButton loading={loading()} onRefresh={() => void load()} />
            </div>
          </div>

          <ErrorBanner error={error()} class="mt-3" />
          <NoticeBanner notice={notice()} />

          <div class="mt-4 flex shrink-0 items-center gap-2">
            <Input
              value={newName()}
              aria-label={tr("worktreesWorktreeName")}
              placeholder={tr("worktreesNewWorktreeName")}
              onInput={(event) => setNewName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void create();
                }
              }}
              class="select-text"
            />
            <Button type="button" size="sm" disabled={creating()} onClick={() => void create()}>
              <Plus />
              {tr("create")}
            </Button>
          </div>

          <label class="mt-2 flex shrink-0 items-center gap-2 text-meta text-text-muted">
            <input type="checkbox" checked={force()} onChange={(event) => setForce(event.currentTarget.checked)} />
            {tr("dialogForceRemoveWorktrees")}
          </label>

          <div class="mt-3 max-h-96 overflow-auto rounded-md border border-border-base">
            <Show
              when={list() && list()!.worktrees.length > 0}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? tr("loading") : tr("worktreesNone")}
                </p>
              }
            >
              <For each={list()?.worktrees ?? []}>
                {(item) => (
                  <div class="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="truncate font-mono text-meta text-text-base">
                          {item.path}
                        </span>
                        <Show when={item.main}>
                          <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                            {tr("mainWorktree")}
                          </span>
                        </Show>
                      </div>
                      <p class="mt-0.5 text-caption text-text-faint">
                        {item.branch || tr("detached")}
                        {item.head ? ` · ${item.head.slice(0, 8)}` : ""}
                      </p>
                    </div>
                    <Show when={props.onAddWorkspace}>
                      {(addWorkspace) => (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void addWorkspace()(item.path)}
                        >
                          {tr("add")}
                        </Button>
                      )}
                    </Show>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={tr("worktreesRemoveNamed", { name: item.branch || item.path })}
                      disabled={item.main}
                      onClick={() => setRemoveTarget(item)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget() !== undefined}
        title={tr("worktreesRemoveWorktree")}
        description={`${tr("removeWorktreeDesc", {
          name: removeTarget()?.branch || removeTarget()?.path || "",
        })} ${
          force() ? tr("worktreeDeleteDirty") : tr("worktreeUncommittedBlock")
        }`}
        confirmLabel={tr("removeAction")}
        destructive
        onOpenChange={(next) => {
          if (!next) setRemoveTarget(undefined);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}
