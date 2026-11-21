import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Check, ChevronDown, Ellipsis, GitBranch, RefreshCw, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { ConfirmDialog } from "../dialogs/Dialogs";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { relativeTime } from "../../lib/history";
import { notify } from "../../store/notify";
import { t, useT } from "@lingzhu/ui/i18n";
import { formatBytes } from "@lingzhu/ui/format";
import type {
  WorkspaceInfo,
  Worktree,
  WorktreeInspection,
  WorktreeSession,
} from "@lingzhu/ui/types";

interface Entry {
  worktree: Worktree;
  /** Main checkout of the repository that owns this worktree. */
  project: string;
  projectName: string;
}

interface ProjectOption {
  id: string;
  label: string;
}

interface Props {
  workspace?: string;
  workspaces: WorkspaceInfo[];
  sessionCounts?: Record<string, number>;
  /** Settings keeps every page mounted, so work starts only when this one shows. */
  active?: boolean;
}

const windowsPaths =
  typeof navigator !== "undefined" &&
  (/Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent));

/** Compares paths the way the host does: case-insensitive on Windows. */
function pathKey(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return windowsPaths ? normalized.toLowerCase() : normalized;
}

function baseName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value;
}

function splitPath(value: string) {
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (index < 0) return ["", value];
  return [value.slice(0, index + 1), value.slice(index + 1)];
}

/** A plain folder is not an error worth showing; other projects still load. */
function isNotRepository(message: string) {
  return /git repository/i.test(message);
}

function compareEntries(left: Entry, right: Entry) {
  return (
    left.projectName.localeCompare(right.projectName) ||
    (left.worktree.branch || left.worktree.path).localeCompare(
      right.worktree.branch || right.worktree.path,
    )
  );
}

/**
 * Git worktrees created by the app, grouped by repository. Each repository is
 * listed once even when several of its worktrees are registered as workspaces,
 * and one unreadable project never hides the rest.
 */
