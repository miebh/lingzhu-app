import { useEffect, useState } from "react";
import { Send, Sparkles } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Textarea } from "@lingzhu/ui/textarea";
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

/** Injects externally produced text as a synthetic session event. */
export function SyntheticDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [text, setText] = useState("");
  const [running, setRunning] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setText("");
      setRunning(undefined);
      setBusy(false);
      setError("");
      setNotice("");
      return;
    }
    if (!workspace || !sessionID) return;
    let alive = true;
    api
      .environment(workspace, sessionID)
      .then((value) => {
        if (alive) setRunning(value.running);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, workspace, sessionID]);

  const send = async () => {
    if (!workspace || !sessionID) return;
    const value = text.trim();
    if (!value) {
      setError("Text is required.");
      return;
    }
    setBusy(true);
    try {
      await api.synthetic(workspace, sessionID, value);
      setText("");
      setError("");
      setNotice("Synthetic message delivered");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <div>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-text-faint" />
            {tr("dialogSyntheticMessage")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {title ? `${title} · ` : ""}
            {running === undefined ? "session state unknown" : running ? "session is running" : "session is idle"}
          </DialogDescription>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} />

        <Textarea
          autoFocus
          value={text}
          aria-label={tr("syntheticSyntheticText")}
          placeholder={tr("syntheticTextToInjectAsAnExternalEvent")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void send();
            }
          }}
          className="mt-4 min-h-32 select-text"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-caption text-text-faint">
            Idle sessions start a synthetic turn; running sessions read it before the next model call.
          </p>
          <Button type="button" size="sm" disabled={busy} onClick={() => void send()}>
            <Send />
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
