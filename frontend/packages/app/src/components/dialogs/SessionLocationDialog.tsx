import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { GitBranch, Monitor, Plus, Search } from "@lingzhu/ui/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import type { WorkspaceInfo, Worktree } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
import { useT } from "@lingzhu/ui/i18n";

type Step = "projects" | "worktrees";

interface Row {
  id: string;
  kind: "workspace" | "worktree" | "add" | "new-worktree";
  title: string;
  detail?: string;
  name?: string;
  path?: string;
  current?: boolean;
}

interface Props {
  open: boolean;
  step: Step;
  workspacePath?: string;
  workspaces: WorkspaceInfo[];
  onOpenChange: (open: boolean) => void;
  onStepChange: (step: Step) => void;
  onSelectWorkspace?: (path: string) => void;
  onSelectWorktree?: (path: string) => void;
  onAddWorkspace: () => void;
  onOpenWorktrees?: () => void;
}

/**
 * The reference location picker: a 480px palette dialog with a search field
 * over a keyboard-navigable list, plus the project's worktree step.
 */
export function SessionLocationDialog(props: Props) {
  const tr = useT();
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  const [worktrees, setWorktrees] = createSignal<Worktree[]>([]);
  const [loading, setLoading] = createSignal(false);
  let inputRef: HTMLInputElement | null = null;
  let listRef: HTMLDivElement | null = null;

  createEffect(() => {
    if (!props.open) return;
    props.step;
    setQuery("");
    setSelected(0);
  });

  createEffect(() => {
    const workspacePath = props.workspacePath;
    if (!props.open || props.step !== "worktrees" || !workspacePath) return;
    let cancelled = false;
    setLoading(true);
    Promise.resolve()
      .then(() => api.worktrees(workspacePath))
      .then((list) => {
        if (!cancelled) setWorktrees(list.worktrees.filter((item) => !item.main));
      })
      .catch(() => {
        if (!cancelled) setWorktrees([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const rows = createMemo<Row[]>(() => {
    const needle = query().trim().toLowerCase();
    const matches = (...values: Array<string | undefined>) =>
      !needle || values.some((value) => value?.toLowerCase().includes(needle));

    if (props.step === "worktrees") {
      const next: Row[] = [];
      if (matches(tr("localRepository"), props.workspacePath)) {
        next.push({
          id: "local",
          kind: "worktree",
          title: tr("localRepository"),
          detail: props.workspacePath,
          path: props.workspacePath,
          current: true,
        });
      }
      if (matches(tr("newWorktree"))) {
        next.push({ id: "new-worktree", kind: "new-worktree", title: tr("newWorktree") });
      }
      for (const worktree of worktrees()) {
        if (!matches(worktree.branch, worktree.path)) continue;
        next.push({
          id: `worktree:${worktree.path}`,
          kind: "worktree",
          title: worktree.branch || tr("detached"),
          detail: worktree.path,
          path: worktree.path,
        });
      }
      return next;
    }

    const next: Row[] = props.workspaces
      .filter((workspace) => workspace.connected && matches(workspace.name, workspace.path))
      .map((workspace) => ({
        id: `workspace:${workspace.path}`,
        kind: "workspace",
        title: workspace.name,
        detail: workspace.path,
        name: workspace.name,
        path: workspace.path,
        current: workspace.path === props.workspacePath,
      }));
    next.push({ id: "add", kind: "add", title: tr("addWorkspace") });
    return next;
  });

  const activeIndex = () => (rows().length === 0 ? -1 : Math.min(selected(), rows().length - 1));

  createEffect(() => {
    const index = activeIndex();
    if (index < 0) return;
    listRef?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  });

  const choose = (row?: Row) => {
    if (!row) return;
    if (row.kind === "workspace") {
      props.onOpenChange(false);
      props.onSelectWorkspace?.(row.path ?? "");
      return;
    }
    if (row.kind === "worktree") {
      props.onOpenChange(false);
      if (row.path !== props.workspacePath) props.onSelectWorktree?.(row.path ?? "");
      return;
    }
    props.onOpenChange(false);
    if (row.kind === "add") props.onAddWorkspace();
    else props.onOpenWorktrees?.();
  };

  const move = (delta: number) => {
    const length = rows().length;
    if (length === 0) return;
    update(setSelected, selected, (current) => (Math.min(current, length - 1) + delta + length) % length);
  };

  const placeholder = () =>
    props.step === "worktrees" ? tr("searchWorktrees") : tr("searchProjects");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        size="model"
        style={{
          width: "min(calc(100vw - 24px), 480px)",
          "margin-top": "max(48px, calc((100vh - 480px) / 2))",
          "max-height": "min(calc(100vh - 96px), 480px)",
          "max-width": "calc(100vw - 24px)",
        }}
        class="command-palette-dialog flex flex-col overflow-hidden border-0 bg-bg-base p-0"
        hideClose
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef?.focus();
        }}
      >
        <DialogTitle class="sr-only">
          {props.step === "worktrees" ? tr("dialogRunSessionIn") : tr("sessionLocation")}
        </DialogTitle>
        <DialogDescription class="sr-only">
          {props.step === "worktrees"
            ? tr("searchAndChooseWorktree")
            : tr("searchAndChooseProject")}
        </DialogDescription>

        <div class="command-palette-search">
          <div class="command-palette-field">
            <Search class="command-palette-icon size-4" />
            <input
              ref={(node) => (inputRef = node)}
              autofocus
              value={query()}
              aria-label={placeholder()}
              aria-controls="session-location-list"
              aria-activedescendant={activeIndex() >= 0 ? `session-location-option-${activeIndex()}` : undefined}
              placeholder={placeholder()}
              onInput={(event) => {
                setQuery(event.currentTarget.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(rows()[activeIndex()]);
                } else if (
                  props.step === "worktrees" &&
                  query() === "" &&
                  (event.key === "ArrowLeft" || event.key === "Backspace")
                ) {
                  event.preventDefault();
                  props.onStepChange("projects");
                }
              }}
              class="command-palette-input"
            />
          </div>
        </div>

        <div ref={(node) => (listRef = node)} class="command-palette-scroll">
          <div class="command-palette-fade" aria-hidden="true" />
          <div
            id="session-location-list"
            role="listbox"
            aria-label={props.step === "worktrees" ? tr("worktrees") : tr("projects")}
            class="command-palette-results"
          >
            <Show when={props.step === "worktrees"}>
              <div class="command-palette-group">
                <button
                  type="button"
                  onClick={() => props.onStepChange("projects")}
                  class="command-palette-group-title text-start"
                >
                  {tr("dialogRunSessionIn")}
                </button>
              </div>
            </Show>
            <div class="command-palette-group">
              <Show
                when={rows().length > 0 || loading()}
                fallback={<p class="command-palette-state">{tr("noResults")}</p>}
              >
                <For each={rows()}>
                  {(row, index) => {
                    const active = () => index() === activeIndex();
                    return (
                      <button
                        id={`session-location-option-${index()}`}
                        data-index={index()}
                        type="button"
                        role="option"
                        aria-selected={active()}
                        data-active={active() ? "" : undefined}
                        onMouseMove={() => setSelected(index())}
                        onClick={() => choose(row)}
                        class="command-palette-row"
                      >
                        <span class="command-palette-row-main">
                          {row.kind === "workspace" || row.kind === "add" ? (
                            row.kind === "add" ? (
                              <Plus class="size-4" />
                            ) : (
                              <ProjectAvatar name={row.name} />
                            )
                          ) : row.kind === "new-worktree" ? (
                            <Plus class="size-4" />
                          ) : row.title === "Local repository" ? (
                            <Monitor class="size-4" />
                          ) : (
                            <GitBranch class="size-4" />
                          )}
                          <span class="command-palette-row-text">
                            <span class="command-palette-title">{row.title}</span>
                            <Show when={row.detail}>
                              <span class="command-palette-description" dir="ltr">
                                {row.detail}
                              </span>
                            </Show>
                          </span>
                          <Show when={row.current}>
                            <span class="shrink-0 text-caption text-text-faint">{tr("current")}</span>
                          </Show>
                        </span>
                      </button>
                    );
                  }}
                </For>
              </Show>
              <Show when={loading()}>
                <p class="command-palette-state">{tr("worktreesLoading")}</p>
              </Show>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
