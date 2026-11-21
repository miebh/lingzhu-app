import { createEffect, createSignal } from "solid-js";
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
export function WaitSessionDialog(props: Props) {
  const tr = useT();
  const [timeoutValue, setTimeoutValue] = createSignal("30000");
  const [running, setRunning] = createSignal<boolean>();
  const [waiting, setWaiting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const refreshState = async () => {
    if (!props.workspace || !props.sessionID) return;
    try {
      const env = await api.environment(props.workspace, props.sessionID);
      setRunning(env.running);
    } catch {
      setRunning(undefined);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setTimeoutValue("30000");
      setRunning(undefined);
      setWaiting(false);
      setError("");
      setNotice("");
      return;
    }
    void props.workspace;
    void props.sessionID;
    void refreshState();
  });

  const wait = async () => {
    if (!props.workspace || !props.sessionID) return;
    const parsed = Number(timeoutValue());
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Timeout must be a non-negative number of milliseconds.");
      return;
    }
    setWaiting(true);
    setNotice("");
    try {
      const bounded = Math.min(Math.floor(parsed), 120_000);
      await api.waitSession(props.workspace, props.sessionID, bounded);
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Clock class="size-4 text-text-faint" />
              {tr("paletteWait")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {running() === undefined ? "state unknown" : running() ? "running now" : "idle now"}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={waiting()}
            onClick={() => void refreshState()}
          >
            <RefreshCw class={waiting() ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} />

        <label class="mt-4 flex flex-col gap-1 text-caption text-text-faint">
          Timeout (ms)
          <Input
            value={timeoutValue()}
            aria-label={tr("waitSessionWaitTimeout")}
            onInput={(event) => setTimeoutValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void wait();
              }
            }}
            class="select-text font-mono"
          />
        </label>

        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="text-caption text-text-faint">
            0 waits for the server default (30s); the maximum is 120s. Timeout returns an error.
          </p>
          <Button type="button" size="sm" disabled={waiting()} onClick={() => void wait()}>
            {waiting() ? "Waiting…" : "Wait"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
