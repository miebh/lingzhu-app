import { Show, createEffect, createSignal } from "solid-js";
import { Copy, FileText } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  title?: string;
  text: string;
  loading: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
}

/** Shows the hidden summary agent's pull-request-style session summary. */
export function SummaryDialog(props: Props) {
  const tr = useT();
  const [copied, setCopied] = createSignal(false);

  createEffect(() => {
    if (!props.open) setCopied(false);
  });

  const copy = async () => {
    if (!props.text) return;
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex max-h-[70vh] flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <FileText class="size-4 text-text-faint" />
              {tr("dialogSessionSummary")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {tr("dialogSummaryHint")}
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!props.text} onClick={() => void copy()}>
            <Copy />
            {copied() ? tr("copied") : tr("copy")}
          </Button>
        </div>

        <ErrorBanner error={props.error} class="mt-3" />

        <Show
          when={!props.loading}
          fallback={<p class="mt-4 text-body text-text-muted">{tr("summarizing")}</p>}
        >
          <pre class="mt-4 min-h-24 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-text-base select-text">
            {props.text || "No summary returned."}
          </pre>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
