import { createEffect, createSignal, onCleanup } from "solid-js";
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
export function SyntheticDialog(props: Props) {
  const tr = useT();
  const [text, setText] = createSignal("");
  const [running, setRunning] = createSignal<boolean>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setText("");
      setRunning(undefined);
      setBusy(false);
      setError("");
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    let alive = true;
    api
      .environment(workspace, sessionID)
      .then((value) => {
        if (alive) setRunning(value.running);
      })
      .catch(() => undefined);
    onCleanup(() => {
      alive = false;
    });
  });

  const send = async () => {
    if (!props.workspace || !props.sessionID) return;
    const value = text().trim();
    if (!value) {
      setError("Text is required.");
      return;
    }
    setBusy(true);
    try {
      await api.synthetic(props.workspace, props.sessionID, value);
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex flex-col">
        <div>
          <DialogTitle class="flex items-center gap-2">
            <Sparkles class="size-4 text-text-faint" />
            {tr("dialogSyntheticMessage")}
          </DialogTitle>
          <DialogDescription class="truncate">
            {props.title ? `${props.title} · ` : ""}
            {running() === undefined
              ? tr("sessionStateUnknown")
              : running()
                ? tr("sessionRunning")
                : tr("sessionIdle")}
          </DialogDescription>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} />

        <Textarea
          autofocus
          value={text()}
          aria-label={tr("syntheticSyntheticText")}
          placeholder={tr("syntheticTextToInjectAsAnExternalEvent")}
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void send();
            }
          }}
          class="mt-4 min-h-32 select-text"
        />

        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="text-caption text-text-faint">
            Idle sessions start a synthetic turn; running sessions read it before the next model call.
          </p>
          <Button type="button" size="sm" disabled={busy()} onClick={() => void send()}>
            <Send />
            {busy() ? tr("sending") : tr("send")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
