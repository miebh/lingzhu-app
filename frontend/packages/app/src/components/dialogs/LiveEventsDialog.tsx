import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Activity, Pause, Play, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { liveEventsExportName, serializeLiveEvents } from "../../lib/eventsExport";
import type { CoreEvent } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
}

const MAX_EVENTS = 400;

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
}

function preview(data: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(data);
    return text === "{}" ? "" : text;
  } catch {
    return "";
  }
}

/**
 * Live tail of the core's all-session event stream. It reuses the feed the app
 * already follows for chat state, so opening the panel starts no extra SSE
 * connection; only live events are shown, history lives in Search events.
 */
export function LiveEventsDialog(props: Props) {
  const tr = useT();
  const [events, setEvents] = createSignal<CoreEvent[]>([]);
  const [paused, setPaused] = createSignal(false);
  const [frozen, setFrozen] = createSignal<CoreEvent[]>();
  const [filter, setFilter] = createSignal("");
  const [saved, setSaved] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) {
      setEvents([]);
      setPaused(false);
      setFrozen(undefined);
      setFilter("");
      setSaved("");
      setSaving(false);
      return;
    }
    const workspace = props.workspace;
    if (!workspace) return;
    const off = api.onEvent((event) => {
      if (event.workspace !== workspace) return;
      update(setEvents, events, (current) => [event, ...current].slice(0, MAX_EVENTS));
    });
    onCleanup(off);
  });

  const togglePause = () => {
    if (paused()) {
      setPaused(false);
      setFrozen(undefined);
      return;
    }
    setFrozen(events());
    setPaused(true);
  };

  const shown = () => frozen() ?? events();
  const needle = () => filter().trim().toLowerCase();
  const visible = createMemo(() => {
    const term = needle();
    const list = shown();
    if (!term) return list;
    return list.filter((event) => {
      if (event.type.toLowerCase().includes(term)) return true;
      if (event.sessionId.toLowerCase().includes(term)) return true;
      return preview(event.data).toLowerCase().includes(term);
    });
  });

  const saveVisible = async () => {
    const workspace = props.workspace;
    if (!workspace || visible().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        liveEventsExportName(workspace, visible().length),
        serializeLiveEvents({ workspace, filter: filter().trim(), events: visible() }),
      );
      if (path) setSaved(path);
    } catch (err) {
      setSaved(`Failed: ${messageOf(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Activity class="size-4 text-text-faint" />
              {tr("paletteLiveEvents")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {paused() ? "paused" : "tailing"} · {shown().length} captured
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || visible().length === 0}
              onClick={() => void saveVisible()}
            >
              <Save />
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={togglePause}>
              {paused() ? <Play /> : <Pause />}
              {paused() ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEvents([]);
                if (paused()) setFrozen([]);
              }}
            >
              <Trash2 />
              Clear
            </Button>
          </div>
        </div>

        <div class="mt-3 flex shrink-0 items-center gap-2">
          <input
            value={filter()}
            aria-label={tr("liveEventsFilterLiveEvents")}
            placeholder={tr("liveEventsFilterByTypeSessionOrPayload")}
            onInput={(event) => setFilter(event.currentTarget.value)}
            class="h-control-sm min-w-0 flex-1 rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none placeholder:text-text-faint select-text"
          />
          <span class="shrink-0 text-caption tabular-nums text-text-faint">
            {visible().length}/{shown().length}
          </span>
        </div>

        <Show when={saved()}>
          {(path) => (
            <p class="mt-2 shrink-0 truncate font-mono text-caption text-text-faint select-text">
              {path().startsWith("Failed: ") ? (
                <span class="text-state-fg-danger">{path()}</span>
              ) : (
                <>Saved {path()}</>
              )}
            </p>
          )}
        </Show>

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={visible().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {shown().length === 0 ? "Waiting for live events…" : "No events match the filter."}
              </p>
            }
          >
            <For each={visible()}>
              {(event) => (
                <div class="border-b border-border-base px-3 py-2 last:border-b-0">
                  <div class="flex flex-wrap items-center gap-2 text-caption text-text-faint">
                    <span class="font-mono text-text-muted">{event.type}</span>
                    <span class="tabular-nums">#{event.seq}</span>
                    <span>{timeLabel(event.at)}</span>
                    <Show
                      when={props.onOpenSession}
                      fallback={<span class="ml-auto font-mono">{event.sessionId}</span>}
                    >
                      {(openSession) => (
                        <button
                          type="button"
                          onClick={() => openSession()(event.sessionId)}
                          class="interactive ml-auto font-mono hover:text-text-base"
                          title={tr("jobsOverviewOpenSession")}
                        >
                          {event.sessionId}
                        </button>
                      )}
                    </Show>
                  </div>
                  <Show when={preview(event.data)}>
                    {(body) => (
                      <pre class="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                        {body()}
                      </pre>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Live only, newest first, capped at {MAX_EVENTS}. Use Search events for durable history.
        </p>
      </DialogContent>
    </Dialog>
  );
}
