import { useEffect, useState } from "react";
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
export function SummaryDialog({ open, title, text, loading, error, onOpenChange }: Props) {
  const tr = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4 text-text-faint" />
              {tr("dialogSessionSummary")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {tr("dialogSummaryHint")}
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!text} onClick={() => void copy()}>
            <Copy />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <ErrorBanner error={error} className="mt-3" />

        {loading ? (
          <p className="mt-4 text-body text-text-muted">Summarizing…</p>
        ) : (
          <pre className="mt-4 min-h-24 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-text-base select-text">
            {text || "No summary returned."}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
