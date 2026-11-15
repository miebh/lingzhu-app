import { useT } from "@lingzhu/ui/i18n";
import { ProgressCircle } from "@lingzhu/ui/ProgressCircle";
import { formatTokensCompact } from "@lingzhu/ui/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { CONTEXT_DANGER_PERCENT, type ContextUsage } from "../lib/contextUsage";

/**
 * The header's session-context control: a usage ring, the prompt size and the
 * spend. Activating it opens the Details pane, which carries the full context
 * breakdown beside the transcript.
 */
export function SessionContextButton({
  usage,
  detailsOpen,
  onOpenDetails,
}: {
  usage: ContextUsage;
  /** The Details pane is the one showing. */
  detailsOpen: boolean;
  onOpenDetails: () => void;
}) {
  const tr = useT();
  const percent = Math.min(100, Math.max(0, usage.percent));
  const label = tr("viewSessionDetails");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={detailsOpen}
          onClick={onOpenDetails}
          className="interactive flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-text-faint hover:text-text-base"
        >
          <ProgressCircle percentage={percent} danger={percent >= CONTEXT_DANGER_PERCENT} size={14} strokeWidth={2} />
          <span className="text-caption tabular-nums">{formatTokensCompact(usage.tokens)}</span>
          {usage.cost !== undefined && (
            <>
              <span aria-hidden="true" className="text-caption text-text-faint">
                ·
              </span>
              <span className="text-caption tabular-nums">${usage.cost.toFixed(2)}</span>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
