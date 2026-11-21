import type { JSX } from "solid-js";
import { For } from "solid-js";
import { cn } from "@lingzhu/ui/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Icon-only segments keep their natural width instead of splitting the track. */
  icon?: JSX.Element;
  /** Accessible name for an icon-only segment. */
  ariaLabel?: string;
  /** Native hover hint, matching the reference toolbar's delayed tooltip copy. */
  title?: string;
}

interface Props<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  /** Icon-only tracks size to their items, like the reference review toolbar. */
  compact?: boolean;
  class?: string;
}

/**
 * Segmented control: a 28px `layer-01` track with a 0.5px hairline, and a
 * pressed segment painted `bg-base` with a stronger hairline, like the
 * reference control.
 */
export function SegmentedControl<T extends string>(props: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      class={cn(
        "inline-flex h-7 max-w-full flex-none items-center rounded-md bg-bg-layer-01 shadow-[0_0_0_0.5px_var(--color-border-base)]",
        props.class,
      )}
    >
      <For each={props.options}>
        {(option) => {
          const selected = () => option.value === props.value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected()}
              aria-label={option.ariaLabel ?? (option.label || undefined)}
              title={option.title ?? option.ariaLabel}
              onClick={() => props.onChange(option.value)}
              class={cn(
                "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-body leading-none font-[440] tracking-[-0.04px] tabular-nums transition-colors",
                props.compact ? "w-9 flex-none px-0" : "flex-1",
                selected()
                  ? "bg-bg-base text-text-base shadow-[0_0_0_0.5px_var(--color-border-strong)]"
                  : "text-text-muted hover:text-text-base",
              )}
            >
              {option.icon}
              {option.label && <span class="truncate">{option.label}</span>}
            </button>
          );
        }}
      </For>
    </div>
  );
}
