import { useEffect, useState } from "react";
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
export function WorktreesDialog({ open, workspace, name, onOpenChange, onAddWorkspace, startup }: Props) {
  const tr = useT();
  const [list, setList] = useState<WorktreeList>();
  const [newName, setNewName] = useState("");
  const [force, setForce] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Worktree>();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setList(await api.worktrees(workspace));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const saveList = async () => {
    if (!list || list.worktrees.length === 0) return;
    setSaving(true);
    try {
      const repo = list.repo || workspace || "workspace";
      const path = await api.saveTextFile(
        worktreesExportName(repo, list.worktrees.length),
        serializeWorktrees({ workspace: workspace ?? "", repo: list.repo, worktrees: list.worktrees }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
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
    if (!workspace) return;
    const value = newName.trim();
    if (!value) {
      setError("Worktree name is required.");
      return;
    }
    setCreating(true);
    try {
      const created = await api.createWorktree(workspace, value);
      const command = startup?.trim();
      if (command) {
        try {
          await api.createShell(workspace, { command, cwd: created.path });
        } catch {
          // The worktree exists; a failed startup command is reported by the shell list.
        }
      }
      setList((current) =>
        current
          ? { ...current, worktrees: [...current.worktrees, created] }
          : { worktrees: [created], repo: "" },
      );
      setNewName("");
      setNotice(command ? `Created ${created.branch || created.path} and started startup command` : `Created ${created.branch || created.path}`);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    const target = removeTarget;
    if (!target || !workspace) return;
    setRemoveTarget(undefined);
    try {
      await api.removeWorktree(workspace, target.path, force);
      setList((current) =>
        current
          ? { ...current, worktrees: current.worktrees.filter((item) => item.path !== target.path) }
          : current,
      );
      setNotice(`Removed ${target.branch || target.path}`);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide" className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="size-4 text-text-faint" />
                Worktrees
              </DialogTitle>
              <DialogDescription className="truncate">
                {name || workspace}
                {list?.repo ? ` · ${list.repo}` : ""}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !list || list.worktrees.length === 0}
                onClick={() => void saveList()}
              >
                <Save />
                {saving ? "Saving…" : "Save file"}
              </Button>
              <RefreshButton loading={loading} onRefresh={() => void load()} />
            </div>
          </div>

          <ErrorBanner error={error} className="mt-3" />
          <NoticeBanner notice={notice} />

          <div className="mt-4 flex shrink-0 items-center gap-2">
            <Input
              value={newName}
              aria-label={tr("worktreesWorktreeName")}
              placeholder={tr("worktreesNewWorktreeName")}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void create();
                }
              }}
              className="select-text"
            />
            <Button type="button" size="sm" disabled={creating} onClick={() => void create()}>
              <Plus />
              Create
            </Button>
          </div>

          <label className="mt-2 flex shrink-0 items-center gap-2 text-meta text-text-muted">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            {tr("dialogForceRemoveWorktrees")}
          </label>

          <div className="mt-3 max-h-96 overflow-auto rounded-md border border-border-base">
            {!list || list.worktrees.length === 0 ? (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Loading…" : "No worktrees."}
              </p>
            ) : (
              list.worktrees.map((item) => (
                <div
                  key={item.path}
                  className="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-meta text-text-base">
                        {item.path}
                      </span>
                      {item.main && (
                        <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                          main
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-caption text-text-faint">
                      {item.branch || "detached"}
                      {item.head ? ` · ${item.head.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  {onAddWorkspace && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void onAddWorkspace(item.path)}
                    >
                      Add
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Remove worktree ${item.path}`}
                    disabled={item.main}
                    onClick={() => setRemoveTarget(item)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== undefined}
        title={tr("worktreesRemoveWorktree")}
        description={`Remove ${removeTarget?.branch || removeTarget?.path || ""}? ${
          force ? "Dirty changes are discarded." : "Uncommitted changes will block removal."
        }`}
        confirmLabel="Remove"
        destructive
        onOpenChange={(next) => {
          if (!next) setRemoveTarget(undefined);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}
