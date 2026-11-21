import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Copy, FileText } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { useT } from "@lingzhu/ui/i18n";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read-only view of the app's raw configuration file. */
export function ConfigFileDialog(props: Props) {
  const tr = useT();
  const [path, setPath] = createSignal("");
  const [content, setContent] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setPath("");
      setContent("");
      setError("");
      setNotice("");
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void api
      .readConfigFile()
      .then((file) => {
        if (!live) return;
        setPath(file.path);
        setContent(file.content);
        setError("");
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    onCleanup(() => {
      live = false;
    });
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content());
      setNotice(tr("copiedToClipboard"));
      window.setTimeout(() => setNotice(""), 1600);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  const reveal = async () => {
    if (!path()) return;
    try {
      await api.revealPath(path());
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <FileText class="size-4 text-text-faint" />
              {tr("configFileTitle")}
            </DialogTitle>
            <DialogDescription class="truncate font-mono">{path()}</DialogDescription>
          </div>
          <div class="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!content()} onClick={() => void copy()}>
              <Copy />
              {tr("copyAction")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!path()} onClick={() => void reveal()}>
              {tr("openInFileManager")}
            </Button>
          </div>
        </div>

        <Show when={error()}>
          <p class="mt-3 text-caption text-state-fg-danger">{error()}</p>
        </Show>
        <Show when={notice()}>
          <p class="mt-2 text-caption text-text-muted">{notice()}</p>
        </Show>

        <pre class="mt-3 min-h-24 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-text-base select-text">
          {loading() ? "Loading…" : content() || tr("configFileEmpty")}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
