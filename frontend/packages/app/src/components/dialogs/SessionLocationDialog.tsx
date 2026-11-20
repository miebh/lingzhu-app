import { useEffect, useMemo, useRef, useState } from "react";
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
export function SessionLocationDialog({
  open,
  step,
  workspacePath,
  workspaces,
  onOpenChange,
  onStepChange,
  onSelectWorkspace,
  onSelectWorktree,
  onAddWorkspace,
  onOpenWorktrees,
}: Props) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "worktrees" || !workspacePath) return;
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
    return () => {
      cancelled = true;
    };
  }, [open, step, workspacePath]);

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (...values: Array<string | undefined>) =>
      !needle || values.some((value) => value?.toLowerCase().includes(needle));

    if (step === "worktrees") {
      const next: Row[] = [];
      if (matches("Local repository", workspacePath)) {
        next.push({
          id: "local",
          kind: "worktree",
          title: "Local repository",
          detail: workspacePath,
          path: workspacePath,
          current: true,
        });
      }
      if (matches("New worktree")) {
        next.push({ id: "new-worktree", kind: "new-worktree", title: "New worktree" });
      }
      for (const worktree of worktrees) {
        if (!matches(worktree.branch, worktree.path)) continue;
        next.push({
          id: `worktree:${worktree.path}`,
          kind: "worktree",
          title: worktree.branch || "Detached",
          detail: worktree.path,
          path: worktree.path,
        });
      }
      return next;
    }

    const next: Row[] = workspaces
      .filter((workspace) => workspace.connected && matches(workspace.name, workspace.path))
      .map((workspace) => ({
        id: `workspace:${workspace.path}`,
        kind: "workspace",
        title: workspace.name,
        detail: workspace.path,
        name: workspace.name,
        path: workspace.path,
        current: workspace.path === workspacePath,
      }));
    next.push({ id: "add", kind: "add", title: "Add workspace" });
    return next;
  }, [query, step, workspaces, workspacePath, worktrees]);

  const activeIndex = rows.length === 0 ? -1 : Math.min(selected, rows.length - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (row?: Row) => {
    if (!row) return;
    if (row.kind === "workspace") {
      onOpenChange(false);
      onSelectWorkspace?.(row.path ?? "");
      return;
    }
    if (row.kind === "worktree") {
      onOpenChange(false);
      if (row.path !== workspacePath) onSelectWorktree?.(row.path ?? "");
      return;
    }
    onOpenChange(false);
    if (row.kind === "add") onAddWorkspace();
    else onOpenWorktrees?.();
  };

  const move = (delta: number) => {
    if (rows.length === 0) return;
    setSelected((current) => (Math.min(current, rows.length - 1) + delta + rows.length) % rows.length);
  };

  const placeholder = step === "worktrees" ? "Search worktrees" : "Search projects";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="model"
        style={{
          width: "min(calc(100vw - 24px), 480px)",
          marginTop: "max(48px, calc((100vh - 480px) / 2))",
          maxHeight: "min(calc(100vh - 96px), 480px)",
          maxWidth: "calc(100vw - 24px)",
        }}
        className="command-palette-dialog flex flex-col overflow-hidden border-0 bg-bg-base p-0"
        hideClose
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">
          {step === "worktrees" ? "Run session in" : "Session location"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {step === "worktrees"
            ? "Search and choose the worktree for this session."
            : "Search and choose the project for this session."}
        </DialogDescription>

        <div className="command-palette-search">
          <div className="command-palette-field">
            <Search className="command-palette-icon size-4" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              aria-label={placeholder}
              aria-controls="session-location-list"
              aria-activedescendant={activeIndex >= 0 ? `session-location-option-${activeIndex}` : undefined}
              placeholder={placeholder}
              onChange={(event) => {
                setQuery(event.target.value);
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
                  choose(rows[activeIndex]);
                } else if (
                  step === "worktrees" &&
                  query === "" &&
                  (event.key === "ArrowLeft" || event.key === "Backspace")
                ) {
                  event.preventDefault();
                  onStepChange("projects");
                }
              }}
              className="command-palette-input"
            />
          </div>
        </div>

        <div ref={listRef} className="command-palette-scroll">
          <div className="command-palette-fade" aria-hidden="true" />
          <div
            id="session-location-list"
            role="listbox"
            aria-label={step === "worktrees" ? "Worktrees" : "Projects"}
            className="command-palette-results"
          >
            {step === "worktrees" && (
              <div className="command-palette-group">
                <button
                  type="button"
                  onClick={() => onStepChange("projects")}
                  className="command-palette-group-title text-start"
                >
                  {tr("dialogRunSessionIn")}
                </button>
              </div>
            )}
            <div className="command-palette-group">
              {rows.length === 0 && !loading ? (
                <p className="command-palette-state">No results found</p>
              ) : (
                rows.map((row, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={row.id}
                      id={`session-location-option-${index}`}
                      data-index={index}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "" : undefined}
                      onMouseMove={() => setSelected(index)}
                      onClick={() => choose(row)}
                      className="command-palette-row"
                    >
                      <span className="command-palette-row-main">
                        {row.kind === "workspace" || row.kind === "add" ? (
                          row.kind === "add" ? (
                            <Plus className="size-4" />
                          ) : (
                            <ProjectAvatar name={row.name} />
                          )
                        ) : row.kind === "new-worktree" ? (
                          <Plus className="size-4" />
                        ) : row.title === "Local repository" ? (
                          <Monitor className="size-4" />
                        ) : (
                          <GitBranch className="size-4" />
                        )}
                        <span className="command-palette-row-text">
                          <span className="command-palette-title">{row.title}</span>
                          {row.detail && (
                            <span className="command-palette-description" dir="ltr">
                              {row.detail}
                            </span>
                          )}
                        </span>
                        {row.current && (
                          <span className="shrink-0 text-caption text-text-faint">Current</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
              {loading && <p className="command-palette-state">Loading worktrees…</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
