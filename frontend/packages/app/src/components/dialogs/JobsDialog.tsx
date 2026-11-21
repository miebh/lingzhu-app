import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function JobsDialog(props: Props) {
  const tr = useT();
  const [jobs, setJobs] = createSignal<JobInfo[]>([]);
  const [command, setCommand] = createSignal("");
  const [timeoutValue, setTimeoutValue] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [running, setRunning] = createSignal(false);
  const [result, setResult] = createSignal<ShellResult>();
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal("");
  const [cancelling, setCancelling] = createSignal("");
  const [now, setNow] = createSignal(Date.now());

  const load = async (quiet = false) => {
    if (!props.workspace || !props.sessionID) return;
    if (!quiet) setLoading(true);
    try {
      setJobs(await api.backgroundJobs(props.workspace, props.sessionID));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
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
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    void load();
    const timer = window.setInterval(() => void load(true), 2_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const active = () => jobs().some((job) => job.status === "running");
  createEffect(() => {
    if (!active()) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const start = async () => {
    if (!props.workspace || !props.sessionID) return;
    const text = command().trim();
    if (!text) {
      setError("Command is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.startBackground(
        props.workspace,
        props.sessionID,
        text,
        timeoutValue().trim() ? Number(timeoutValue()) : 0,
      );
      update(setJobs, jobs, (current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setCommand("");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!props.workspace || !props.sessionID) return;
    const text = command().trim();
    if (!text) {
      setError("Command is required.");
      return;
    }
    setRunning(true);
    try {
      const output = await api.sessionShell(
        props.workspace,
        props.sessionID,
        text,
        timeoutValue().trim() ? Number(timeoutValue()) : 0,
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
    if (!props.workspace || !props.sessionID) return;
    setCancelling(id);
    try {
      const updated = await api.cancelJob(props.workspace, props.sessionID, id);
      update(setJobs, jobs, (current) => current.map((item) => (item.id === updated.id ? updated : item)));
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

  const runningCount = () => jobs().filter((job) => job.status === "running").length;
  const visible = createMemo(() =>
    [...jobs()].sort((a, b) => Number(b.status === "running") - Number(a.status === "running")),
  );

  const durationOf = (job: JobInfo) => {
    const started = Date.parse(job.started);
    if (!Number.isFinite(started)) return "";
    const finished = Date.parse(job.finished);
    const end = job.status === "running" ? now() : Number.isFinite(finished) ? finished : now();
    return formatElapsed(end - started);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <ListTodo class="size-4 text-text-faint" />
              {tr("backgroundJobs")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {runningCount()} running · {jobs().length} total
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="me-6"
            aria-label={tr("jobsRefreshJobs")}
            title={tr("jobsRefresh")}
            disabled={loading()}
            onClick={() => void load()}
          >
            <RefreshCw class={loading() ? "motion-safe:animate-spin" : undefined} />
          </Button>
        </div>

        <div class="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <Input
            value={command()}
            aria-label={tr("jobsSessionCommand")}
            placeholder={tr("jobsCommandToRunInTheSessionShell")}
            onInput={(event) => setCommand(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void run();
              }
            }}
            class="min-w-48 flex-1 select-text font-mono"
          />
          <Input
            value={timeoutValue()}
            aria-label={tr("jobsTimeoutMilliseconds")}
            placeholder={tr("dialogTimeout")}
            onInput={(event) => setTimeoutValue(event.currentTarget.value)}
            class="w-24 select-text font-mono"
          />
          <Button type="button" size="sm" disabled={running() || busy()} onClick={() => void run()}>
            <Play />
            {running() ? tr("runningNow") : tr("run")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running() || busy()}
            onClick={() => void start()}
          >
            {tr("dialogStartBackground")}
          </Button>
        </div>

        <ErrorBanner error={error()} class="mt-3 shrink-0" />

        <Show when={result()}>
          {(output) => (
            <div class="mt-2 shrink-0 overflow-hidden rounded-md border border-border-base bg-bg-layer-01">
              <div class="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                <span class="tabular-nums">
                  exit {output().exit}
                  {output().timedOut ? " · timed out" : ""}
                  {output().truncated ? " · truncated" : ""}
                </span>
                <span class="ms-auto flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={tr("jobsCopyOutput")}
                    title={tr("jobsCopyOutput")}
                    onClick={() => void copy("output", output().output)}
                  >
                    {copied() === "output" ? <Check /> : <Copy />}
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
              <pre class="max-h-40 overflow-auto p-3 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                {output().output || "(no output)"}
              </pre>
            </div>
          )}
        </Show>

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={jobs().length > 0}
            fallback={
              <p class="grid h-full place-items-center p-6 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("noSessionJobs")}
              </p>
            }
          >
            <For each={visible()}>
              {(job) => (
                <div
                  data-slot="job-row"
                  data-status={job.status}
                  class="flex items-start gap-2 border-b border-border-base px-3 py-2 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    class={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-current", jobStatusTone(job.status))}
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-baseline gap-2">
                      <span
                        title={job.command}
                        class="min-w-0 flex-1 truncate font-mono text-body text-text-base"
                      >
                        {job.command}
                      </span>
                      <span class={cn("shrink-0 text-caption tabular-nums", jobStatusTone(job.status))}>
                        {job.status === "completed"
                          ? `exit ${job.exitCode}`
                          : job.status === "failed" && job.exitCode >= 0
                            ? `exit ${job.exitCode}`
                            : job.status}
                      </span>
                    </div>
                    <p class="mt-0.5 flex min-w-0 items-center gap-1 text-caption text-text-faint">
                      <span class="shrink-0 tabular-nums">{formatTimeOfDay(job.started)}</span>
                      <Show when={durationOf(job)}>
                        {(duration) => (
                          <>
                            <span aria-hidden="true">·</span>
                            <span class="shrink-0 tabular-nums">{duration()}</span>
                          </>
                        )}
                      </Show>
                      <Show when={job.file}>
                        {(file) => (
                          <>
                            <span aria-hidden="true">·</span>
                            <span class="truncate font-mono" title={file()}>
                              {file().split(/[\\/]/).pop() || file()}
                            </span>
                          </>
                        )}
                      </Show>
                    </p>
                    <Show when={job.error && job.error !== "cancelled"}>
                      <p class="mt-0.5 whitespace-pre-wrap break-words text-caption text-state-fg-danger select-text">
                        {job.error}
                      </p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Show when={job.status === "running"}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Cancel ${job.command}`}
                        title={tr("jobsCancel")}
                        disabled={cancelling() === job.id}
                        onClick={() => void cancelJob(job.id)}
                      >
                        <Ban />
                      </Button>
                    </Show>
                    <Show when={job.file}>
                      {(file) => (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={tr("jobsCopyOutputPath")}
                          title={file()}
                          onClick={() => void copy(job.id, file())}
                        >
                          {copied() === job.id ? <Check /> : <Copy />}
                        </Button>
                      )}
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