export function WorktreesSection(props: Props) {
  const tr = useT();
  const [scope, setScope] = createSignal<string>(props.workspace ?? "all");
  const [entries, setEntries] = createSignal<Entry[]>([]);
  const [repoByWorkspace, setRepoByWorkspace] = createSignal<Record<string, string>>({});
  const [sessions, setSessions] = createSignal<Record<string, WorktreeSession[]>>({});
  const [sessionsReady, setSessionsReady] = createSignal(false);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [deleting, setDeleting] = createSignal<Record<string, boolean>>({});
  const [removeTarget, setRemoveTarget] = createSignal<Entry>();
  const [inspection, setInspection] = createSignal<WorktreeInspection>();
  const [checking, setChecking] = createSignal(false);
  const [bulkScope, setBulkScope] = createSignal<"all" | "unused">();
  let request = 0;
  let inspectRequest = 0;

  const setDeletingPath = (path: string, value: boolean) => {
    setDeleting((current) => ({ ...current, [path]: value }));
  };

  const load = async () => {
    const id = ++request;
    setLoading(true);
    setError("");
    setSessionsReady(false);

    const workspaces = props.workspaces;
    const entryByPath = new Map<string, Entry>();
    const covered = new Map<string, string>();
    const workspaceRepos: Record<string, string> = {};
    const failures: string[] = [];

    for (const target of workspaces) {
      if (target.starting) continue;
      const targetKey = pathKey(target.path);
      const knownRepo = covered.get(targetKey);
      if (knownRepo) {
        workspaceRepos[target.path] = knownRepo;
        continue;
      }

      try {
        const list = await api.worktrees(target.path);
        if (id !== request) return;

        const repo = list.repo?.trim() || target.path;
        workspaceRepos[target.path] = repo;
        const projectName =
          workspaces.find((workspace) => pathKey(workspace.path) === pathKey(repo))?.name ||
          baseName(repo);

        for (const worktree of list.worktrees ?? []) {
          const key = pathKey(worktree.path);
          covered.set(key, repo);
          if (worktree.main || !worktree.managed || entryByPath.has(key)) continue;
          entryByPath.set(key, { worktree, project: repo, projectName });
        }
      } catch (cause) {
        if (id !== request) return;
        const reason = messageOf(cause);
        if (!isNotRepository(reason)) failures.push(reason);
      }
    }

    const next = [...entryByPath.values()].sort(compareEntries);
    setEntries(next);
    setRepoByWorkspace(workspaceRepos);
    setError(failures[0] ?? "");

    if (next.length === 0) {
      setSessionsReady(true);
      setLoaded(true);
      setLoading(false);
      return;
    }

    try {
      const details = await api.worktreeSessionDetails(next.map((entry) => entry.worktree.path));
      if (id !== request) return;
      setSessions(details);
      setSessionsReady(true);
    } catch {
      if (id !== request) return;
      setSessions({});
      setSessionsReady(false);
    } finally {
      if (id === request) {
        setLoaded(true);
        setLoading(false);
      }
    }
  };

  createEffect(() => {
    if (props.active === false) {
      request += 1;
      setLoading(false);
      return;
    }
    props.workspaces;
    void load();
  });

  createEffect(() => {
    if (props.active === false) return;
    let timer = 0;
    const stop = api.onWorktreesChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (Object.values(deleting()).some(Boolean)) return;
        void load();
      }, 150);
    });
    onCleanup(() => {
      window.clearTimeout(timer);
      stop();
    });
  });

  onCleanup(() => {
    request += 1;
    inspectRequest += 1;
  });

  const projectOptions = createMemo<ProjectOption[]>(() => {
    const seen = new Map<string, ProjectOption>();
    for (const entry of entries()) {
      const key = pathKey(entry.project);
      if (!seen.has(key)) seen.set(key, { id: entry.project, label: entry.projectName });
    }
    return [
      { id: "all", label: tr("dialogAllProjects") },
      ...[...seen.values()].sort((left, right) => left.label.localeCompare(right.label)),
    ];
  });

  const selectedProject = createMemo(() => {
    const current = scope();
    if (current === "all") return "all";
    const repo = repoByWorkspace()[current] ?? current;
    const key = pathKey(repo);
    return projectOptions().find((option) => pathKey(option.id) === key)?.id ?? "all";
  });

  const selectedLabel = () =>
    projectOptions().find((option) => option.id === selectedProject())?.label ??
    tr("dialogAllProjects");

  const filtered = createMemo(() => {
    const selected = selectedProject();
    if (selected === "all") return entries();
    const key = pathKey(selected);
    return entries().filter((entry) => pathKey(entry.project) === key);
  });

  const linked = (entry: Entry) => sessions()[entry.worktree.path] ?? [];
  const countFor = (entry: Entry) =>
    sessionsReady() ? linked(entry).length : (props.sessionCounts?.[entry.worktree.path] ?? 0);
  const lastActive = (entry: Entry) => linked(entry)[0]?.updated;
  const unused = createMemo(() =>
    sessionsReady()
      ? filtered().filter((entry) => countFor(entry) === 0 && !deleting()[entry.worktree.path])
      : [],
  );
  const bulkTargets = () => (bulkScope() === "unused" ? unused() : filtered());

  const openRemove = (entry: Entry) => {
    setRemoveTarget(entry);
    void check(entry);
  };

  const check = async (entry: Entry) => {
    const id = ++inspectRequest;
    setChecking(true);
    setInspection(undefined);
    try {
      const next = await api.worktreeInspect(entry.worktree.path, props.workspace ?? "");
      if (id !== inspectRequest || removeTarget() !== entry) return;
      setInspection(next);
    } catch (cause) {
      if (id !== inspectRequest || removeTarget() !== entry) return;
      setInspection({
        active: false,
        dirty: false,
        known: false,
        error: messageOf(cause),
        sessions: [],
      });
    } finally {
      if (id === inspectRequest) setChecking(false);
    }
  };

  const closeRemove = () => {
    inspectRequest += 1;
    setRemoveTarget(undefined);
    setInspection(undefined);
    setChecking(false);
  };

  const remove = async (target: Entry) => {
    if (!canRemove()) return;
    inspectRequest += 1;
    setRemoveTarget(undefined);
    setInspection(undefined);
    setChecking(false);
    setDeletingPath(target.worktree.path, true);
    try {
      await api.removeWorktree(target.project, target.worktree.path, true);
      setEntries((current) => current.filter((entry) => entry.worktree.path !== target.worktree.path));
      notify(
        t("worktreeRemoved", { name: target.worktree.branch || target.worktree.path }),
        "success",
      );
      void load();
    } catch (cause) {
      notify(messageOf(cause));
    } finally {
      setDeletingPath(target.worktree.path, false);
    }
  };

  const removeMany = async (targets: Entry[]) => {
    setBulkScope(undefined);
    if (targets.length === 0) return;

    let removed = 0;
    let skipped = 0;
    let failed = 0;
    for (const entry of targets) {
      setDeletingPath(entry.worktree.path, true);
      try {
        const next = await api.worktreeInspect(entry.worktree.path, props.workspace ?? "");
        if (!next.known) {
          failed += 1;
          continue;
        }
        if (next.active || next.sessions.length > 0 || next.dirty) {
          skipped += 1;
          continue;
        }
        await api.removeWorktree(entry.project, entry.worktree.path, false);
        removed += 1;
        setEntries((current) =>
          current.filter((item) => item.worktree.path !== entry.worktree.path),
        );
      } catch {
        failed += 1;
      } finally {
        setDeletingPath(entry.worktree.path, false);
      }
    }

    await load();
    const parts: string[] = [];
    if (removed) parts.push(t("worktreesRemovedCount", { count: removed }));
    if (skipped) parts.push(t("worktreesSkippedCount", { count: skipped }));
    if (failed) parts.push(t("worktreesFailedCount", { count: failed }));
    if (parts.length) notify(parts.join(" "), failed ? "error" : removed ? "success" : "info");
  };

  const inspectionWarnings = () => {
    const value = inspection();
    if (!value?.known) return [];
    const messages: string[] = [];
    if (value.active) messages.push(t("worktreeDeleteActive"));
    if (value.sessions.length > 0) messages.push(t("worktreeDeleteLinked"));
    if (value.dirty) messages.push(t("worktreeDeleteDirty"));
    return messages;
  };

  const removeDescription = () => {
    const target = removeTarget();
    if (!target) return "";
    const base = t("removeWorktreeDesc", {
      name: target.worktree.branch || target.worktree.path,
    });
    return [base, ...inspectionWarnings()].join(" ");
  };

  const canRemove = () =>
    !checking() && inspection()?.known === true && inspection()?.active !== true;

  return (
    <div class="flex flex-col gap-6">
      <Show when={filtered().length > 0}>
        <div class="flex min-h-7 items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
              {t(filtered().length === 1 ? "worktreeCountOne" : "worktreeCount", {
                count: filtered().length,
              })}
            </span>
            <Show when={loading() && loaded()}>
              <RefreshCw class="size-3.5 animate-spin text-text-faint" />
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <Show when={projectOptions().length > 2}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  variant="ghost"
                  size="sm"
                  class="max-w-48 gap-1.5 text-text-muted hover:text-text-base"
                  as={Button}
                >
                  <span class="min-w-0 truncate">{selectedLabel()}</span>
                  <ChevronDown class="size-3.5 shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end" class="w-52">
                  <For each={projectOptions()}>
                    {(option) => (
                      <DropdownMenuItem onSelect={() => setScope(option.id)}>
                        <Show
                          when={option.id === selectedProject()}
                          fallback={<span class="size-3.5" />}
                        >
                          <Check />
                        </Show>
                        <span class="min-w-0 flex-1 truncate">{option.label}</span>
                      </DropdownMenuItem>
                    )}
                  </For>
                </DropdownMenuContent>
              </DropdownMenu>
            </Show>
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
              <DropdownMenuContent side="bottom" align="end" class="w-56">
                <DropdownMenuItem disabled={loading()} onSelect={() => void load()}>
                  <RefreshCw class={loading() ? "animate-spin" : undefined} />
                  {t("refresh")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <Show when={sessionsReady() && unused().length > 0}>
                  <DropdownMenuItem onSelect={() => setBulkScope("unused")}>
                    <Trash2 />
                    {t("deleteUnusedWorktrees")}
                  </DropdownMenuItem>
                </Show>
                <DropdownMenuItem
                  destructive
                  disabled={loading() || filtered().length === 0}
                  onSelect={() => setBulkScope("all")}
                >
                  <Trash2 />
                  {t("deleteAllWorktrees")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <p role="alert" class="text-meta leading-5 text-state-fg-danger">
          {error()}
        </p>
      </Show>

      <Show when={!loaded()}>
        <div
          role="status"
          class="flex min-h-14 items-center gap-2 rounded-lg bg-bg-layer-01 px-4 py-4 text-meta text-text-faint shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]"
        >
          <RefreshCw class="size-3.5 animate-spin" />
          {t("worktreesLoading")}
        </div>
      </Show>

      <Show when={loaded() && filtered().length === 0}>
        <div class="flex min-h-32 flex-col items-center justify-center gap-1 rounded-lg bg-bg-layer-01 px-4 py-8 text-center shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
            {t("noWorktreesYet")}
          </span>
          <span class="text-meta leading-5 text-text-muted">{t("noWorktreesDesc")}</span>
        </div>
      </Show>

      <Show when={loaded() && filtered().length > 0}>
        <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <For each={filtered()}>
            {(entry) => {
              const parts = () => splitPath(entry.worktree.path);
              const sessionsForEntry = () => linked(entry);
              const isDeleting = () => deleting()[entry.worktree.path] === true;
              return (
                <div class="flex flex-col gap-2 border-b-[0.5px] border-border-base py-4 last:border-0">
                  <div class="flex min-h-7 flex-wrap items-center gap-3">
                    <GitBranch class="size-4 shrink-0 text-icon-muted" />
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <span class="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                        {entry.worktree.branch || tr("noBranch")}
                      </span>
                      <span
                        class="flex min-w-0 items-center font-mono text-caption leading-4 text-text-faint"
                        dir="ltr"
                        title={entry.worktree.path}
                      >
                        <span class="min-w-0 truncate">{parts()[0]}</span>
                        <span class="shrink-0 text-text-muted">{parts()[1]}</span>
                      </span>
                    </div>
                    <div class="flex shrink-0 items-center gap-3 text-caption text-text-muted">
                      <span class="font-mono">{formatBytes(entry.worktree.size ?? 0)}</span>
                      <span>
                        {t(countFor(entry) === 1 ? "sessionCountOne" : "sessionCount", {
                          count: countFor(entry),
                        })}
                      </span>
                      <Show when={lastActive(entry)}>
                        {(value) => (
                          <span class="text-text-faint" title={t("worktreeLastActive")}>
                            {relativeTime(value())}
                          </span>
                        )}
                      </Show>
                      <span class="text-text-faint">{entry.projectName}</span>
                      <Show
                        when={isDeleting()}
                        fallback={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("worktreesRemoveNamed", {
                              name: entry.worktree.branch || entry.worktree.path,
                            })}
                            disabled={loading()}
                            onClick={() => openRemove(entry)}
                            class="text-text-faint hover:text-state-fg-danger"
                          >
                            <Trash2 />
                          </Button>
                        }
                      >
                        <span class="flex items-center gap-1 text-caption text-text-faint">
                          <RefreshCw class="size-3.5 animate-spin" />
                          {t("worktreeDeleting")}
                        </span>
                      </Show>
                    </div>
                  </div>
                  <Show when={sessionsForEntry().length > 0}>
                    <div class="flex flex-col gap-1 ps-7">
                      <For each={sessionsForEntry()}>
                        {(session) => (
                          <div class="flex min-w-0 items-center justify-between gap-3 text-caption text-text-muted">
                            <span class="min-w-0 truncate">{session.title || t("worktreeUntitled")}</span>
                            <span class="shrink-0 text-text-faint">
                              {relativeTime(session.updated)}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <ConfirmDialog
        open={bulkScope() !== undefined}
        title={bulkScope() === "unused" ? t("deleteUnusedWorktrees") : t("deleteWorktreesTitle")}
        description={
          bulkScope() === "unused"
            ? `${t("deleteUnusedWorktreesDesc", { count: unused().length })} ${t(
                "deleteUnusedWorktreesHint",
              )}`
            : `${t("deleteWorktreesDesc", { count: filtered().length })} ${t(
                "worktreesDeleteHint",
              )}`
        }
        confirmLabel={t("deleteWorktreesAction")}
        destructive
        onOpenChange={(open) => !open && setBulkScope(undefined)}
        onConfirm={() => void removeMany(bulkTargets())}
      />

      <ConfirmDialog
        open={!!removeTarget()}
        title={t("removeWorktreeTitle")}
        description={removeDescription()}
        confirmLabel={t("deleteWorktreeAction")}
        destructive
        confirmDisabled={!canRemove()}
        onOpenChange={(open) => {
          if (!open) closeRemove();
        }}
        onConfirm={() => {
          const target = removeTarget();
          if (target) void remove(target);
        }}
      >
        <Show when={checking()}>
          <p class="flex items-center gap-2 text-meta leading-5 text-text-muted">
            <RefreshCw class="size-3.5 animate-spin" />
            {t("worktreeChecking")}
          </p>
        </Show>
        <Show when={!checking() && inspection()?.known === false}>
          <div class="flex flex-col gap-2">
            <p class="text-meta leading-5 text-state-fg-danger">
              {t("worktreeCheckFailed")}
            </p>
            <Show when={inspection()?.error}>
              {(detail) => (
                <p class="break-all font-mono text-caption leading-4 text-text-faint">{detail()}</p>
              )}
            </Show>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="w-fit"
              onClick={() => {
                const target = removeTarget();
                if (target) void check(target);
              }}
            >
              {t("retry")}
            </Button>
          </div>
        </Show>
      </ConfirmDialog>
    </div>
  );
}
