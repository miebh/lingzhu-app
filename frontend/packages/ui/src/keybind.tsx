import { For } from "solid-js";
import { cn } from "@lingzhu/ui/utils";

/** Keycap chips matching the reference keybind: 14px keys, 2px radius, 11/530. */
export function Keybind(props: {
  keys: string[];
  variant?: "neutral" | "ghost" | "outline";
  class?: string;
}) {
  const variant = () => props.variant ?? "neutral";
  return (
    <span
      data-component="keybind"
      data-variant={variant()}
      class={cn("inline-flex shrink-0 flex-row items-center gap-0.5 tabular-nums", props.class)}
    >
      <For each={props.keys}>
        {(key) => (
          <span
            class={cn(
              "flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] px-1",
              variant() === "neutral" && "bg-bg-layer-03",
              variant() === "outline" && "shadow-[inset_0_0_0_1px_var(--color-border-strong)]",
              variant() === "ghost" && "bg-transparent",
            )}
          >
            <span
              class={cn(
                "text-caption leading-none font-[530] tracking-[0.05px] uppercase",
                variant() === "ghost" ? "text-text-faint" : "text-text-muted",
              )}
            >
              {key}
            </span>
          </span>
        )}
      </For>
    </span>
  );
}
