import { Show, createMemo } from "solid-js";
import { useT } from "@lingzhu/ui/i18n";
import { ProgressCircle } from "@lingzhu/ui/ProgressCircle";
import { formatTokensCompact } from "@lingzhu/ui/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { CONTEXT_DANGER_PERCENT, type ContextUsage } from "../../lib/contextUsage";

/**
 * The header's session-context control: a usage ring, the prompt size and the
 * spend. Activating it opens the Details pane, which carries the full context
 * breakdown beside the transcript.
 */
export function SessionContextButton(props: {
  usage: ContextUsage;
  /** The Details pane is the one showing. */
  detailsOpen: boolean;
  onOpenDetails: () => void;
}) {
  const tr = useT();
  const percent = createMemo(() => Math.min(100, Math.max(0, props.usage.percent)));
  const label = () => tr("viewSessionDetails");

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label()}
        aria-expanded={props.detailsOpen}
        onClick={props.onOpenDetails}
        class="interactive flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-text-faint hover:text-text-base"
      >
        <ProgressCircle
          percentage={percent()}
          danger={percent() >= CONTEXT_DANGER_PERCENT}
          size={14}
          strokeWidth={2}
        />
        <span class="text-caption tabular-nums">{formatTokensCompact(props.usage.tokens)}</span>
        <Show when={props.usage.cost !== undefined}>
          <span aria-hidden="true" class="text-caption text-text-faint">
            ·
          </span>
          <span class="text-caption tabular-nums">${props.usage.cost?.toFixed(2)}</span>
        </Show>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label()}</TooltipContent>
    </Tooltip>
  );
}
