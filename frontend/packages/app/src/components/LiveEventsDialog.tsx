import { useEffect, useMemo, useState } from "react";
import { Activity, Pause, Play, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { liveEventsExportName, serializeLiveEvents } from "../lib/eventsExport";
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
export function LiveEventsDialog({ open, workspace, name, onOpenChange, onOpenSession }: Props) {
  const tr = useT();
  const [events, setEvents] = useState<CoreEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<CoreEvent[]>();
  const [filter, setFilter] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEvents([]);
      setPaused(false);
      setFrozen(undefined);
      setFilter("");
      setSaved("");
      setSaving(false);
      return;
    }
    if (!workspace) return;
    const off = api.onEvent((event) => {
      if (event.workspace !== workspace) return;
      setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));
    });
    return off;
  }, [open, workspace]);

  const togglePause = () => {
    if (paused) {
      setPaused(false);
      setFrozen(undefined);
      return;
    }
    setFrozen(events);
    setPaused(true);
  };

  const shown = frozen ?? events;
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return shown;
    return shown.filter((event) => {
      if (event.type.toLowerCase().includes(needle)) return true;
      if (event.sessionId.toLowerCase().includes(needle)) return true;
      return preview(event.data).toLowerCase().includes(needle);
    });
  }, [shown, needle]);

  const saveVisible = async () => {
    if (!workspace || visible.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        liveEventsExportName(workspace, visible.length),
        serializeLiveEvents({ workspace, filter: filter.trim(), events: visible }),
      );
      if (path) setSaved(path);
    } catch (err) {
      setSaved(`Failed: ${messageOf(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Activity className="size-4 text-text-faint" />
              {tr("paletteLiveEvents")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {paused ? "paused" : "tailing"} · {shown.length} captured
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || visible.length === 0}
              onClick={() => void saveVisible()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={togglePause}>
              {paused ? <Play /> : <Pause />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEvents([]);
                if (paused) setFrozen([]);
              }}
            >
              <Trash2 />
              Clear
            </Button>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2">
          <input
            value={filter}
            aria-label={tr("liveEventsFilterLiveEvents")}
            placeholder={tr("liveEventsFilterByTypeSessionOrPayload")}
            onChange={(event) => setFilter(event.target.value)}
            className="h-control-sm min-w-0 flex-1 rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none placeholder:text-text-faint select-text"
          />
          <span className="shrink-0 text-caption tabular-nums text-text-faint">
            {visible.length}/{shown.length}
          </span>
        </div>

        {saved && (
          <p className="mt-2 shrink-0 truncate font-mono text-caption text-text-faint select-text">
            {saved.startsWith("Failed: ") ? (
              <span className="text-state-fg-danger">{saved}</span>
            ) : (
              <>Saved {saved}</>
            )}
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {visible.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {shown.length === 0 ? "Waiting for live events…" : "No events match the filter."}
            </p>
          ) : (
            visible.map((event) => (
              <div
                key={`${event.sessionId}:${event.seq}:${event.type}:${event.at}`}
                className="border-b border-border-base px-3 py-2 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-caption text-text-faint">
                  <span className="font-mono text-text-muted">{event.type}</span>
                  <span className="tabular-nums">#{event.seq}</span>
                  <span>{timeLabel(event.at)}</span>
                  {onOpenSession ? (
                    <button
                      type="button"
                      onClick={() => onOpenSession(event.sessionId)}
                      className="interactive ml-auto font-mono hover:text-text-base"
                      title={tr("jobsOverviewOpenSession")}
                    >
                      {event.sessionId}
                    </button>
                  ) : (
                    <span className="ml-auto font-mono">{event.sessionId}</span>
                  )}
                </div>
                {preview(event.data) && (
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                    {preview(event.data)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Live only, newest first, capped at {MAX_EVENTS}. Use Search events for durable history.
        </p>
      </DialogContent>
    </Dialog>
  );
}
