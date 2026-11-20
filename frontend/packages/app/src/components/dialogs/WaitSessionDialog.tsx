import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Blocks until the session has no active turn, with a bounded timeout. */
export function WaitSessionDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [timeoutValue, setTimeoutValue] = useState("30000");
  const [running, setRunning] = useState<boolean>();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshState = async () => {
    if (!workspace || !sessionID) return;
    try {
      const env = await api.environment(workspace, sessionID);
      setRunning(env.running);
    } catch {
      setRunning(undefined);
    }
  };

  useEffect(() => {
    if (!open) {
      setTimeoutValue("30000");
      setRunning(undefined);
      setWaiting(false);
      setError("");
      setNotice("");
      return;
    }
    void refreshState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const wait = async () => {
    if (!workspace || !sessionID) return;
    const parsed = Number(timeoutValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Timeout must be a non-negative number of milliseconds.");
      return;
    }
    setWaiting(true);
    setNotice("");
    try {
      const bounded = Math.min(Math.floor(parsed), 120_000);
      await api.waitSession(workspace, sessionID, bounded);
      setRunning(false);
      setNotice("Session is idle");
      setError("");
    } catch (err) {
      setError(messageOf(err));
      await refreshState();
    } finally {
      setWaiting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4 text-text-faint" />
              {tr("paletteWait")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {running === undefined ? "state unknown" : running ? "running now" : "idle now"}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={waiting}
            onClick={() => void refreshState()}
          >
            <RefreshCw className={waiting ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} />

        <label className="mt-4 flex flex-col gap-1 text-caption text-text-faint">
          Timeout (ms)
          <Input
            value={timeoutValue}
            aria-label={tr("waitSessionWaitTimeout")}
            onChange={(event) => setTimeoutValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void wait();
              }
            }}
            className="select-text font-mono"
          />
        </label>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-caption text-text-faint">
            0 waits for the server default (30s); the maximum is 120s. Timeout returns an error.
          </p>
          <Button type="button" size="sm" disabled={waiting} onClick={() => void wait()}>
            {waiting ? "Waiting…" : "Wait"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
