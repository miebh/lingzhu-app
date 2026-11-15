"use client"

import * as React from "react"
import { cn } from "@lingzhu/ui/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  // A tooltip may be rendered on its own (outside the app's provider), so each
  // root carries the same zero-delay provider the shell uses.
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  appearance = "default",
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  appearance?: "default" | "standard"
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-appearance={appearance}
        sideOffset={sideOffset}
        className={cn(
          "pointer-events-none z-[1000] origin-(--radix-tooltip-content-transform-origin) select-none",
          appearance === "standard"
            ? "block w-fit max-w-[320px] rounded-xs border border-border-muted bg-bg-float px-2 py-[2px] text-body leading-[1.5] font-[530] tracking-normal text-text-float shadow-elevation-floating select-text"
            : "tooltip-surface inline-flex w-fit items-center gap-1.5 rounded-xs bg-bg-layer-01 px-1.5 py-[5px] text-caption leading-3 font-[530] tracking-[0.05px] tabular-nums text-text-base shadow-elevation-floating has-data-[slot=kbd]:pr-1 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-xs",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
