import { Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { contextPercent, formatCacheHit, formatTokens } from "@/lib/format";
import type { UsageTotals } from "@/lib/types";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  tokens: number;
  window: number;
  usage?: UsageTotals;
  /** Inline readings for the composer control row; no wrapping or margins. */
  inline?: boolean;
}

/** Context ring plus whole-run token and cache readings, as compact dock pills. */
export function ContextMeter({ tokens, window, usage, inline = false }: Props) {
  if (window <= 0 && usage === undefined) return null;
  const percent = contextPercent(tokens, window);
  const total =
    usage === undefined ? 0 : usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
  const cacheHit = usage === undefined ? null : formatCacheHit(usage);

  return (
    <div
      className={
        inline
          ? "flex min-w-0 items-center gap-2 text-caption text-text-faint"
          : "mt-2 flex flex-wrap items-center justify-center gap-3 text-caption text-text-faint"
      }
    >
      {window > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 cursor-default items-center gap-1.5 tabular-nums">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="shrink-0">
                <circle
                  cx="8"
                  cy="8"
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-border-strong"
                />
                <circle
                  cx="8"
                  cy="8"
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${(CIRCUMFERENCE * percent) / 100} ${CIRCUMFERENCE}`}
                  transform="rotate(-90 8 8)"
                  className="text-text-accent"
                />
              </svg>
              <span className="whitespace-nowrap">{percent}%</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {percent}% of context used · {formatTokens(tokens)} of {formatTokens(window)} tokens
          </TooltipContent>
        </Tooltip>
      )}

      {usage !== undefined && total > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex min-w-0 cursor-default items-center gap-1.5 tabular-nums">
              <Database className="size-3 shrink-0" />
              <span className="truncate whitespace-nowrap">{formatTokens(total)} tok</span>
              {cacheHit !== null && (
                <span className="truncate whitespace-nowrap text-text-faint">
                  · Cache hit {cacheHit}%
                </span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Input {formatTokens(usage.input)} · Cache read {formatTokens(usage.cacheRead)} · Output{" "}
            {formatTokens(usage.output)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
