import { For, Show, createEffect, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Clock, Pause, Play, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { ScheduleItem } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { scheduleWhenLabel } from "../../lib/schedules";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
}

/** All schedules of one workspace across sessions, with pause/resume/delete. */
export function SchedulesOverviewDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<ScheduleItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.allSchedules(props.workspace));
    } catch (err) {
      setItems([]);
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
      setItems([]);
      setError("");
      setBusy("");
    }
  });

  const toggle = async (item: ScheduleItem) => {
    if (!props.workspace) return;
    setBusy(item.id);
    try {
      const updated = await api.updateSchedule(props.workspace, item.id, {
        sessionId: item.sessionId,
        action: item.status === "paused" ? "resume" : "pause",
      });
      update(setItems, items, (current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const remove = async (item: ScheduleItem) => {
    if (!props.workspace) return;
    setBusy(item.id);
    try {
      await api.deleteSchedule(props.workspace, item.sessionId, item.id);
      update(setItems, items, (current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const active = () => items().filter((item) => item.status === "active").length;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Clock class="size-4 text-text-faint" />
              Schedules
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {active()} active · {items().length} total
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No schedules in this workspace."}
              </p>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                  <Clock class="mt-0.5 size-4 shrink-0 text-text-faint" />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="truncate text-body text-text-base">{item.name || item.prompt}</span>
                      <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                        {item.status}
                      </span>
                      <span class="text-caption text-text-faint">{scheduleWhenLabel(item.when)}</span>
                      <Show when={props.onOpenSession}>
                        {(openSession) => (
                          <button
                            type="button"
                            onClick={() => openSession()(item.sessionId)}
                            class="interactive truncate font-mono text-caption text-text-faint hover:text-text-base"
                            title={tr("jobsOverviewOpenSession")}
                          >
                            {item.sessionId}
                          </button>
                        )}
                      </Show>
                    </div>
                    <p class="mt-0.5 truncate text-meta text-text-muted" title={item.prompt}>
                      {item.prompt}
                    </p>
                    <p class="mt-0.5 text-caption text-text-faint">
                      {item.nextDueAt ? `Next ${formatDateTime(item.nextDueAt)}` : "No next run"}
                      {item.runCount > 0 ? ` · ${item.runCount} run${item.runCount === 1 ? "" : "s"}` : ""}
                      {item.lastError ? ` · ${item.lastError}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={item.status === "paused" ? "Resume schedule" : "Pause schedule"}
                    disabled={busy() === item.id || item.status === "done"}
                    onClick={() => void toggle(item)}
                  >
                    {item.status === "paused" ? <Play /> : <Pause />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Delete schedule ${item.name || item.id}`}
                    disabled={busy() === item.id}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </For>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          {tr("dialogSchedulesOverviewHint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
