import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { ChevronDown, ChevronRight, Copy, Save, ScrollText } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { logExportName, serializeLog } from "../../lib/logExport";
import type { SessionEvent } from "@lingzhu/ui/types";
import { formatTimeOfDay } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read-only durable event log of one session. */
export function LogDialog(props: Props) {
  const tr = useT();
  const [events, setEvents] = createSignal<SessionEvent[]>([]);
  const [filter, setFilter] = createSignal("");
  const [expanded, setExpanded] = createSignal<Record<number, boolean>>({});
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal<number>();
  const [afterSeq, setAfterSeq] = createSignal("0");
  const [replaying, setReplaying] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [tailing, setTailing] = createSignal(false);
  const [startingTail, setStartingTail] = createSignal(false);
  const [savingLog, setSavingLog] = createSignal(false);

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      setEvents(await api.sessionLog(workspace, sessionID));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setEvents([]);
      setFilter("");
      setExpanded({});
      setError("");
      setCopied(undefined);
      setAfterSeq("0");
      setReplaying(false);
      setNotice("");
      setTailing(false);
      setStartingTail(false);
      setSavingLog(false);
    }
  });

  createEffect(() => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!props.open || !tailing() || !workspace || !sessionID) return;
    const off = api.onSessionTail((payload) => {
      if (payload.workspace !== workspace || payload.sessionId !== sessionID) return;
      const event = payload.event;
      update(setEvents, events, (current) => {
        if (current.some((entry) => entry.seq === event.seq)) return current;
        const merged = [...current, event];
        merged.sort((a, b) => a.seq - b.seq);
        return merged;
      });
      setNotice(`Tailing · event #${event.seq}`);
    });
    onCleanup(() => {
      off();
      void api.stopSessionTail(workspace, sessionID);
    });
  });

  const startTail = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const after = events().reduce((max, event) => Math.max(max, event.seq), 0);
    setStartingTail(true);
    try {
      await api.startSessionTail(workspace, sessionID, after);
      setNotice("Tailing live events…");
      setError("");
      setTailing(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setStartingTail(false);
    }
  };

  const replay = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const parsed = Number(afterSeq());
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Sequence must be a non-negative number.");
      return;
    }
    setReplaying(true);
    setTailing(false);
    try {
      const page = await api.sessionEvents(workspace, sessionID, Math.floor(parsed));
      setEvents(page);
      setNotice(`Replayed ${page.length} event${page.length === 1 ? "" : "s"} after #${Math.floor(parsed)}`);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setReplaying(false);
    }
  };

  const visible = createMemo(() => {
    const term = filter().trim().toLowerCase();
    const list = events();
    if (!term) return list;
    return list.filter((event) => {
      if (event.type.toLowerCase().includes(term)) return true;
      try {
        return JSON.stringify(event.data ?? {}).toLowerCase().includes(term);
      } catch {
        return false;
      }
    });
  });

  const saveLog = async () => {
    const sessionID = props.sessionID;
    if (!sessionID || visible().length === 0) return;
    setSavingLog(true);
    try {
      const path = await api.saveTextFile(
        logExportName(sessionID, visible().length),
        serializeLog({ sessionId: sessionID, filter: filter().trim(), events: visible() }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSavingLog(false);
    }
  };

  const copy = async (event: SessionEvent) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
      setCopied(event.seq);
      window.setTimeout(() => setCopied(undefined), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <ScrollText class="size-4 text-text-faint" />
              Log
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {events().length} durable event{events().length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingLog() || visible().length === 0}
              onClick={() => void saveLog()}
            >
              <Save />
              {savingLog() ? tr("saving") : tr("dialogSaveFile")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <div class="mt-3 flex shrink-0 items-center gap-2">
          <Input
            value={filter()}
            aria-label={tr("logFilterEvents")}
            placeholder={tr("logFilterByTypeOrData")}
            onInput={(event) => setFilter(event.currentTarget.value)}
            class="select-text"
          />
          <span class="shrink-0 text-caption text-text-faint">
            {visible().length}/{events().length}
          </span>
        </div>

        <div class="mt-2 flex shrink-0 flex-wrap items-center gap-2">
          <Input
            value={afterSeq()}
            aria-label={tr("logReplayAfterSequence")}
            placeholder={tr("dialogAfterSeq")}
            onInput={(event) => setAfterSeq(event.currentTarget.value)}
            class="w-32 select-text font-mono"
          />
          <Button type="button" variant="outline" size="sm" disabled={replaying()} onClick={() => void replay()}>
            {replaying() ? tr("replaying") : tr("replayStream")}
          </Button>
          <Button
            type="button"
            variant={tailing() ? "default" : "outline"}
            size="sm"
            disabled={replaying() || startingTail()}
            onClick={() => (tailing() ? setTailing(false) : void startTail())}
          >
            {tailing() ? tr("stopTail") : startingTail() ? tr("startingNow") : tr("tail")}
          </Button>
          <Show when={notice()}>
            <span class="text-caption text-text-faint">{notice()}</span>
          </Show>
        </div>

        <ErrorBanner error={error()} />

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={visible().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("noEventsMatch")}
              </p>
            }
          >
            <For each={visible()}>
              {(event) => {
                const isOpen = () => Boolean(expanded()[event.seq]);
                return (
                  <div class="border-b border-border-base last:border-b-0">
                    <div class="flex items-center gap-2 px-2 py-1.5 text-meta">
                      <button
                        type="button"
                        aria-label={isOpen() ? tr("collapseEvent") : tr("expandEvent")}
                        onClick={() =>
                          update(setExpanded, expanded, (current) => ({ ...current, [event.seq]: !isOpen() }))
                        }
                        class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                      >
                        {isOpen() ? <ChevronDown class="size-3" /> : <ChevronRight class="size-3" />}
                      </button>
                      <span class="w-12 shrink-0 text-right font-mono text-caption tabular-nums text-text-faint">
                        {event.seq}
                      </span>
                      <span class="min-w-0 flex-1 truncate font-mono text-text-muted">{event.type}</span>
                      <span class="shrink-0 text-caption text-text-faint">{formatTimeOfDay(event.at)}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Copy event ${event.seq}`}
                        onClick={() => void copy(event)}
                      >
                        <Copy />
                      </Button>
                    </div>
                    <Show when={isOpen()}>
                      <pre class="max-h-80 overflow-auto border-t border-border-base bg-bg-layer-01 p-3 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                        {JSON.stringify(event.data ?? {}, null, 2)}
                      </pre>
                    </Show>
                    <Show when={copied() === event.seq}>
                      <p class="px-10 pb-1 text-caption text-text-faint">{tr("logCopiedEvent")}</p>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
