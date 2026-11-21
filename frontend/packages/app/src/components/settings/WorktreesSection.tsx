import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Check, ChevronDown, Ellipsis, GitBranch, RefreshCw, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { ConfirmDialog } from "../dialogs/Dialogs";
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
export function WorktreesSection(props: Props) {
  const tr = useT();
  const [scope, setScope] = createSignal<string>(props.workspace ?? "all");
  const [entries, setEntries] = createSignal<Entry[]>([]);
  const [counts, setCounts] = createSignal<Record<string, number>>({});
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [removeTarget, setRemoveTarget] = createSignal<Entry>();
  const [bulkOpen, setBulkOpen] = createSignal(false);
  const removable = createMemo(() => entries().filter((entry) => !entry.worktree.main));

  const load = async () => {
    const targets =
      scope() === "all" ? props.workspaces : props.workspaces.filter((item) => item.path === scope());
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

  createEffect(() => {
    scope();
    props.workspaces;
    void load();
  });

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
      for (const entry of removable()) {
        await api.removeWorktree(entry.project, entry.worktree.path, false);
      }
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const scopeLabel = () =>
    scope() === "all" ? "All projects" : props.workspaces.find((item) => item.path === scope())?.name || scope();

  return (
    <div class="flex flex-col gap-6">
      <div class="flex min-h-7 items-center justify-between gap-3">
        <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
          {t("worktreeCount", { count: entries().length })}
        </span>
        <div class="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              variant="ghost"
              size="sm"
              class="max-w-48 gap-1.5 text-text-muted hover:text-text-base"
              as={Button}
            >
              <span class="min-w-0 truncate">{scopeLabel()}</span>
              <ChevronDown class="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" class="w-52">
              <DropdownMenuItem onSelect={() => setScope("all")}>
                <Show when={scope() === "all"} fallback={<span class="size-3.5" />}>
                  <Check />
                </Show>
                {tr("dialogAllProjects")}
              </DropdownMenuItem>
              <For each={props.workspaces}>
                {(item) => (
                  <DropdownMenuItem onSelect={() => setScope(item.path)}>
                    <Show when={scope() === item.path} fallback={<span class="size-3.5" />}>
                      <Check />
                    </Show>
                    <span class="min-w-0 flex-1 truncate">{item.name || item.path}</span>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              variant="ghost"
              size="icon-xs"
              aria-label={t("worktreeActions")}
              class="text-text-faint hover:text-text-base"
              as={Button}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" class="w-48">
              <DropdownMenuItem disabled={loading()} onSelect={() => void load()}>
                <RefreshCw class={loading() ? "animate-spin" : undefined} />
                {t("refresh")}
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                disabled={removable().length === 0}
                onSelect={() => setBulkOpen(true)}
              >
                <Trash2 />
                {t("deleteAllWorktrees")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Show when={error()}>
        <p role="alert" class="text-meta leading-5 text-state-fg-danger">
          {error()}
        </p>
      </Show>

      <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
        <Show when={entries().length === 0}>
          <SettingsRow title={t("noWorktreesYet")} description={t("noWorktreesDesc")}>
            <span />
          </SettingsRow>
        </Show>
        <For each={entries()}>
          {(entry) => (
            <div class="flex min-h-14 flex-wrap items-center gap-3 border-b-[0.5px] border-border-base py-4 last:border-0">
              <GitBranch class="size-4 shrink-0 text-icon-muted" />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                  {entry.worktree.branch || entry.worktree.path}
                </span>
                <span class="min-w-0 truncate font-mono text-caption leading-4 text-text-faint">
                  {entry.worktree.path}
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-3 text-caption text-text-muted">
                <span class="font-mono">{formatBytes(entry.worktree.size ?? 0)}</span>
                <span>
                  {t("sessionCount", {
                    count: counts()[entry.worktree.path] ?? props.sessionCounts?.[entry.worktree.path] ?? 0,
                  })}
                </span>
                <span class="text-text-faint">{entry.projectName}</span>
                <Show
                  when={entry.worktree.main}
                  fallback={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("removeServer", { name: entry.worktree.branch || entry.worktree.path })}
                      onClick={() => setRemoveTarget(entry)}
                      class="text-text-faint hover:text-state-fg-danger"
                    >
                      <Trash2 />
                    </Button>
                  }
                >
                  <span>{tr("mainWorktree")}</span>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <ConfirmDialog
        open={bulkOpen()}
        title={t("deleteWorktreesTitle")}
        description={t("deleteWorktreesDesc", { count: removable().length })}
        confirmLabel={t("removeAll")}
        destructive
        onOpenChange={setBulkOpen}
        onConfirm={() => void removeAll()}
      />

      <ConfirmDialog
        open={!!removeTarget()}
        title={t("removeWorktreeTitle")}
        description={
          removeTarget()
            ? t("removeWorktreeDesc", {
                name: removeTarget()!.worktree.branch || removeTarget()!.worktree.path,
              })
            : ""
        }
        confirmLabel={t("removeAction")}
        destructive
        onOpenChange={(open) => !open && setRemoveTarget(undefined)}
        onConfirm={() => {
          const target = removeTarget();
          if (target) void remove(target);
        }}
      />
    </div>
  );
}
