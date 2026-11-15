import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Save, ScrollText } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { logExportName, serializeLog } from "../lib/logExport";
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
export function LogDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number>();
  const [afterSeq, setAfterSeq] = useState("0");
  const [replaying, setReplaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [tailing, setTailing] = useState(false);
  const [startingTail, setStartingTail] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  const load = async () => {
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

  useEffect(() => {
    if (open) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  useEffect(() => {
    if (!open || !tailing || !workspace || !sessionID) return;
    const off = api.onSessionTail((payload) => {
      if (payload.workspace !== workspace || payload.sessionId !== sessionID) return;
      const event = payload.event;
      setEvents((current) => {
        if (current.some((entry) => entry.seq === event.seq)) return current;
        const merged = [...current, event];
        merged.sort((a, b) => a.seq - b.seq);
        return merged;
      });
      setNotice(`Tailing · event #${event.seq}`);
    });
    return () => {
      off();
      void api.stopSessionTail(workspace, sessionID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tailing, workspace, sessionID]);

  const startTail = async () => {
    if (!workspace || !sessionID) return;
    const after = events.reduce((max, event) => Math.max(max, event.seq), 0);
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
    if (!workspace || !sessionID) return;
    const parsed = Number(afterSeq);
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

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return events;
    return events.filter((event) => {
      if (event.type.toLowerCase().includes(term)) return true;
      try {
        return JSON.stringify(event.data ?? {}).toLowerCase().includes(term);
      } catch {
        return false;
      }
    });
  }, [events, filter]);

  const saveLog = async () => {
    if (!sessionID || visible.length === 0) return;
    setSavingLog(true);
    try {
      const path = await api.saveTextFile(
        logExportName(sessionID, visible.length),
        serializeLog({ sessionId: sessionID, filter: filter.trim(), events: visible }),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-text-faint" />
              Log
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {events.length} durable event{events.length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingLog || visible.length === 0}
              onClick={() => void saveLog()}
            >
              <Save />
              {savingLog ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2">
          <Input
            value={filter}
            aria-label={tr("logFilterEvents")}
            placeholder={tr("logFilterByTypeOrData")}
            onChange={(event) => setFilter(event.target.value)}
            className="select-text"
          />
          <span className="shrink-0 text-caption text-text-faint">
            {visible.length}/{events.length}
          </span>
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
          <Input
            value={afterSeq}
            aria-label={tr("logReplayAfterSequence")}
            placeholder={tr("dialogAfterSeq")}
            onChange={(event) => setAfterSeq(event.target.value)}
            className="w-32 select-text font-mono"
          />
          <Button type="button" variant="outline" size="sm" disabled={replaying} onClick={() => void replay()}>
            {replaying ? "Replaying…" : "Replay stream"}
          </Button>
          <Button
            type="button"
            variant={tailing ? "default" : "outline"}
            size="sm"
            disabled={replaying || startingTail}
            onClick={() => (tailing ? setTailing(false) : void startTail())}
          >
            {tailing ? "Stop tail" : startingTail ? "Starting…" : "Tail"}
          </Button>
          {notice && <span className="text-caption text-text-faint">{notice}</span>}
        </div>

        <ErrorBanner error={error} />

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {visible.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No events match."}
            </p>
          ) : (
            visible.map((event) => {
              const isOpen = Boolean(expanded[event.seq]);
              return (
                <div key={`${event.seq}:${event.type}`} className="border-b border-border-base last:border-b-0">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-meta">
                    <button
                      type="button"
                      aria-label={isOpen ? "Collapse event" : "Expand event"}
                      onClick={() =>
                        setExpanded((current) => ({ ...current, [event.seq]: !isOpen }))
                      }
                      className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </button>
                    <span className="w-12 shrink-0 text-right font-mono text-caption tabular-nums text-text-faint">
                      {event.seq}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-text-muted">{event.type}</span>
                    <span className="shrink-0 text-caption text-text-faint">{formatTimeOfDay(event.at)}</span>
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
                  {isOpen && (
                    <pre className="max-h-80 overflow-auto border-t border-border-base bg-bg-layer-01 p-3 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                      {JSON.stringify(event.data ?? {}, null, 2)}
                    </pre>
                  )}
                  {copied === event.seq && (
                    <p className="px-10 pb-1 text-caption text-text-faint">Copied event JSON.</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
