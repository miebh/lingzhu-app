import { useEffect, useState } from "react";
import { Ban, Check, Copy, ListTodo, Play, RefreshCw, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { JobInfo, ShellResult } from "@lingzhu/ui/types";
import { formatElapsed, formatTimeOfDay } from "@lingzhu/ui/format";
import { jobStatusTone } from "../../lib/status";
import { cn } from "@lingzhu/ui/utils";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Session shell commands: run in the foreground or start background jobs. */
export function JobsDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [command, setCommand] = useState("");
  const [timeoutValue, setTimeoutValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ShellResult>();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [cancelling, setCancelling] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = async (quiet = false) => {
    if (!workspace || !sessionID) return;
    if (!quiet) setLoading(true);
    try {
      setJobs(await api.backgroundJobs(workspace, sessionID));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setJobs([]);
      setCommand("");
      setTimeoutValue("");
      setResult(undefined);
      setRunning(false);
      setError("");
      setCopied("");
      setCancelling("");
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(true), 2_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const active = jobs.some((job) => job.status === "running");
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const start = async () => {
    if (!workspace || !sessionID) return;
    const text = command.trim();
    if (!text) {
      setError("Command is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.startBackground(
        workspace,
        sessionID,
        text,
        timeoutValue.trim() ? Number(timeoutValue) : 0,
      );
      setJobs((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setCommand("");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!workspace || !sessionID) return;
    const text = command.trim();
    if (!text) {
      setError("Command is required.");
      return;
    }
    setRunning(true);
    try {
      const output = await api.sessionShell(
        workspace,
        sessionID,
        text,
        timeoutValue.trim() ? Number(timeoutValue) : 0,
      );
      setResult(output);
      setError("");
    } catch (err) {
      setResult(undefined);
      setError(messageOf(err));
    } finally {
      setRunning(false);
    }
  };

  const cancelJob = async (id: string) => {
    if (!workspace || !sessionID) return;
    setCancelling(id);
    try {
      const updated = await api.cancelJob(workspace, sessionID, id);
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCancelling("");
    }
  };

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1_500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const runningCount = jobs.filter((job) => job.status === "running").length;
  const visible = [...jobs].sort(
    (a, b) => Number(b.status === "running") - Number(a.status === "running"),
  );

  const durationOf = (job: JobInfo) => {
    const started = Date.parse(job.started);
    if (!Number.isFinite(started)) return "";
    const finished = Date.parse(job.finished);
    const end = job.status === "running" ? now : Number.isFinite(finished) ? finished : now;
    return formatElapsed(end - started);
  };

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
              {title ? `${title} · ` : ""}
              {runningCount} running · {jobs.length} total
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="me-6"
            aria-label={tr("jobsRefreshJobs")}
            title={tr("jobsRefresh")}
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "motion-safe:animate-spin" : undefined} />
          </Button>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <Input
            value={command}
            aria-label={tr("jobsSessionCommand")}
            placeholder={tr("jobsCommandToRunInTheSessionShell")}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void run();
              }
            }}
            className="min-w-48 flex-1 select-text font-mono"
          />
          <Input
            value={timeoutValue}
            aria-label={tr("jobsTimeoutMilliseconds")}
            placeholder={tr("dialogTimeout")}
            onChange={(event) => setTimeoutValue(event.target.value)}
            className="w-24 select-text font-mono"
          />
          <Button type="button" size="sm" disabled={running || busy} onClick={() => void run()}>
            <Play />
            {running ? "Running…" : "Run"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running || busy}
            onClick={() => void start()}
          >
            {tr("dialogStartBackground")}
          </Button>
        </div>

        <ErrorBanner error={error} className="mt-3 shrink-0" />

        {result && (
          <div className="mt-2 shrink-0 overflow-hidden rounded-md border border-border-base bg-bg-layer-01">
            <div className="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
              <span className="tabular-nums">
                exit {result.exit}
                {result.timedOut ? " · timed out" : ""}
                {result.truncated ? " · truncated" : ""}
              </span>
              <span className="ms-auto flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("jobsCopyOutput")}
                  title={tr("jobsCopyOutput")}
                  onClick={() => void copy("output", result.output)}
                >
                  {copied === "output" ? <Check /> : <Copy />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("jobsDismissOutput")}
                  title={tr("jobsDismiss")}
                  onClick={() => setResult(undefined)}
                >
                  <X />
                </Button>
              </span>
            </div>
            <pre className="max-h-40 overflow-auto p-3 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
              {result.output || "(no output)"}
            </pre>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {jobs.length === 0 ? (
            <p className="grid h-full place-items-center p-6 text-meta text-text-faint">
              {loading ? "Loading…" : "No background jobs for this session."}
            </p>
          ) : (
            visible.map((job) => {
              const duration = durationOf(job);
              return (
                <div
                  key={job.id}
                  data-slot="job-row"
                  data-status={job.status}
                  className="flex items-start gap-2 border-b border-border-base px-3 py-2 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-current", jobStatusTone(job.status))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span
                        title={job.command}
                        className="min-w-0 flex-1 truncate font-mono text-body text-text-base"
                      >
                        {job.command}
                      </span>
                      <span className={cn("shrink-0 text-caption tabular-nums", jobStatusTone(job.status))}>
                        {job.status === "completed"
                          ? `exit ${job.exitCode}`
                          : job.status === "failed" && job.exitCode >= 0
                            ? `exit ${job.exitCode}`
                            : job.status}
                      </span>
                    </div>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-caption text-text-faint">
                      <span className="shrink-0 tabular-nums">{formatTimeOfDay(job.started)}</span>
                      {duration && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 tabular-nums">{duration}</span>
                        </>
                      )}
                      {job.file && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate font-mono" title={job.file}>
                            {job.file.split(/[\\/]/).pop() || job.file}
                          </span>
                        </>
                      )}
                    </p>
                    {job.error && job.error !== "cancelled" && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-caption text-state-fg-danger select-text">
                        {job.error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {job.status === "running" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Cancel ${job.command}`}
                        title={tr("jobsCancel")}
                        disabled={cancelling === job.id}
                        onClick={() => void cancelJob(job.id)}
                      >
                        <Ban />
                      </Button>
                    )}
                    {job.file && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={tr("jobsCopyOutputPath")}
                        title={job.file}
                        onClick={() => void copy(job.id, job.file)}
                      >
                        {copied === job.id ? <Check /> : <Copy />}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
