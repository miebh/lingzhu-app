import { useEffect, useState } from "react";
import { Ban, ListTodo } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { JobInfo } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { jobStatusTone } from "../../lib/status";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
}

/** All background jobs of one workspace across sessions, with cancel. */
export function JobsOverviewDialog({ open, workspace, name, onOpenChange, onOpenSession }: Props) {
  const tr = useT();
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState("");
  const [error, setError] = useState("");

  const load = async (quiet = false) => {
    if (!workspace) return;
    if (!quiet) setLoading(true);
    try {
      setJobs(await api.allJobs(workspace));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) {
        setJobs([]);
        setError(messageOf(err));
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setJobs([]);
      setError("");
      setCancelling("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void load(true), 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const cancelJob = async (job: JobInfo) => {
    if (!workspace) return;
    setCancelling(job.id);
    try {
      const updated = await api.cancelJob(workspace, job.sessionId, job.id);
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCancelling("");
    }
  };

  const running = jobs.filter((job) => job.status === "running").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="size-4 text-text-faint" />
              {tr("backgroundJobs")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {running} running · {jobs.length} total
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {jobs.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No background jobs in this workspace."}
            </p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-body text-text-base" title={job.command}>
                      {job.command}
                    </span>
                    <span className={`rounded-xs border border-border-base px-1 text-caption ${jobStatusTone(job.status)}`}>
                      {job.status}
                      {job.exitCode >= 0 ? ` (${job.exitCode})` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-text-faint">
                    {onOpenSession ? (
                      <button
                        type="button"
                        onClick={() => onOpenSession(job.sessionId)}
                        className="interactive font-mono hover:text-text-base"
                        title={tr("jobsOverviewOpenSession")}
                      >
                        {job.sessionId}
                      </button>
                    ) : (
                      <span className="font-mono">{job.sessionId}</span>
                    )}
                    {job.started && <span>Started {formatDateTime(job.started)}</span>}
                    {job.finished && <span>Finished {formatDateTime(job.finished)}</span>}
                  </p>
                  {job.error && <p className="mt-0.5 truncate text-caption text-state-fg-danger">{job.error}</p>}
                  {job.file && (
                    <p className="mt-0.5 truncate font-mono text-caption text-text-faint" title={job.file}>
                      {job.file}
                    </p>
                  )}
                </div>
                {job.status === "running" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={cancelling === job.id}
                    onClick={() => void cancelJob(job)}
                  >
                    <Ban />
                    {cancelling === job.id ? "Cancelling…" : "Cancel"}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Shows background jobs from every session in this workspace. Refreshes every 2 seconds.
        </p>
      </DialogContent>
    </Dialog>
  );
}
