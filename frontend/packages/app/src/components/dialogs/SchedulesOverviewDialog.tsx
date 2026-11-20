import { useEffect, useState } from "react";
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
export function SchedulesOverviewDialog({ open, workspace, name, onOpenChange, onOpenSession }: Props) {
  const tr = useT();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.allSchedules(workspace));
    } catch (err) {
      setItems([]);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setItems([]);
      setError("");
      setBusy("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const toggle = async (item: ScheduleItem) => {
    if (!workspace) return;
    setBusy(item.id);
    try {
      const updated = await api.updateSchedule(workspace, item.id, {
        sessionId: item.sessionId,
        action: item.status === "paused" ? "resume" : "pause",
      });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const remove = async (item: ScheduleItem) => {
    if (!workspace) return;
    setBusy(item.id);
    try {
      await api.deleteSchedule(workspace, item.sessionId, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const active = items.filter((item) => item.status === "active").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4 text-text-faint" />
              Schedules
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {active} active · {items.length} total
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {items.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No schedules in this workspace."}
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                <Clock className="mt-0.5 size-4 shrink-0 text-text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-body text-text-base">{item.name || item.prompt}</span>
                    <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                      {item.status}
                    </span>
                    <span className="text-caption text-text-faint">{scheduleWhenLabel(item.when)}</span>
                    {onOpenSession && (
                      <button
                        type="button"
                        onClick={() => onOpenSession(item.sessionId)}
                        className="interactive truncate font-mono text-caption text-text-faint hover:text-text-base"
                        title={tr("jobsOverviewOpenSession")}
                      >
                        {item.sessionId}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-meta text-text-muted" title={item.prompt}>
                    {item.prompt}
                  </p>
                  <p className="mt-0.5 text-caption text-text-faint">
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
                  disabled={busy === item.id || item.status === "done"}
                  onClick={() => void toggle(item)}
                >
                  {item.status === "paused" ? <Play /> : <Pause />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={`Delete schedule ${item.name || item.id}`}
                  disabled={busy === item.id}
                  onClick={() => void remove(item)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          {tr("dialogSchedulesOverviewHint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
