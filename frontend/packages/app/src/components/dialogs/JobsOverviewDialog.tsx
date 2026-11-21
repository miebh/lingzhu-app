import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function JobsOverviewDialog(props: Props) {
  const tr = useT();
  const [jobs, setJobs] = createSignal<JobInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [cancelling, setCancelling] = createSignal("");
  const [error, setError] = createSignal("");

  const load = async (quiet = false) => {
    if (!props.workspace) return;
    if (!quiet) setLoading(true);
    try {
      setJobs(await api.allJobs(props.workspace));
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void load();
    } else {
      setJobs([]);
      setError("");
      setCancelling("");
    }
  });

  createEffect(() => {
    if (!props.open) return;
    void props.workspace;
    const timer = window.setInterval(() => void load(true), 2000);
    onCleanup(() => window.clearInterval(timer));
  });

  const cancelJob = async (job: JobInfo) => {
    if (!props.workspace) return;
    setCancelling(job.id);
    try {
      const updated = await api.cancelJob(props.workspace, job.sessionId, job.id);
      update(setJobs, jobs, (current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCancelling("");
    }
  };

  const running = () => jobs().filter((job) => job.status === "running").length;

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
              {props.name ? `${props.name} · ` : ""}
              {running()} running · {jobs().length} total
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={jobs().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No background jobs in this workspace."}
              </p>
            }
          >
            <For each={jobs()}>
              {(job) => (
                <div class="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="truncate font-mono text-body text-text-base" title={job.command}>
                        {job.command}
                      </span>
                      <span class={`rounded-xs border border-border-base px-1 text-caption ${jobStatusTone(job.status)}`}>
                        {job.status}
                        {job.exitCode >= 0 ? ` (${job.exitCode})` : ""}
                      </span>
                    </div>
                    <p class="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-text-faint">
                      <Show
                        when={props.onOpenSession}
                        fallback={<span class="font-mono">{job.sessionId}</span>}
                      >
                        {(openSession) => (
                          <button
                            type="button"
                            onClick={() => openSession()(job.sessionId)}
                            class="interactive font-mono hover:text-text-base"
                            title={tr("jobsOverviewOpenSession")}
                          >
                            {job.sessionId}
                          </button>
                        )}
                      </Show>
                      {job.started && <span>Started {formatDateTime(job.started)}</span>}
                      {job.finished && <span>Finished {formatDateTime(job.finished)}</span>}
                    </p>
                    <Show when={job.error}>
                      <p class="mt-0.5 truncate text-caption text-state-fg-danger">{job.error}</p>
                    </Show>
                    <Show when={job.file}>
                      <p class="mt-0.5 truncate font-mono text-caption text-text-faint" title={job.file}>
                        {job.file}
                      </p>
                    </Show>
                  </div>
                  <Show when={job.status === "running"}>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={cancelling() === job.id}
                      onClick={() => void cancelJob(job)}
                    >
                      <Ban />
                      {cancelling() === job.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Shows background jobs from every session in this workspace. Refreshes every 2 seconds.
        </p>
      </DialogContent>
    </Dialog>
  );
}
