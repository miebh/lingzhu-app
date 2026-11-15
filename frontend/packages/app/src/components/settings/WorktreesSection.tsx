import { useEffect, useState } from "react";
import { Check, ChevronDown, Ellipsis, GitBranch, RefreshCw, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { ConfirmDialog } from "../Dialogs";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { t, useT } from "@lingzhu/ui/i18n";
import { formatBytes } from "@lingzhu/ui/format";
import type { WorkspaceInfo, Worktree } from "@lingzhu/ui/types";
import { SettingsRow } from "./primitives";

interface Entry {
  worktree: Worktree;
  project: string;
  projectName: string;
}

interface Props {
  workspace?: string;
  workspaces: WorkspaceInfo[];
  sessionCounts?: Record<string, number>;
}

/** Git worktrees across every project, with a project filter and a row menu. */
export function WorktreesSection({ workspace, workspaces, sessionCounts }: Props) {
  const tr = useT();
  const [scope, setScope] = useState<string>(workspace ?? "all");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Entry>();
  const [bulkOpen, setBulkOpen] = useState(false);
  const removable = entries.filter((entry) => !entry.worktree.main);

  const load = async () => {
    const targets = scope === "all" ? workspaces : workspaces.filter((item) => item.path === scope);
    if (targets.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        targets.map(async (target) => {
          const list = await api.worktrees(target.path);
          return (list.worktrees ?? []).map((worktree) => ({
            worktree,
            project: target.path,
            projectName: target.name || target.path,
          }));
        }),
      );
      const flat = results.flat();
      setEntries(flat);
      try {
        setCounts(await api.worktreeSessions(flat.map((entry) => entry.worktree.path)));
      } catch {
        setCounts({});
      }
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, workspaces]);

  const remove = async (target: Entry) => {
    setRemoveTarget(undefined);
    try {
      await api.removeWorktree(target.project, target.worktree.path, false);
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const removeAll = async () => {
    setBulkOpen(false);
    try {
      for (const entry of removable) {
        await api.removeWorktree(entry.project, entry.worktree.path, false);
      }
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const scopeLabel =
    scope === "all" ? "All projects" : workspaces.find((item) => item.path === scope)?.name || scope;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
          {t("worktreeCount", { count: entries.length })}
        </span>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="max-w-48 gap-1.5 text-text-muted hover:text-text-base">
                <span className="min-w-0 truncate">{scopeLabel}</span>
                <ChevronDown className="size-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setScope("all")}>
                {scope === "all" ? <Check /> : <span className="size-3.5" />}
                {tr("dialogAllProjects")}
              </DropdownMenuItem>
              {workspaces.map((item) => (
                <DropdownMenuItem key={item.path} onSelect={() => setScope(item.path)}>
                  {scope === item.path ? <Check /> : <span className="size-3.5" />}
                  <span className="min-w-0 flex-1 truncate">{item.name || item.path}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("worktreeActions")} className="text-text-faint hover:text-text-base">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-48">
              <DropdownMenuItem disabled={loading} onSelect={() => void load()}>
                <RefreshCw className={loading ? "animate-spin" : undefined} />
                {t("refresh")}
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                disabled={removable.length === 0}
                onSelect={() => setBulkOpen(true)}
              >
                <Trash2 />
                {t("deleteAllWorktrees")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-meta leading-5 text-state-fg-danger">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
        {entries.length === 0 && (
          <SettingsRow title={t("noWorktreesYet")} description={t("noWorktreesDesc")}>
            <span />
          </SettingsRow>
        )}
        {entries.map((entry) => (
          <div
            key={`${entry.project}\u0000${entry.worktree.path}`}
            className="flex min-h-14 flex-wrap items-center gap-3 border-b-[0.5px] border-border-base py-4 last:border-0"
          >
            <GitBranch className="size-4 shrink-0 text-icon-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                {entry.worktree.branch || entry.worktree.path}
              </span>
              <span className="min-w-0 truncate font-mono text-caption leading-4 text-text-faint">
                {entry.worktree.path}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-caption text-text-muted">
              <span className="font-mono">{formatBytes(entry.worktree.size ?? 0)}</span>
              <span>{t("sessionCount", { count: counts[entry.worktree.path] ?? sessionCounts?.[entry.worktree.path] ?? 0 })}</span>
              <span className="text-text-faint">{entry.projectName}</span>
              {entry.worktree.main ? (
                <span>{tr("mainWorktree")}</span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("removeServer", { name: entry.worktree.branch || entry.worktree.path })}
                  onClick={() => setRemoveTarget(entry)}
                  className="text-text-faint hover:text-state-fg-danger"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={bulkOpen}
        title={t("deleteWorktreesTitle")}
        description={t("deleteWorktreesDesc", { count: removable.length })}
        confirmLabel={t("removeAll")}
        destructive
        onOpenChange={setBulkOpen}
        onConfirm={() => void removeAll()}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title={t("removeWorktreeTitle")}
        description={removeTarget ? t("removeWorktreeDesc", { name: removeTarget.worktree.branch || removeTarget.worktree.path }) : ""}
        confirmLabel={t("removeAction")}
        destructive
        onOpenChange={(open) => !open && setRemoveTarget(undefined)}
        onConfirm={() => removeTarget && void remove(removeTarget)}
      />
    </div>
  );
}
