import { cn } from "@lingzhu/ui/utils";

/** Keycap chips matching the reference keybind: 14px keys, 2px radius, 11/530. */
export function Keybind({
  keys,
  variant = "neutral",
  className,
}: {
  keys: string[];
  variant?: "neutral" | "ghost" | "outline";
  className?: string;
}) {
  return (
    <span
      data-component="keybind"
      data-variant={variant}
      className={cn("inline-flex shrink-0 flex-row items-center gap-0.5 tabular-nums", className)}
    >
      {keys.map((key) => (
        <span
          key={key}
          className={cn(
            "flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] px-1",
            variant === "neutral" && "bg-bg-layer-03",
            variant === "outline" && "shadow-[inset_0_0_0_1px_var(--color-border-strong)]",
            variant === "ghost" && "bg-transparent",
          )}
        >
          <span
            className={cn(
              "text-caption leading-none font-[530] tracking-[0.05px] uppercase",
              variant === "ghost" ? "text-text-faint" : "text-text-muted",
            )}
          >
            {key}
          </span>
        </span>
      ))}
    </span>
  );
}
