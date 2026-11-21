import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { ArrowLeft, Terminal, XMarkFilled } from "@lingzhu/ui/icons";
import { update } from "@lingzhu/ui/solid";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { formatElapsed, stripAnsi } from "@lingzhu/ui/format";
import { t } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import type { JobInfo, SessionSubagent } from "@lingzhu/ui/types";

interface Props {
  workspace?: string;
  sessionID?: string;
  /** Side of the composer lane the capsule sits on. */
  align?: "left" | "center" | "right";
  /** Opens one running child session. */
  onOpenSubagent: (sessionID: string) => void;
}

const TAIL_LINES = 14;

function elapsed(started: string, now: number, finished?: string) {
  const start = Date.parse(started);
  if (!Number.isFinite(start)) return "";
  const end = finished ? Date.parse(finished) : NaN;
  return formatElapsed((Number.isFinite(end) ? end : now) - start);
}

/** Child label without the stored `[subagent]` prefix. */
function subagentLabel(child: SessionSubagent): string {
  const title = (child.title ?? "").replace(/^\[subagent\]\s*/, "").trim();
  return title || child.agent || child.id;
}

function agentLabel(child: SessionSubagent) {
  const agent = child.agent?.trim();
  if (!agent) return t("agent");
  return `${agent[0].toUpperCase()}${agent.slice(1)}`;
}

function statusLabel(job: JobInfo) {
  if (job.status === "cancelled") return t("activityStopped");
  if (job.status === "completed") {
    return job.exitCode === 0 ? t("activityExited") : t("activityExitedCode", { code: job.exitCode });
  }
  if (job.status === "failed") {
    return job.exitCode >= 0 ? t("activityExitedCode", { code: job.exitCode }) : t("activityFailed");
  }
  return job.status;
}

function statusTone(job: JobInfo) {
  return job.status === "failed" ? "text-state-fg-danger" : "text-text-muted";
}

/**
 * Running background work as one capsule in the composer lane, like the
 * reference: the capsule summarizes subagents and shells, opens a menu of that
 * work, and a shell opens its own panel with a live output tail.
 */
