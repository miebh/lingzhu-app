import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { GitBranch, RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { VCSBase, VCSFileDiff, VCSFileStatus, VCSInfo } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

type DiffMode = "working" | "branch" | "committed";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Read-only source control view: current branch, working-tree status and the
 * per-file patch. Non-repository workspaces can be initialised in place.
 */
export function SourceControlDialog(props: Props) {
  const tr = useT();
  const [info, setInfo] = createSignal<VCSInfo>();
  const [base, setBase] = createSignal<VCSBase | null>(null);
  const [files, setFiles] = createSignal<VCSFileDiff[]>([]);
  const [status, setStatus] = createSignal<VCSFileStatus[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [mode, setMode] = createSignal<DiffMode>("working");
  const [branch, setBranch] = createSignal("");
  const [branchSearch, setBranchSearch] = createSignal("");
  const [branches, setBranches] = createSignal<string[]>([]);
  const [branchesLoading, setBranchesLoading] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [initializing, setInitializing] = createSignal(false);

  const load = async (nextMode: DiffMode = mode(), nextBranch: string = branch()) => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const [nextInfo, nextBase, diffs, nextStatus] = await Promise.all([
        api.vcsInfo(workspace),
        api.vcsBase(workspace),
        api.vcsDiff(workspace, nextMode, nextMode === "branch" ? nextBranch : "", 3, "files"),
        api.vcsStatus(workspace),
      ]);
      setInfo(nextInfo);
      setBase(nextBase);
      setFiles(diffs);
      setStatus(nextStatus);
      update(setSelected, selected, (current) =>
        current && diffs.some((item) => item.file === current) ? current : diffs[0]?.file,
      );
    } catch (err) {
      setInfo(undefined);
      setBase(null);
      setFiles([]);
      setStatus([]);
      setSelected(undefined);
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
      setInfo(undefined);
      setBase(null);
      setFiles([]);
      setStatus([]);
      setSelected(undefined);
      setMode("working");
      setBranch("");
      setBranchSearch("");
      setBranches([]);
      setError("");
    }
  });

  const loadBranches = async (search = branchSearch()) => {
    const workspace = props.workspace;
    if (!workspace) return;
    setBranchesLoading(true);
    try {
      setBranches(await api.vcsBranches(workspace, search.trim(), 100));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBranchesLoading(false);
    }
  };

  const changeMode = (next: DiffMode) => {
    setMode(next);
    if (next === "branch" && branches().length === 0) {
      void loadBranches("");
    }
    void load(next, branch());
  };

  const chooseBranch = (next: string) => {
    setBranch(next);
    setMode("branch");
    void load("branch", next);
  };

  const initialize = async () => {
    if (!props.workspace) return;
    setInitializing(true);
    try {
      await api.vcsInit(props.workspace);
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setInitializing(false);
    }
  };

  const current = createMemo(() => files().find((item) => item.file === selected()));
  const additions = () => files().reduce((sum, item) => sum + item.additions, 0);
  const deletions = () => files().reduce((sum, item) => sum + item.deletions, 0);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("sourceControl")}</DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading()}
            onClick={() => void load()}
          >
            <RefreshCw class={loading() ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        <Show when={info()}>
          {(currentInfo) => (
            <div class="mt-4 flex flex-wrap items-center gap-3 text-meta text-text-muted">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-border-base px-2 py-1">
                <GitBranch class="size-3.5" />
                {currentInfo().branch.current || currentInfo().branch.default || "detached"}
              </span>
              <Show when={base()}>
                {(currentBase) => (
                  <span class="text-text-faint">
                    base {currentBase().name} ({currentBase().ref.slice(0, 8)})
                  </span>
                )}
              </Show>
              <span class="text-text-faint">
                {files().length} file{files().length === 1 ? "" : "s"}
              </span>
              <Show when={additions() > 0}>
                <span class="text-state-fg-success">+{additions()}</span>
              </Show>
              <Show when={deletions() > 0}>
                <span class="text-state-fg-danger">-{deletions()}</span>
              </Show>
              <span class="text-text-faint">
                working tree {status().length} changed
              </span>
            </div>
          )}
        </Show>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <For each={["working", "branch", "committed"] as const}>
            {(item) => (
              <Button
                type="button"
                variant={mode() === item ? "default" : "outline"}
                size="xs"
                onClick={() => changeMode(item)}
              >
                {item === "working" ? tr("workingTree") : item === "branch" ? tr("againstBranch") : tr("committed")}
              </Button>
            )}
          </For>
          <Show when={mode() === "branch"}>
            <>
              <Input
                value={branchSearch()}
                aria-label={tr("sourceControlBranchSearch")}
                placeholder={tr("sourceControlFilterBranches")}
                onInput={(event) => setBranchSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadBranches();
                  }
                }}
                class="w-48 select-text font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={branchesLoading()}
                onClick={() => void loadBranches()}
              >
                {branchesLoading() ? tr("loading") : tr("listBranches")}
              </Button>
              <Show when={branch()}>
                <span class="text-caption text-text-faint">base {branch()}</span>
              </Show>
            </>
          </Show>
        </div>

        <Show when={mode() === "branch" && branches().length > 0}>
          <div class="mt-2 flex max-h-28 shrink-0 flex-wrap gap-1 overflow-auto rounded-md border border-border-base bg-bg-layer-01 p-1">
            <For each={branches()}>
              {(name) => (
                <button
                  type="button"
                  onClick={() => chooseBranch(name)}
                  class={`interactive rounded-md px-2 py-1 font-mono text-caption ${
                    branch() === name
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-faint hover:text-text-base"
                  }`}
                >
                  {name}
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={error()}>
          <div class="mt-4 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger">
            <p class="select-text">{error()}</p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              class="mt-2"
              disabled={initializing()}
              onClick={() => void initialize()}
            >
              {initializing() ? tr("initializing") : tr("initializeRepository")}
            </Button>
          </div>
        </Show>

        <Show when={!error() && files().length === 0 && !loading()}>
          <p class="mt-4 text-meta text-text-faint">
            {mode() === "working" ? tr("workingTreeClean") : tr("noChangesView")}
          </p>
        </Show>

        <Show when={files().length > 0}>
          <div class="mt-4 flex min-h-0 flex-1 gap-3">
            <div class="w-64 shrink-0 overflow-y-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
              <For each={files()}>
                {(item) => {
                  const active = () => item.file === selected();
                  return (
                    <button
                      type="button"
                      onClick={() => setSelected(item.file)}
                      class={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                        active() ? "bg-bg-layer-02 text-text-base" : "text-text-muted hover:text-text-base"
                      }`}
                    >
                      <span
                        class={`shrink-0 font-mono text-caption ${
                          item.status === "added"
                            ? "text-state-fg-success"
                            : item.status === "deleted"
                              ? "text-state-fg-danger"
                              : "text-state-fg-warning"
                        }`}
                      >
                        {item.status === "added" ? "A" : item.status === "deleted" ? "D" : "M"}
                      </span>
                      <span class="min-w-0 flex-1 truncate font-mono" title={item.file}>
                        {item.file}
                      </span>
                      <span class="shrink-0 font-mono text-caption tabular-nums text-text-faint">
                        +{item.additions} -{item.deletions}
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>

            <div class="min-w-0 flex-1 overflow-auto rounded-md border border-border-base bg-bg-base">
              <Show
                when={current()}
                fallback={<p class="p-3 text-meta text-text-faint">{tr("sourceControlSelectDiff")}</p>}
              >
                {(item) => (
                  <pre class="min-h-full p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                    {item().patch || "(no patch)"}
                  </pre>
                )}
              </Show>
            </div>
          </div>
        </Show>

        <Show when={loading() && files().length === 0 && !error()}>
          <p class="mt-4 text-meta text-text-faint">{tr("loading")}</p>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
