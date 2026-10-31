import { useEffect } from "react";
import { CircleAlert, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ToastTone = "error" | "info";

interface Props {
  text: string;
  tone?: ToastTone;
  onDone: () => void;
  holdMs?: number;
}

/** Transient top-center notice; the owner keeps it outside the surface that produced it. */
export function Toast({ text, tone = "error", onDone, holdMs = 6000 }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs, onDone, text]);

  const error = tone === "error";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-6">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-composer items-center gap-2 rounded-md border px-3 py-2 text-meta ${
          error
            ? "border-state-border-danger bg-state-bg-danger text-state-fg-danger"
            : "border-border-strong bg-bg-layer-02 text-text-base"
        }`}
      >
        {error ? <CircleAlert className="size-4 shrink-0" /> : <Info className="size-4 shrink-0" />}
        <span className="min-w-0 flex-1">{text}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={onDone}
          className="text-text-faint hover:text-text-base"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
