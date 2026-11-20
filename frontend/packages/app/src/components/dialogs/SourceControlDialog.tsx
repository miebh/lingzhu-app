import { useEffect, useMemo, useState } from "react";
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
export function SourceControlDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [info, setInfo] = useState<VCSInfo>();
  const [base, setBase] = useState<VCSBase | null>(null);
  const [files, setFiles] = useState<VCSFileDiff[]>([]);
  const [status, setStatus] = useState<VCSFileStatus[]>([]);
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<DiffMode>("working");
  const [branch, setBranch] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(false);

  const load = async (nextMode: DiffMode = mode, nextBranch: string = branch) => {
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
      setSelected((current) =>
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

  useEffect(() => {
    if (open) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const loadBranches = async (search = branchSearch) => {
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
    if (next === "branch" && branches.length === 0) {
      void loadBranches("");
    }
    void load(next, branch);
  };

  const chooseBranch = (name: string) => {
    setBranch(name);
    setMode("branch");
    void load("branch", name);
  };

  const initialize = async () => {
    if (!workspace) return;
    setInitializing(true);
    try {
      await api.vcsInit(workspace);
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setInitializing(false);
    }
  };

  const current = useMemo(() => files.find((item) => item.file === selected), [files, selected]);
  const additions = files.reduce((sum, item) => sum + item.additions, 0);
  const deletions = files.reduce((sum, item) => sum + item.deletions, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Source control</DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        {info && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-meta text-text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border-base px-2 py-1">
              <GitBranch className="size-3.5" />
              {info.branch.current || info.branch.default || "detached"}
            </span>
            {base && (
              <span className="text-text-faint">
                base {base.name} ({base.ref.slice(0, 8)})
              </span>
            )}
            <span className="text-text-faint">
              {files.length} file{files.length === 1 ? "" : "s"}
            </span>
            {additions > 0 && <span className="text-state-fg-success">+{additions}</span>}
            {deletions > 0 && <span className="text-state-fg-danger">-{deletions}</span>}
            <span className="text-text-faint">
              working tree {status.length} changed
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["working", "branch", "committed"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              variant={mode === item ? "default" : "outline"}
              size="xs"
              onClick={() => changeMode(item)}
            >
              {item === "working" ? "Working tree" : item === "branch" ? "Against branch" : "Committed"}
            </Button>
          ))}
          {mode === "branch" && (
            <>
              <Input
                value={branchSearch}
                aria-label={tr("sourceControlBranchSearch")}
                placeholder={tr("sourceControlFilterBranches")}
                onChange={(event) => setBranchSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadBranches();
                  }
                }}
                className="w-48 select-text font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={branchesLoading}
                onClick={() => void loadBranches()}
              >
                {branchesLoading ? "Loading…" : "List branches"}
              </Button>
              {branch && <span className="text-caption text-text-faint">base {branch}</span>}
            </>
          )}
        </div>

        {mode === "branch" && branches.length > 0 && (
          <div className="mt-2 flex max-h-28 shrink-0 flex-wrap gap-1 overflow-auto rounded-md border border-border-base bg-bg-layer-01 p-1">
            {branches.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => chooseBranch(name)}
                className={`interactive rounded-md px-2 py-1 font-mono text-caption ${
                  branch === name
                    ? "bg-bg-layer-02 text-text-base"
                    : "text-text-faint hover:text-text-base"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger">
            <p className="select-text">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mt-2"
              disabled={initializing}
              onClick={() => void initialize()}
            >
              {initializing ? "Initializing…" : "Initialize repository"}
            </Button>
          </div>
        )}

        {!error && files.length === 0 && !loading && (
          <p className="mt-4 text-meta text-text-faint">
            {mode === "working" ? "Working tree is clean." : "No changes to show for this view."}
          </p>
        )}

        {files.length > 0 && (
          <div className="mt-4 flex min-h-0 flex-1 gap-3">
            <div className="w-64 shrink-0 overflow-y-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
              {files.map((item) => {
                const active = item.file === selected;
                return (
                  <button
                    key={item.file}
                    type="button"
                    onClick={() => setSelected(item.file)}
                    className={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                      active ? "bg-bg-layer-02 text-text-base" : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <span
                      className={`shrink-0 font-mono text-caption ${
                        item.status === "added"
                          ? "text-state-fg-success"
                          : item.status === "deleted"
                            ? "text-state-fg-danger"
                            : "text-state-fg-warning"
                      }`}
                    >
                      {item.status === "added" ? "A" : item.status === "deleted" ? "D" : "M"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={item.file}>
                      {item.file}
                    </span>
                    <span className="shrink-0 font-mono text-caption tabular-nums text-text-faint">
                      +{item.additions} -{item.deletions}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 overflow-auto rounded-md border border-border-base bg-bg-base">
              {current ? (
                <pre className="min-h-full p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                  {current.patch || "(no patch)"}
                </pre>
              ) : (
                <p className="p-3 text-meta text-text-faint">Select a file to see its diff.</p>
              )}
            </div>
          </div>
        )}

        {loading && files.length === 0 && !error && (
          <p className="mt-4 text-meta text-text-faint">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
