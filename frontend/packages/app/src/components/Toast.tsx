import { useEffect, useRef } from "react";
import { ArrowRight, Check, CircleAlert, Info, X } from "@lingzhu/ui/icons";
import type { NoticeTarget, ToastTone } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** A session the notice is about; the card offers a way back to it. */
  target?: NoticeTarget;
  onOpen?: (target: NoticeTarget) => void;
  onDone: () => void;
  holdMs?: number;
}

const GLYPH: Record<ToastTone, typeof Info> = {
  success: Check,
  info: Info,
  error: CircleAlert,
};

const ACCENT: Record<ToastTone, string> = {
  success: "text-state-fg-success",
  info: "text-state-fg-info",
  error: "text-state-fg-danger",
};

const SURFACE: Record<ToastTone, string> = {
  success: "bg-state-bg-success",
  info: "bg-state-bg-info",
  error: "bg-state-bg-danger",
};

/**
 * Transient notice anchored to the bottom-right corner: a floating card with a
 * tinted status glyph, a headline, one muted line of detail and, when it is
 * about a session, a way back to that conversation. The whole card is a click
 * target because a notice about a finished run exists to take the reader back
 * to the work. It pauses while the pointer or focus is inside, so it can be
 * read and clicked instead of disappearing under the cursor.
 */
export function Toast({ title, body, tone = "info", target, onOpen, onDone, holdMs = 6000 }: Props) {
  const tr = useT();
  const remaining = useRef(holdMs);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const paused = useRef(false);

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  const resume = () => {
    if (paused.current) return;
    startedAt.current = Date.now();
    clear();
    timer.current = window.setTimeout(onDone, remaining.current);
  };

  const pause = () => {
    paused.current = true;
    clear();
    remaining.current = Math.max(1200, remaining.current - (Date.now() - startedAt.current));
  };

  const release = () => {
    paused.current = false;
    resume();
  };

  useEffect(() => {
    remaining.current = holdMs;
    startedAt.current = Date.now();
    clear();
    timer.current = window.setTimeout(onDone, holdMs);
    return clear;
  }, [holdMs, onDone, title]);

  const Glyph = GLYPH[tone];
  const openable = Boolean(target && onOpen);

  const open = () => {
    if (!target || !onOpen) return;
    onOpen(target);
    onDone();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[1000] flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0">
      <div
        role="status"
        aria-live="polite"
        data-tone={tone}
        data-openable={openable ? "true" : undefined}
        onClick={openable ? open : undefined}
        onMouseEnter={pause}
        onMouseLeave={release}
        onFocus={pause}
        onBlur={release}
        className={`notice-arrive pointer-events-auto grid w-full max-w-[360px] grid-cols-[28px_minmax(0,1fr)_20px] items-start gap-3 rounded-xl border-[0.5px] border-border-weak bg-bg-layer-01 p-3 text-start shadow-elevation-floating ${
          openable ? "interactive cursor-pointer" : ""
        }`}
      >
        <span aria-hidden="true" className={`grid size-7 place-items-center rounded-lg ${SURFACE[tone]} ${ACCENT[tone]}`}>
          <Glyph className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="min-w-0 text-body leading-5 font-[530] tracking-[-0.04px] text-text-base [overflow-wrap:anywhere]">
            {title}
          </p>
          {body && (
            <p className="line-clamp-2 text-meta leading-4 text-text-muted [overflow-wrap:anywhere]">{body}</p>
          )}
          {openable && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
              className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-xs text-meta leading-4 font-[530] text-text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              {tr("noticeOpenSession")}
              <ArrowRight className="size-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={tr("jobsDismiss")}
          onClick={(event) => {
            event.stopPropagation();
            onDone();
          }}
          className="interactive grid size-5 place-items-center rounded-xs text-icon-faint hover:text-icon-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