export function SessionActivityChips(props: Props) {
  const [jobs, setJobs] = createSignal<JobInfo[]>([]);
  const [subagents, setSubagents] = createSignal<SessionSubagent[]>([]);
  const [open, setOpen] = createSignal(false);
  const [selectedID, setSelectedID] = createSignal<string>();
  const [output, setOutput] = createSignal("");
  const [stopping, setStopping] = createSignal<string>();
  const [now, setNow] = createSignal(Date.now());
  let root: HTMLDivElement | undefined;

  const align = () => props.align ?? "left";

  createEffect(() => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) {
      setJobs([]);
      setSubagents([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [jobResult, subagentResult] = await Promise.allSettled([
        api.backgroundJobs(workspace, sessionID),
        api.sessionSubagents(workspace, sessionID),
      ]);
      if (cancelled) return;
      setJobs(jobResult.status === "fulfilled" ? jobResult.value : []);
      setSubagents(subagentResult.status === "fulfilled" ? subagentResult.value : []);
    };
    void load();
    const tick = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(tick, 3000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    onCleanup(() => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    });
  });

  const runningJobs = createMemo(() => jobs().filter((job) => job.status === "running"));
  const selectedJob = createMemo(() => {
    const id = selectedID();
    return id ? jobs().find((job) => job.id === id) : undefined;
  });
  const selectedJobID = createMemo(() => selectedJob()?.id);
  const selectedJobStatus = createMemo(() => selectedJob()?.status);
  const active = createMemo(() => runningJobs().length + subagents().length);

  createEffect(() => {
    if (active() === 0) {
      setOpen(false);
      setSelectedID(undefined);
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(timer));
  });

  createEffect(() => {
    if (!open()) return;
    // Keep the escape target in the dependency set, like the reference handler.
    selectedID();
    const onPointerDown = (event: MouseEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (selectedID()) setSelectedID(undefined);
      else setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    const id = selectedJobID();
    const status = selectedJobStatus();
    if (!workspace || !sessionID || !id) {
      setOutput("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.jobOutput(workspace, sessionID, id);
        if (!cancelled) setOutput(result.output);
      } catch {
        // The pid may have ended and removed its file; the panel keeps its last tail.
      }
    };
    void load();
    if (status !== "running") {
      onCleanup(() => {
        cancelled = true;
      });
      return;
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 1000);
    onCleanup(() => {
      cancelled = true;
      window.clearInterval(timer);
    });
  });

  const openShell = (job: JobInfo) => {
    setSelectedID(job.id);
    setOutput("");
  };

  const openSubagent = (id: string) => {
    setOpen(false);
    setSelectedID(undefined);
    props.onOpenSubagent(id);
  };

  const stopJob = async (job: JobInfo) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setStopping(job.id);
    try {
      const updated = await api.cancelJob(workspace, sessionID, job.id);
      update(setJobs, jobs, (current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      notify(messageOf(error));
    } finally {
      setStopping(undefined);
    }
  };

  const stopSubagent = async (child: SessionSubagent) => {
    const workspace = props.workspace;
    if (!workspace) return;
    setStopping(child.id);
    try {
      await api.interrupt(workspace, child.id);
      update(setSubagents, subagents, (current) => current.filter((item) => item.id !== child.id));
    } catch (error) {
      notify(messageOf(error));
    } finally {
      setStopping(undefined);
    }
  };

  const shellCount = () => runningJobs().length;
  const subagentCount = () => subagents().length;
  const subagentsLabel = () => {
    const count = subagentCount();
    return count ? t(count === 1 ? "activitySubagentOne" : "activitySubagentMany", { count }) : "";
  };
  const shellsLabel = () => {
    const count = shellCount();
    return count ? t(count === 1 ? "activityShellOne" : "activityShellMany", { count }) : "";
  };
  const summary = () => {
    const children = subagentsLabel();
    const shells = shellsLabel();
    return children && shells
      ? t("activitySummary", { subagents: children, shells })
      : children || shells;
  };
  const tail = () =>
    stripAnsi(output())
      .replace(/\r\n?/g, "\n")
      .trimEnd()
      .split("\n")
      .slice(-TAIL_LINES)
      .join("\n");

  return (
    <Show when={props.workspace && props.sessionID && active() > 0}>
      <div
        data-component="session-activity-chips"
        class={`mx-auto flex w-full max-w-session shrink-0 px-4 pb-2 md:px-6 ${
          { left: "justify-start", center: "justify-center", right: "justify-end" }[align()]
        }`}
      >
        <div ref={root} class="relative min-w-0 shrink">
          <button
            type="button"
            data-slot="session-activity-chip"
            aria-label={summary()}
            aria-expanded={open()}
            data-expanded={open()}
            onClick={() => {
              setOpen(!open());
              setSelectedID(undefined);
            }}
            class="flex h-8 max-w-full min-w-0 items-center gap-2 rounded-lg border-[0.5px] border-transparent bg-bg-base px-3 text-body font-[440] leading-4 tracking-[-0.04px] whitespace-nowrap text-text-base shadow-elevation-raised outline-none hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-[2.5px] focus-visible:outline-border-focus active:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] dark:bg-bg-layer-01 data-[expanded=true]:bg-bg-layer-01 dark:data-[expanded=true]:bg-bg-layer-02"
          >
            <ActivityRing size={16} />
            <span class="min-w-0 truncate">{summary()}</span>
          </button>

          <Show when={open()}>
            <div
              data-slot="session-activity-panel"
              data-view={selectedJob() ? "shell" : "list"}
              role={selectedJob() ? "dialog" : "menu"}
              aria-label={summary()}
              class={`absolute bottom-full z-50 mb-2 flex flex-col overflow-hidden rounded-[10px] border-[0.5px] border-transparent bg-bg-layer-01 text-start shadow-elevation-floating ${
                {
                  left: "start-0",
                  center: "left-1/2 -translate-x-1/2",
                  right: "end-0",
                }[align()]
              } ${
                selectedJob()
                  ? "w-[min(560px,calc(100vw-56px))] max-h-[min(320px,70vh)] p-1"
                  : "max-h-[min(270px,70vh)] w-max min-w-[240px] max-w-[min(360px,calc(100vw-56px))] p-0"
              }`}
            >
              <Show
                when={selectedJob()}
                fallback={
                  <div class="min-h-0 flex-1 overflow-y-auto p-1">
                    <For each={subagents()}>
                      {(child) => (
                        <div
                          role="menuitem"
                          tabindex={0}
                          onClick={() => openSubagent(child.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Delete" || event.key === "Backspace") {
                              event.preventDefault();
                              void stopSubagent(child);
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openSubagent(child.id);
                            }
                          }}
                          class="group/activity flex min-h-7 cursor-default items-center gap-2 rounded-xs px-1.5 py-1 outline-none hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-border-focus"
                        >
                          <ActivityRing size={16} class="shrink-0 text-text-muted" />
                          <span class="shrink-0 font-[530] text-text-base">
                            <bdi>{agentLabel(child)}</bdi>
                          </span>
                          <span dir="auto" class="min-w-0 flex-1 truncate text-text-muted">
                            {subagentLabel(child)}
                          </span>
                          <ActivityEnd
                            elapsedText={elapsed(child.started, now())}
                            stopping={stopping() === child.id}
                            onStop={() => void stopSubagent(child)}
                          />
                        </div>
                      )}
                    </For>
                    <For each={runningJobs()}>
                      {(job) => (
                        <div
                          role="menuitem"
                          tabindex={0}
                          onClick={() => openShell(job)}
                          onKeyDown={(event) => {
                            if (event.key === "Delete" || event.key === "Backspace") {
                              event.preventDefault();
                              void stopJob(job);
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openShell(job);
                            }
                          }}
                          class="group/activity flex min-h-7 cursor-default items-center gap-2 rounded-xs px-1.5 py-1 outline-none hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-border-focus"
                        >
                          <Terminal class="size-4 shrink-0 text-text-muted" />
                          <span
                            dir="ltr"
                            class="min-w-0 flex-1 truncate font-mono text-[13px] leading-4 font-[440] tracking-[-0.04px] text-text-base"
                          >
                            {job.command}
                          </span>
                          <ActivityEnd
                            elapsedText={elapsed(job.started, now())}
                            stopping={stopping() === job.id}
                            onStop={() => void stopJob(job)}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                {(job) => (
                  <>
                    <div class="flex min-h-7 flex-none items-center gap-2 pe-0.5">
                      <button
                        type="button"
                        aria-label={t("activityBack")}
                        onClick={() => setSelectedID(undefined)}
                        class="grid size-7 shrink-0 place-items-center rounded-xs text-text-muted outline-none hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus"
                      >
                        <ArrowLeft class="size-4" />
                      </button>
                      <span
                        dir="ltr"
                        class="min-w-0 flex-1 truncate font-mono text-[13px] leading-4 font-[440] tracking-[-0.04px] text-text-base"
                      >
                        {job().command}
                      </span>
                      <span class="shrink-0 text-[11px] leading-4 tracking-normal whitespace-nowrap text-text-muted tabular-nums">
                        {elapsed(
                          job().started,
                          now(),
                          job().status === "running" ? undefined : job().finished || undefined,
                        )}
                      </span>
                      <Show
                        when={job().status === "running"}
                        fallback={
                          <span
                            role="status"
                            class={`shrink-0 px-1.5 text-[13px] leading-4 whitespace-nowrap ${statusTone(job())}`}
                          >
                            {statusLabel(job())}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          disabled={stopping() === job().id}
                          onClick={() => void stopJob(job())}
                          class="flex h-7 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-body leading-4 text-text-muted outline-none hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {stopping() === job().id ? t("activityStopping") : t("activityStop")}
                        </button>
                      </Show>
                    </div>
                    <div class="mt-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-md bg-bg-base px-3 py-2">
                      <Show
                        when={tail()}
                        fallback={
                          <span class="text-[13px] leading-4 text-text-muted">{t("activityNoOutput")}</span>
                        }
                      >
                        <pre dir="ltr" class="m-0 text-left">
                          <code class="block font-mono text-[13px] leading-4 font-[440] tracking-[-0.04px] whitespace-pre-wrap break-words text-text-base">
                            {tail()}
                          </code>
                        </pre>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}

function ActivityEnd(props: { elapsedText: string; stopping: boolean; onStop: () => void }) {
  return (
    <span class="relative ms-2 flex h-6 min-w-6 shrink-0 items-center justify-end">
      <span class="text-[11px] leading-4 tracking-normal whitespace-nowrap text-text-muted tabular-nums group-hover/activity:invisible group-focus-within/activity:invisible">
        {props.elapsedText}
      </span>
      <button
        type="button"
        tabindex={-1}
        aria-label={t("activityStop")}
        disabled={props.stopping}
        onClick={(event) => {
          event.stopPropagation();
          props.onStop();
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        class="invisible absolute inset-0 grid place-items-center rounded-xs text-text-muted outline-none hover:text-text-base group-hover/activity:visible group-focus-within/activity:visible disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Show when={props.stopping} fallback={<XMarkFilled class="size-3" />}>
          <ActivityRing size={12} />
        </Show>
      </button>
    </span>
  );
}
