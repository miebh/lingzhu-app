import { cn } from "@lingzhu/ui/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Icon-only segments keep their natural width instead of splitting the track. */
  icon?: React.ReactNode;
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
  className?: string;
}

/**
 * Segmented control: a 28px `layer-01` track with a 0.5px hairline, and a
 * pressed segment painted `bg-base` with a stronger hairline, like the
 * reference control.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  compact,
  className,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex h-7 max-w-full flex-none items-center rounded-md bg-bg-layer-01 shadow-[0_0_0_0.5px_var(--color-border-base)]",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel ?? (option.label || undefined)}
            title={option.title ?? option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-body leading-none font-[440] tracking-[-0.04px] tabular-nums transition-colors",
              compact ? "w-9 flex-none px-0" : "flex-1",
              selected
                ? "bg-bg-base text-text-base shadow-[0_0_0_0.5px_var(--color-border-strong)]"
                : "text-text-muted hover:text-text-base",
            )}
          >
            {option.icon}
            {option.label && <span className="truncate">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
