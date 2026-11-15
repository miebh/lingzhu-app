import { useEffect } from "react";
import { CircleAlert, Info, X } from "@lingzhu/ui/icons";
import type { ToastTone } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  text: string;
  tone?: ToastTone;
  onDone: () => void;
  holdMs?: number;
}

/**
 * Transient top-center notice, laid out like the reference toast: a 320px
 * layer-01 card with a floating shadow, a 16px status icon, 13px copy and a
 * 20px dismiss button. The owner keeps it outside the surface that produced it.
 */
export function Toast({ text, tone = "error", onDone, holdMs = 5000 }: Props) {
  const tr = useT();
  useEffect(() => {
    const timer = window.setTimeout(onDone, holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs, onDone, text]);

  const error = tone === "error";
  const Glyph = error ? CircleAlert : Info;
  return (
    <div className="pointer-events-none fixed right-8 bottom-12 z-[1000] flex max-w-[min(320px,calc(100vw-64px))] select-none flex-col-reverse gap-3 max-sm:right-4 max-sm:bottom-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto grid max-h-[min(420px,calc(100dvh-96px))] w-80 max-w-full grid-cols-[16px_minmax(0,1fr)_20px] items-start gap-3 overflow-hidden rounded-lg bg-bg-layer-01 p-3 text-text-base shadow-elevation-floating"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-4 items-center justify-center text-icon-base"
        >
          <Glyph className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 truncate text-body leading-5 font-[530] tracking-[-0.04px]">{text}</span>
        <button
          type="button"
          aria-label={tr("jobsDismiss")}
          onClick={onDone}
          className="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-icon-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus active:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))]"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
