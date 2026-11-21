import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { Tooltip as TooltipPrimitive } from "@kobalte/core/tooltip";
import { cn } from "@lingzhu/ui/utils";

function TooltipProvider(props: { delayDuration?: number; children?: JSX.Element }) {
  // The reference uses a zero delay; a provider only carries it to its subtree.
  return <>{props.children}</>;
}

interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  openDelay?: number;
  closeDelay?: number;
  children?: JSX.Element;
}

function Tooltip(props: TooltipProps) {
  return <TooltipPrimitive data-slot="tooltip" openDelay={0} {...props} />;
}

function TooltipTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: any;
  variant?: string;
  size?: string;
}) {
  const [local, rest] = splitProps(props, ["class", "children", "type", "as"]);
  return (
    <TooltipPrimitive.Trigger
      as={local.as ?? "button"}
      type={local.type === "submit" || local.type === "reset" ? local.type : "button"}
      data-slot="tooltip-trigger"
      class={local.class}
      {...rest}
    >
      {local.children}
    </TooltipPrimitive.Trigger>
  );
}

interface TooltipContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  appearance?: "default" | "standard";
}

function TooltipContent(props: TooltipContentProps) {
  const [local, rest] = splitProps(props, ["class", "children", "side", "align", "sideOffset", "appearance"]);
  const placement = () => {
    const side = local.side ?? "top";
    const align = local.align ?? "center";
    return (align === "center" ? side : `${side}-${align}`) as never;
  };
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-appearance={local.appearance ?? "default"}
        placement={placement()}
        gutter={local.sideOffset ?? 6}
        class={cn(
          "pointer-events-none z-[1000] select-none",
          local.appearance === "standard"
            ? "block w-fit max-w-[320px] rounded-xs border border-border-muted bg-bg-float px-2 py-[2px] text-body leading-[1.5] font-[530] tracking-normal text-text-float shadow-elevation-floating select-text"
            : "tooltip-surface inline-flex w-fit items-center gap-1.5 rounded-xs bg-bg-layer-01 px-1.5 py-[5px] text-caption leading-3 font-[530] tracking-[0.05px] tabular-nums text-text-base shadow-elevation-floating has-data-[slot=kbd]:pr-1 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-xs",
          local.class,
        )}
        {...rest}
      >
        {local.children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
